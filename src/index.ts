#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { lookupCip } from "./cip-codes.js";

const SCORECARD_API_KEY = process.env.COLLEGE_SCORECARD_API_KEY ?? "";
const CAREERONESTOP_USER_ID = process.env.CAREERONESTOP_USER_ID ?? "";
const CAREERONESTOP_TOKEN = process.env.CAREERONESTOP_TOKEN ?? "";

const server = new McpServer({
  name: "college-aid-mcp",
  version: "0.1.0",
});

// ── College Scorecard ─────────────────────────────────────────────────────────

server.tool(
  "search_colleges",
  "Search colleges by name, state, or degree type. Returns tuition, median debt, median earnings, graduation rate, and admission rate for each match.",
  {
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
  },
  async ({ query, state, degree_type, max_tuition, limit }) => {
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

    if (query) params.set("school.name", query);
    if (state) params.set("school.state", state);
    if (degree_type === "associate") params.set("school.degrees_awarded.predominant", "2");
    if (degree_type === "bachelor") params.set("school.degrees_awarded.predominant", "3");
    if (degree_type === "graduate") params.set("school.degrees_awarded.predominant", "4");
    if (max_tuition) params.set("latest.cost.tuition.in_state__range", `..${max_tuition}`);

    const url = `https://api.data.gov/ed/collegescorecard/v1/schools?${params}`;
    const res = await fetch(url);

    if (!res.ok) {
      return {
        content: [{ type: "text", text: `College Scorecard API error: ${res.status} ${res.statusText}` }],
      };
    }

    const data = (await res.json()) as { results: Record<string, unknown>[] };
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
  }
);

// ── CareerOneStop Scholarship Finder ─────────────────────────────────────────

server.tool(
  "search_scholarships",
  "Search 9,500+ scholarships and grants from the US Dept of Labor CareerOneStop database. Filter by keyword, state, study level, or major.",
  {
    keyword: z.string().optional().describe("Keyword to search scholarships by (e.g. 'engineering', 'STEM', 'first generation')"),
    state: z.string().optional().describe("Two-letter state code to find scholarships restricted to that state, e.g. 'WA'"),
    study_level: z
      .enum(["high_school", "undergraduate", "graduate", "vocational"])
      .optional()
      .describe("Education level the scholarship is for"),
    limit: z.number().min(1).max(20).default(10).describe("Number of results"),
  },
  async ({ keyword, state, study_level, limit }) => {
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

    const levelMap: Record<string, string> = {
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

    const data = (await res.json()) as { ScholarshipList?: Record<string, unknown>[] };
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
  }
);

// ── search_by_major ───────────────────────────────────────────────────────────

server.tool(
  "search_by_major",
  "Compare the same major across different colleges using College Scorecard field-of-study data. Returns program-specific median earnings, median debt, and in-state tuition for each school — far more accurate than school-wide averages.",
  {
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
  },
  async ({ major, state, credential_level, sort_by, limit }) => {
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

    if (state) params.set("school.state", state);

    const url = `https://api.data.gov/ed/collegescorecard/v1/schools?${params}`;
    const res = await fetch(url);

    if (!res.ok) {
      return {
        content: [{ type: "text", text: `College Scorecard API error: ${res.status} ${res.statusText}` }],
      };
    }

    const data = (await res.json()) as { results: Record<string, unknown>[] };

    type ProgramEntry = {
      schoolName: string;
      city: string;
      st: string;
      tuition: number | null;
      earnings4yr: number | null;
      earningsNational: number | null;
      p25National: number | null;
      p75National: number | null;
      debt: number | null;
      credentialTitle: string;
    };

    const entries: ProgramEntry[] = [];

    for (const school of data.results ?? []) {
      const programs = school["latest.programs.cip_4_digit"] as Record<string, unknown>[] | undefined;
      if (!programs) continue;

      const match = programs.find(
        (p) => p["code"] === cip.code && (p["credential"] as Record<string, unknown>)?.["level"] === credLevel
      );
      if (!match) continue;

      const earn = (match["earnings"] as Record<string, Record<string, unknown>>) ?? {};
      const dbt = (match["debt"] as Record<string, Record<string, Record<string, unknown>>>) ?? {};

      entries.push({
        schoolName: String(school["school.name"] ?? "Unknown"),
        city: String(school["school.city"] ?? ""),
        st: String(school["school.state"] ?? ""),
        tuition: school["latest.cost.tuition.in_state"] != null ? Number(school["latest.cost.tuition.in_state"]) : null,
        earnings4yr: earn["4_yr"]?.["overall_median_earnings"] != null ? Number(earn["4_yr"]["overall_median_earnings"]) : null,
        earningsNational: earn["4_yr"]?.["overall_median_earnings_national"] != null ? Number(earn["4_yr"]["overall_median_earnings_national"]) : null,
        p25National: earn["4_yr"]?.["overall_p25_earnings_national"] != null ? Number(earn["4_yr"]["overall_p25_earnings_national"]) : null,
        p75National: earn["4_yr"]?.["overall_p75_earnings_national"] != null ? Number(earn["4_yr"]["overall_p75_earnings_national"]) : null,
        debt: dbt["staff_grad_plus"]?.["all"]?.["all_inst"]?.["median"] != null
          ? Number((dbt["staff_grad_plus"]["all"]["all_inst"] as Record<string, unknown>)["median"])
          : null,
        credentialTitle: String((match["credential"] as Record<string, unknown>)?.["title"] ?? credential_level),
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
      } else if (sort_by === "debt") {
        if (a.debt === null) return 1;
        if (b.debt === null) return -1;
        return a.debt - b.debt;
      } else {
        if (a.tuition === null) return 1;
        if (b.tuition === null) return -1;
        return a.tuition - b.tuition;
      }
    });

    const top = sorted.slice(0, limit);

    // National benchmark from first entry that has it
    const benchmark = entries.find((e) => e.earningsNational != null);
    const header = benchmark
      ? `**${cip.label} (${top[0].credentialTitle}) — National benchmark:** median 4yr earnings $${benchmark.earningsNational!.toLocaleString()} | P25 $${benchmark.p25National?.toLocaleString() ?? "N/A"} | P75 $${benchmark.p75National?.toLocaleString() ?? "N/A"}\n\n`
      : "";

    const rows = top.map((e, i) => {
      const earningsStr = e.earnings4yr != null
        ? `$${e.earnings4yr.toLocaleString()}${benchmark?.earningsNational != null ? ` (${e.earnings4yr >= benchmark.earningsNational ? "+" : ""}${Math.round((e.earnings4yr / benchmark.earningsNational! - 1) * 100)}% vs national)` : ""}`
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
  }
);

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
