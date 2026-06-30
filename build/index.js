#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { lookupCip } from "./cip-codes.js";
import { decodeOwnership, decodeLocale, decodeCarnegie, fmt, fmtPct } from "./school-decoders.js";
import { fetchSchoolsByName } from "./scorecard.js";
const SCORECARD_API_KEY = process.env.COLLEGE_SCORECARD_API_KEY ?? "";
const CAREERONESTOP_USER_ID = process.env.CAREERONESTOP_USER_ID ?? "";
const CAREERONESTOP_TOKEN = process.env.CAREERONESTOP_TOKEN ?? "";
const server = new McpServer({
    name: "college-aid-mcp",
    version: "0.1.0",
});
// ── CareerOneStop helpers ─────────────────────────────────────────────────────
function cosHeaders() {
    return {
        Authorization: `Bearer ${CAREERONESTOP_TOKEN}`,
        "Content-Type": "application/json",
    };
}
async function fetchOccupationDetail(socCode, location) {
    const url = `https://api.careeronestop.org/v1/occupationdetails/${CAREERONESTOP_USER_ID}/${encodeURIComponent(socCode)}/${location}`;
    const res = await fetch(url, { headers: cosHeaders() });
    if (!res.ok)
        return null;
    return res.json();
}
function annualWages(list) {
    return list?.find((w) => w.RateType?.toLowerCase() === "annual") ?? null;
}
function fmtWage(n) {
    if (n == null)
        return "N/A";
    return `$${Number(n).toLocaleString()}`;
}
function brightLabel(v) {
    if (v == null)
        return "";
    if (v === true || String(v).toLowerCase() === "true" || String(v).toLowerCase() === "yes")
        return " ✦ Bright Outlook";
    return "";
}
// ── search_careers ────────────────────────────────────────────────────────────
server.tool("search_careers", "Search careers by job title or keyword. Returns salary percentiles (P25/median/P75/P90), bright job outlook flag, typical education required, and top job tasks — all from CareerOneStop/O*NET. Pairs with estimate_loan_repayment to connect college debt to realistic post-graduation salaries.", {
    keyword: z.string().describe("Job title or career keyword, e.g. 'software engineer', 'registered nurse', 'data analyst', 'mechanical engineer'"),
    state: z.string().optional().describe("Two-letter state code for location-specific wages, e.g. 'WA'. Omit for national data."),
    limit: z.number().min(1).max(5).default(3).describe("Number of occupations to return (max 5)"),
}, async ({ keyword, state, limit }) => {
    if (!CAREERONESTOP_USER_ID || !CAREERONESTOP_TOKEN) {
        return {
            content: [{ type: "text", text: "Missing CAREERONESTOP_USER_ID or CAREERONESTOP_TOKEN. Register free at https://api.careeronestop.org/api-explorer/" }],
        };
    }
    const location = state ?? "";
    const searchUrl = `https://api.careeronestop.org/v1/occupation/${CAREERONESTOP_USER_ID}/${encodeURIComponent(keyword)}/${location}/true/${limit}`;
    const searchRes = await fetch(searchUrl, { headers: cosHeaders() });
    if (!searchRes.ok) {
        return { content: [{ type: "text", text: `CareerOneStop search error: ${searchRes.status} ${searchRes.statusText}` }] };
    }
    const searchData = (await searchRes.json());
    const occupations = searchData.OccupationList ?? [];
    if (occupations.length === 0) {
        return { content: [{ type: "text", text: `No occupations found for "${keyword}". Try a different job title or keyword.` }] };
    }
    // Fetch details for all matches in parallel
    const details = await Promise.all(occupations.slice(0, limit).map((occ) => fetchOccupationDetail(occ.OnetCode, location)));
    const sections = details
        .map((detail, i) => {
        const occ = occupations[i];
        if (!detail)
            return `### ${occ.OnetTitle}\n  (Details unavailable)`;
        const national = annualWages(detail.Wages?.NationalWagesList);
        const stateWage = state ? annualWages(detail.Wages?.StateWagesList) : null;
        const descSnippet = detail.OnetDescription
            ? String(detail.OnetDescription).slice(0, 220) + (String(detail.OnetDescription).length > 220 ? "…" : "")
            : "";
        // Top education requirement (highest % or most common)
        const edTypes = detail.EducationTraining?.EducationType ?? [];
        const topEd = edTypes.sort((a, b) => (b.Percentage ?? 0) - (a.Percentage ?? 0))[0];
        const edStr = topEd?.EducationLevel ?? "N/A";
        // Top 3 tasks
        const tasks = (detail.Tasks ?? []).slice(0, 3).map((t) => `  - ${t.TaskDescription}`).join("\n");
        const lines = [
            `### ${detail.OnetTitle ?? occ.OnetTitle}${brightLabel(detail.BrightOutlook)}`,
            `SOC: ${detail.OnetCode ?? occ.OnetCode}`,
            descSnippet ? `\n${descSnippet}` : "",
            `\n**National salary (annual)**`,
            `  P25: ${fmtWage(national?.Pct25)}  |  Median: ${fmtWage(national?.Median)}  |  P75: ${fmtWage(national?.Pct75)}  |  P90: ${fmtWage(national?.Pct90)}`,
        ];
        if (stateWage) {
            lines.push(`**${state} salary (annual)**`);
            lines.push(`  P25: ${fmtWage(stateWage.Pct25)}  |  Median: ${fmtWage(stateWage.Median)}  |  P75: ${fmtWage(stateWage.Pct75)}  |  P90: ${fmtWage(stateWage.Pct90)}`);
        }
        lines.push(`\nTypical education: ${edStr}`);
        if (tasks) {
            lines.push(`\nKey tasks:\n${tasks}`);
        }
        return lines.filter(Boolean).join("\n");
    });
    return { content: [{ type: "text", text: sections.join("\n\n---\n\n") }] };
});
// ── College Scorecard ─────────────────────────────────────────────────────────
server.tool("search_colleges", "Search colleges by name, state, or degree type. Returns tuition, median debt, median earnings, graduation rate, and admission rate for each match.", {
    query: z.string().optional().describe("School name or keyword (optional)"),
    state: z.string().optional().describe("Two-letter state code, e.g. 'WA'"),
    degree_type: z
        .enum(["associate", "bachelor", "graduate"])
        .optional()
        .describe("Degree type to filter by"),
    max_tuition: z
        .number()
        .optional()
        .describe("Maximum in-state tuition per year (USD)"),
    limit: z.number().min(1).max(20).default(10).describe("Number of results"),
}, async ({ query, state, degree_type, max_tuition, limit }) => {
    if (!SCORECARD_API_KEY) {
        return {
            content: [
                {
                    type: "text",
                    text: "Missing COLLEGE_SCORECARD_API_KEY. Get a free key at https://api.data.gov/signup/",
                },
            ],
        };
    }
    const fields = [
        "school.name",
        "school.city",
        "school.state",
        "school.school_url",
        "latest.admissions.admission_rate.overall",
        "latest.cost.tuition.in_state",
        "latest.cost.tuition.out_of_state",
        "latest.aid.median_debt.completers.overall",
        "latest.earnings.10_yrs_after_entry.median",
        "latest.completion.completion_rate_4yr_150nt",
        "latest.student.size",
    ].join(",");
    const params = new URLSearchParams({
        api_key: SCORECARD_API_KEY,
        fields,
        per_page: String(limit),
        _sort: "latest.student.size:desc",
    });
    if (query)
        params.set("school.name", query);
    if (state)
        params.set("school.state", state);
    if (degree_type === "associate")
        params.set("school.degrees_awarded.predominant", "2");
    if (degree_type === "bachelor")
        params.set("school.degrees_awarded.predominant", "3");
    if (degree_type === "graduate")
        params.set("school.degrees_awarded.predominant", "4");
    if (max_tuition)
        params.set("latest.cost.tuition.in_state__range", `..${max_tuition}`);
    const url = `https://api.data.gov/ed/collegescorecard/v1/schools?${params}`;
    const res = await fetch(url);
    if (!res.ok) {
        return {
            content: [{ type: "text", text: `College Scorecard API error: ${res.status} ${res.statusText}` }],
        };
    }
    const data = (await res.json());
    const results = data.results ?? [];
    if (results.length === 0) {
        return { content: [{ type: "text", text: "No colleges found matching your criteria." }] };
    }
    const formatted = results.map((r) => {
        const name = r["school.name"] ?? "Unknown";
        const city = r["school.city"] ?? "";
        const st = r["school.state"] ?? "";
        const url = r["school.school_url"] ?? "";
        const admRate = r["latest.admissions.admission_rate.overall"];
        const tuitionIn = r["latest.cost.tuition.in_state"];
        const tuitionOut = r["latest.cost.tuition.out_of_state"];
        const debt = r["latest.aid.median_debt.completers.overall"];
        const earnings = r["latest.earnings.10_yrs_after_entry.median"];
        const gradRate = r["latest.completion.completion_rate_4yr_150nt"];
        return [
            `### ${name}`,
            `${city}, ${st}${url ? ` — ${url}` : ""}`,
            `Admission rate: ${admRate != null ? `${(Number(admRate) * 100).toFixed(1)}%` : "N/A"}`,
            `In-state tuition: ${tuitionIn != null ? `$${Number(tuitionIn).toLocaleString()}` : "N/A"}`,
            `Out-of-state tuition: ${tuitionOut != null ? `$${Number(tuitionOut).toLocaleString()}` : "N/A"}`,
            `Median debt at graduation: ${debt != null ? `$${Number(debt).toLocaleString()}` : "N/A"}`,
            `Median earnings 10 yrs after entry: ${earnings != null ? `$${Number(earnings).toLocaleString()}` : "N/A"}`,
            `4-year graduation rate: ${gradRate != null ? `${(Number(gradRate) * 100).toFixed(1)}%` : "N/A"}`,
        ].join("\n");
    });
    return {
        content: [{ type: "text", text: formatted.join("\n\n") }],
    };
});
// ── CareerOneStop Scholarship Finder ─────────────────────────────────────────
server.tool("search_scholarships", "Search 9,500+ scholarships and grants from the US Dept of Labor CareerOneStop database. Filter by keyword, state, study level, or major.", {
    keyword: z.string().optional().describe("Keyword to search scholarships by (e.g. 'engineering', 'STEM', 'first generation')"),
    state: z.string().optional().describe("Two-letter state code to find scholarships restricted to that state, e.g. 'WA'"),
    study_level: z
        .enum(["high_school", "undergraduate", "graduate", "vocational"])
        .optional()
        .describe("Education level the scholarship is for"),
    limit: z.number().min(1).max(20).default(10).describe("Number of results"),
}, async ({ keyword, state, study_level, limit }) => {
    if (!CAREERONESTOP_USER_ID || !CAREERONESTOP_TOKEN) {
        return {
            content: [
                {
                    type: "text",
                    text: "Missing CAREERONESTOP_USER_ID or CAREERONESTOP_TOKEN. Register free at https://api.careeronestop.org/api-explorer/",
                },
            ],
        };
    }
    const levelMap = {
        high_school: "High School",
        undergraduate: "Bachelor's",
        graduate: "Graduate",
        vocational: "Vocational",
    };
    const params = new URLSearchParams({
        keyword: keyword ?? "",
        location: state ?? "",
        StudyLevelFilter: study_level ? levelMap[study_level] : "",
        numberOfResults: String(limit),
    });
    const url = `https://api.careeronestop.org/v1/scholarship/${CAREERONESTOP_USER_ID}?${params}`;
    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${CAREERONESTOP_TOKEN}`,
            "Content-Type": "application/json",
        },
    });
    if (!res.ok) {
        return {
            content: [{ type: "text", text: `CareerOneStop API error: ${res.status} ${res.statusText}` }],
        };
    }
    const data = (await res.json());
    const list = data.ScholarshipList ?? [];
    if (list.length === 0) {
        return { content: [{ type: "text", text: "No scholarships found matching your criteria." }] };
    }
    const formatted = list.map((s) => {
        const name = s["ScholarshipName"] ?? "Unknown";
        const amount = s["AwardAmount"] ?? s["AwardAmountText"] ?? "Varies";
        const deadline = s["Deadline"] ?? "See website";
        const provider = s["ProviderName"] ?? "";
        const description = s["Description"] ?? "";
        const link = s["ScholarshipURL"] ?? "";
        return [
            `### ${name}`,
            provider ? `Provider: ${provider}` : "",
            `Award: ${amount}`,
            `Deadline: ${deadline}`,
            description ? `\n${String(description).slice(0, 200)}${String(description).length > 200 ? "..." : ""}` : "",
            link ? `URL: ${link}` : "",
        ]
            .filter(Boolean)
            .join("\n");
    });
    return {
        content: [{ type: "text", text: formatted.join("\n\n") }],
    };
});
// ── estimate_loan_repayment ───────────────────────────────────────────────────
// 2024 federal poverty guidelines (lower 48 + DC)
const FPL_BASE = 15060;
const FPL_PER_PERSON = 5380;
function monthlyPayment(principal, annualRate, months) {
    const r = annualRate / 12;
    if (r === 0)
        return principal / months;
    return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}
