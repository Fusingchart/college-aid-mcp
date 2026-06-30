// Shared College Scorecard fetch logic

export const DETAIL_FIELDS = [
  "school.name", "school.city", "school.state", "school.school_url",
  "school.ownership", "school.locale", "school.carnegie_basic",
  "school.degrees_awarded.predominant", "school.religious_affiliation",
  "latest.admissions.admission_rate.overall",
  "latest.admissions.sat_scores.25th_percentile.math",
  "latest.admissions.sat_scores.75th_percentile.math",
  "latest.admissions.sat_scores.25th_percentile.critical_reading",
  "latest.admissions.sat_scores.75th_percentile.critical_reading",
  "latest.admissions.act_scores.25th_percentile.cumulative",
  "latest.admissions.act_scores.75th_percentile.cumulative",
  "latest.student.size",
  "latest.student.retention_rate.four_year.full_time",
  "latest.student.demographics.first_generation",
  "latest.cost.tuition.in_state",
  "latest.cost.tuition.out_of_state",
  "latest.cost.avg_net_price.consumer.overall_median",
  "latest.cost.net_price.consumer.by_income_level.0-30000",
  "latest.cost.net_price.consumer.by_income_level.30001-48000",
  "latest.cost.net_price.consumer.by_income_level.48001-75000",
  "latest.cost.net_price.consumer.by_income_level.75001-110000",
  "latest.cost.net_price.consumer.by_income_level.110001-plus",
  "latest.aid.pell_grant_rate",
  "latest.aid.federal_loan_rate",
  "latest.aid.median_debt.completers.overall",
  "latest.completion.completion_rate_4yr_150nt",
  "latest.earnings.10_yrs_after_entry.median",
].join(",");

export type SchoolRecord = Record<string, unknown>;

export async function fetchSchoolsByName(
  name: string,
  apiKey: string,
  perPage = 5
): Promise<SchoolRecord[]> {
  const params = new URLSearchParams({
    api_key: apiKey,
    "school.name": name,
    fields: DETAIL_FIELDS,
    per_page: String(perPage),
  });
  const res = await fetch(`https://api.data.gov/ed/collegescorecard/v1/schools?${params}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: SchoolRecord[] };
  return data.results ?? [];
}
