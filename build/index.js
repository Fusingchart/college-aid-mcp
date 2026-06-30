#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
const SCORECARD_API_KEY = process.env.COLLEGE_SCORECARD_API_KEY ?? "";
const CAREERONESTOP_USER_ID = process.env.CAREERONESTOP_USER_ID ?? "";
const CAREERONESTOP_TOKEN = process.env.CAREERONESTOP_TOKEN ?? "";
const server = new McpServer({
    name: "college-aid-mcp",
    version: "0.1.0",
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