function simulateIdr(principal, annualRate, monthlyPayment, forgivenessMonths, interestSubsidy) {
    const r = annualRate / 12;
    let balance = principal;
    let totalPaid = 0;
    for (let month = 1; month <= forgivenessMonths; month++) {
        const interest = balance * r;
        const payment = Math.min(monthlyPayment, balance + interest);
        totalPaid += payment;
        if (interestSubsidy && monthlyPayment < interest) {
            // Govt covers unpaid interest — balance stays flat
        }
        else {
            balance = balance + interest - payment;
        }
        if (balance <= 0)
            return { totalPaid, forgiven: 0, paidOffMonth: month };
    }
    return { totalPaid, forgiven: Math.max(0, balance), paidOffMonth: null };
}
server.tool("estimate_loan_repayment", "Calculate monthly payments, total interest, and payoff timeline across repayment plans (standard 10-year, extended 25-year, income-driven with forgiveness). Works standalone or pairs naturally with get_college_details and search_by_major to turn debt numbers into concrete repayment scenarios.", {
    loan_amount: z.number().positive().describe("Total loan balance in USD (e.g. 25000)"),
    annual_income: z.number().positive().describe("Expected annual gross income in USD after graduation — used for income-driven repayment calculation"),
    interest_rate: z.number().min(0).max(20).default(6.53).describe("Annual interest rate as a percentage (default: 6.53%, the 2024–25 federal undergraduate rate)"),
    household_size: z.number().int().min(1).max(8).default(1).describe("Household size for IDR poverty line calculation (default: 1)"),
}, async ({ loan_amount, annual_income, interest_rate, household_size }) => {
    const rate = interest_rate / 100;
    const povertyLine = FPL_BASE + FPL_PER_PERSON * (household_size - 1);
    // ── Standard 10-year ──────────────────────────────────────────────────────
    const stdMonthly = monthlyPayment(loan_amount, rate, 120);
    const stdTotal = stdMonthly * 120;
    const stdInterest = stdTotal - loan_amount;
    // ── Extended 25-year ─────────────────────────────────────────────────────
    const extMonthly = monthlyPayment(loan_amount, rate, 300);
    const extTotal = extMonthly * 300;
    const extInterest = extTotal - loan_amount;
    // ── Income-driven repayment (IDR) ─────────────────────────────────────────
    // 10% of discretionary income (income above 150% FPL), forgiveness at 20yr
    const discretionary = Math.max(0, annual_income - 1.5 * povertyLine);
    const idrMonthly = discretionary * 0.10 / 12;
    const idr = simulateIdr(loan_amount, rate, idrMonthly, 240, true);
    // ── Debt-to-income health check ───────────────────────────────────────────
    const grossMonthly = annual_income / 12;
    const stdDti = (stdMonthly / grossMonthly) * 100;
    const idrDti = (idrMonthly / grossMonthly) * 100;
    function dtiRating(pct) {
        if (pct <= 10)
            return "healthy";
        if (pct <= 15)
            return "manageable";
        if (pct <= 20)
            return "tight";
        return "high — consider IDR";
    }
    // ── Recommendation ────────────────────────────────────────────────────────
    let recommendation;
    if (idrMonthly >= stdMonthly) {
        recommendation = `Your income is high relative to your debt — standard repayment saves the most in total interest (${fmt(stdInterest)} vs ${fmt(extInterest)} on extended). IDR would actually cost more per month here.`;
    }
    else if (idr.forgiven > 0) {
        const idrSavings = stdTotal - idr.totalPaid;
        recommendation = `IDR gives you the lowest monthly payment. With $${idr.forgiven.toLocaleString(undefined, { maximumFractionDigits: 0 })} forgiven after 20 years, you'd pay $${idr.totalPaid.toLocaleString(undefined, { maximumFractionDigits: 0 })} total — ${idrSavings > 0 ? `saving $${idrSavings.toLocaleString(undefined, { maximumFractionDigits: 0 })} vs standard` : `$${Math.abs(idrSavings).toLocaleString(undefined, { maximumFractionDigits: 0 })} more than standard but with lower monthly burden`}. Note: forgiven amounts may be taxable.`;
    }
    else {
        recommendation = `IDR pays off in ${idr.paidOffMonth} months (~${(idr.paidOffMonth / 12).toFixed(1)} years) — faster than standard because your income-driven payment exceeds standard. Standard repayment is equally good and simpler.`;
    }
    const lines = [
        `## Loan Repayment Estimate`,
        `**Loan:** $${loan_amount.toLocaleString()} at ${interest_rate}% interest`,
        `**Income:** $${annual_income.toLocaleString()}/yr · Household size: ${household_size}`,
        ``,
        `### Standard Repayment (10 years)`,
        `Monthly payment:   $${stdMonthly.toFixed(2)}  (${stdDti.toFixed(1)}% of gross income — ${dtiRating(stdDti)})`,
        `Total paid:        $${stdTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
        `Total interest:    $${stdInterest.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
        ``,
        `### Extended Repayment (25 years)`,
        `Monthly payment:   $${extMonthly.toFixed(2)}`,
        `Total paid:        $${extTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
        `Total interest:    $${extInterest.toLocaleString(undefined, { maximumFractionDigits: 0 })}  (+$${(extInterest - stdInterest).toLocaleString(undefined, { maximumFractionDigits: 0 })} vs standard)`,
        ``,
        `### Income-Driven Repayment (IDR, 20-year forgiveness)`,
        `Discretionary income: $${discretionary.toLocaleString(undefined, { maximumFractionDigits: 0 })}/yr  (income − 150% of federal poverty line)`,
        `Monthly payment:   $${idrMonthly.toFixed(2)}  (${idrDti.toFixed(1)}% of gross income — ${dtiRating(idrDti)})`,
        idr.paidOffMonth
            ? `Paid off:          Month ${idr.paidOffMonth} (~${(idr.paidOffMonth / 12).toFixed(1)} years)  |  Total paid: $${idr.totalPaid.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
            : `After 20 years:    $${idr.forgiven.toLocaleString(undefined, { maximumFractionDigits: 0 })} balance forgiven  |  Total paid: $${idr.totalPaid.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
        ``,
        `### Recommendation`,
        recommendation,
        ``,
        `*IDR plan rules (SAVE/IBR/PAYE) change frequently — verify current terms at studentaid.gov.*`,
    ];
    return { content: [{ type: "text", text: lines.join("\n") }] };
});
// ── get_college_details ───────────────────────────────────────────────────────
server.tool("get_college_details", "Deep dive on a single school: net price broken down by family income bracket, SAT/ACT score ranges, retention rate, first-generation student share, financial aid stats, and 10-year earnings. Much more detail than search_colleges.", {
    name: z.string().describe("School name to look up, e.g. 'MIT', 'University of Washington', 'Georgia Tech'"),
}, async ({ name }) => {
    if (!SCORECARD_API_KEY) {
        return {
            content: [{ type: "text", text: "Missing COLLEGE_SCORECARD_API_KEY. Get a free key at https://api.data.gov/signup/" }],
        };
    }
    const results = await fetchSchoolsByName(name, SCORECARD_API_KEY, 5);
    if (results.length === 0) {
        return { content: [{ type: "text", text: `No school found matching "${name}". Try a more specific name.` }] };
    }
    // If multiple matches, show disambiguation list
    if (results.length > 1) {
        const options = results
            .map((r, i) => `${i + 1}. ${r["school.name"]} — ${r["school.city"]}, ${r["school.state"]}`)
            .join("\n");
        return {
            content: [{ type: "text", text: `Multiple matches for "${name}". Please be more specific:\n\n${options}` }],
        };
    }
    const r = results[0];
    const g = (key) => r[key] ?? null;
    // SAT composite (math + reading midpoints)
    const sat25m = g("latest.admissions.sat_scores.25th_percentile.math");
    const sat75m = g("latest.admissions.sat_scores.75th_percentile.math");
    const sat25r = g("latest.admissions.sat_scores.25th_percentile.critical_reading");
    const sat75r = g("latest.admissions.sat_scores.75th_percentile.critical_reading");
    const satStr = sat25m != null && sat25r != null
        ? `${Number(sat25m) + Number(sat25r)}–${Number(sat75m) + Number(sat75r)} (Math: ${sat25m}–${sat75m} | Reading: ${sat25r}–${sat75r})`
        : "Not reported (test-optional or not available)";
    const act25 = g("latest.admissions.act_scores.25th_percentile.cumulative");
    const act75 = g("latest.admissions.act_scores.75th_percentile.cumulative");
    const actStr = act25 != null ? `${act25}–${act75}` : "Not reported";
    const np0 = g("latest.cost.net_price.consumer.by_income_level.0-30000");
    const np30 = g("latest.cost.net_price.consumer.by_income_level.30001-48000");
    const np48 = g("latest.cost.net_price.consumer.by_income_level.48001-75000");
    const np75 = g("latest.cost.net_price.consumer.by_income_level.75001-110000");
    const np110 = g("latest.cost.net_price.consumer.by_income_level.110001-plus");
    const netPriceTable = [
        `  $0 – $30k family income:      ${fmt(np0)}`,
        `  $30k – $48k family income:    ${fmt(np30)}`,
        `  $48k – $75k family income:    ${fmt(np48)}`,
        `  $75k – $110k family income:   ${fmt(np75)}`,
        `  $110k+ family income:         ${fmt(np110)}`,
    ].join("\n");
    const sections = [
        `# ${g("school.name")}`,
        `${g("school.city")}, ${g("school.state")} · ${g("school.school_url") ?? ""}`,
        `${decodeOwnership(g("school.ownership"))} · ${decodeLocale(g("school.locale"))} · ${decodeCarnegie(g("school.carnegie_basic"))}`,
        `\n## Admissions`,
        `Acceptance rate:   ${fmtPct(g("latest.admissions.admission_rate.overall"))}`,
        `SAT range (25–75): ${satStr}`,
        `ACT range (25–75): ${actStr}`,
        `\n## Students`,
        `Enrollment:        ${g("latest.student.size") != null ? Number(g("latest.student.size")).toLocaleString() : "N/A"}`,
        `1st-year retention: ${fmtPct(g("latest.student.retention_rate.four_year.full_time"))}`,
        `4-year grad rate:  ${fmtPct(g("latest.completion.completion_rate_4yr_150nt"))}`,
        `First-gen students: ${fmtPct(g("latest.student.demographics.first_generation"))}`,
        `\n## Cost`,
        `In-state tuition:  ${fmt(g("latest.cost.tuition.in_state"))}`,
        `Out-of-state:      ${fmt(g("latest.cost.tuition.out_of_state"))}`,
        `Avg net price:     ${fmt(g("latest.cost.avg_net_price.consumer.overall_median"))}`,
        `\nNet price by family income (after all aid):`,
        netPriceTable,
        `\n## Financial Aid`,
        `Pell grant recipients: ${fmtPct(g("latest.aid.pell_grant_rate"))}`,
        `Students with federal loans: ${fmtPct(g("latest.aid.federal_loan_rate"))}`,
        `Median debt at graduation: ${fmt(g("latest.aid.median_debt.completers.overall"))}`,
        `\n## Outcomes`,
        `Median earnings 10 yrs after entry: ${fmt(g("latest.earnings.10_yrs_after_entry.median"))}`,
    ];
    return { content: [{ type: "text", text: sections.join("\n") }] };
});
// ── search_by_major ───────────────────────────────────────────────────────────
server.tool("search_by_major", "Compare the same major across different colleges using College Scorecard field-of-study data. Returns program-specific median earnings, median debt, and in-state tuition for each school — far more accurate than school-wide averages.", {
    major: z.string().describe("Major or field of study, e.g. 'computer science', 'nursing', 'mechanical engineering'. Also accepts 4-digit CIP codes directly."),
    state: z.string().optional().describe("Two-letter state code to filter schools, e.g. 'WA'"),
    credential_level: z
        .enum(["associate", "bachelor", "graduate"])
        .optional()
        .default("bachelor")
        .describe("Degree level to compare"),
    sort_by: z
        .enum(["earnings", "debt", "tuition"])
        .optional()
        .default("earnings")
        .describe("Sort results by highest earnings, lowest debt, or lowest tuition"),
    limit: z.number().min(1).max(20).default(10).describe("Number of results"),
}, async ({ major, state, credential_level, sort_by, limit }) => {
    if (!SCORECARD_API_KEY) {
        return {
            content: [{ type: "text", text: "Missing COLLEGE_SCORECARD_API_KEY. Get a free key at https://api.data.gov/signup/" }],
        };
    }
    const cip = lookupCip(major);
    if (!cip) {
        return {
            content: [{ type: "text", text: `Unrecognized major: "${major}". Try a common name like "computer science", "nursing", "mechanical engineering", or pass a 4-digit CIP code directly.` }],
        };
    }
    const credLevel = { associate: 2, bachelor: 3, graduate: 5 }[credential_level ?? "bachelor"];
    const params = new URLSearchParams({
        api_key: SCORECARD_API_KEY,
        "latest.programs.cip_4_digit.code": cip.code,
        fields: [
            "school.name",
            "school.state",
            "school.city",
            "latest.cost.tuition.in_state",
            "latest.programs.cip_4_digit",
        ].join(","),
        per_page: "100",
    });
    if (state)
        params.set("school.state", state);
    const url = `https://api.data.gov/ed/collegescorecard/v1/schools?${params}`;
    const res = await fetch(url);
    if (!res.ok) {
        return {
            content: [{ type: "text", text: `College Scorecard API error: ${res.status} ${res.statusText}` }],
        };
    }
    const data = (await res.json());
    const entries = [];
    for (const school of data.results ?? []) {
        const programs = school["latest.programs.cip_4_digit"];
        if (!programs)
            continue;
        const match = programs.find((p) => p["code"] === cip.code && p["credential"]?.["level"] === credLevel);
        if (!match)
            continue;
        const earn = match["earnings"] ?? {};
        const dbt = match["debt"] ?? {};
        entries.push({
            schoolName: String(school["school.name"] ?? "Unknown"),
            city: String(school["school.city"] ?? ""),
            st: String(school["school.state"] ?? ""),
            tuition: school["latest.cost.tuition.in_state"] != null ? Number(school["latest.cost.tuition.in_state"]) : null,
            earnings4yr: earn["4_yr"]?.["overall_median_earnings"] != null ? Number(earn["4_yr"]["overall_median_earnings"]) : null,
            earningsNational: earn["4_yr"]?.["overall_median_earnings_national"] != null ? Number(earn["4_yr"]["overall_median_earnings_national"]) : null,
            p25National: earn["4_yr"]?.["overall_p25_earnings_national"] != null ? Number(earn["4_yr"]["overall_p25_earnings_national"]) : null,
            p75National: earn["4_yr"]?.["overall_p75_earnings_national"] != null ? Number(earn["4_yr"]["overall_p75_earnings_national"]) : null,
            debt: (() => {
                const inst = dbt["staff_grad_plus"]?.["all"]?.["all_inst"];
                return inst?.["median"] != null ? Number(inst["median"]) : null;
            })(),
            credentialTitle: String(match["credential"]?.["title"] ?? credential_level),
        });
    }
    if (entries.length === 0) {
        return {
            content: [{ type: "text", text: `No ${credential_level}-level ${cip.label} programs found${state ? ` in ${state}` : ""}. Try a different credential level or broaden your search.` }],
        };
    }
    // Sort
    const sorted = [...entries].sort((a, b) => {
        if (sort_by === "earnings") {
            return (b.earnings4yr ?? -1) - (a.earnings4yr ?? -1);
        }
        else if (sort_by === "debt") {
            if (a.debt === null)
                return 1;
            if (b.debt === null)
                return -1;
            return a.debt - b.debt;
        }
        else {
            if (a.tuition === null)
                return 1;
            if (b.tuition === null)
                return -1;
            return a.tuition - b.tuition;
        }
    });
    const top = sorted.slice(0, limit);
    // National benchmark from first entry that has it
    const benchmark = entries.find((e) => e.earningsNational != null);
    const header = benchmark
        ? `**${cip.label} (${top[0].credentialTitle}) — National benchmark:** median 4yr earnings $${benchmark.earningsNational.toLocaleString()} | P25 $${benchmark.p25National?.toLocaleString() ?? "N/A"} | P75 $${benchmark.p75National?.toLocaleString() ?? "N/A"}\n\n`
        : "";
    const rows = top.map((e, i) => {
        const earningsStr = e.earnings4yr != null
            ? `$${e.earnings4yr.toLocaleString()}${benchmark?.earningsNational != null ? ` (${e.earnings4yr >= benchmark.earningsNational ? "+" : ""}${Math.round((e.earnings4yr / benchmark.earningsNational - 1) * 100)}% vs national)` : ""}`
            : "N/A";
        return [
            `**${i + 1}. ${e.schoolName}** — ${e.city}, ${e.st}`,
            `  4yr median earnings: ${earningsStr}`,
            `  Median student debt: ${e.debt != null ? `$${e.debt.toLocaleString()}` : "N/A"}`,
            `  In-state tuition: ${e.tuition != null ? `$${e.tuition.toLocaleString()}/yr` : "N/A"}`,
        ].join("\n");
    });
    return {
        content: [{ type: "text", text: header + rows.join("\n\n") }],
    };
});
// ── Start ─────────────────────────────────────────────────────────────────────
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("college-aid-mcp server running on stdio");
}
main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
