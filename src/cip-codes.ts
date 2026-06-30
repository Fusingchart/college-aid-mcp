// CIP (Classification of Instructional Programs) 4-digit codes
// Maps common major names / aliases → CIP code used by College Scorecard API

export const CIP_MAP: Record<string, { code: string; label: string }> = {
  // Computer Science & Engineering
  "computer science":        { code: "1107", label: "Computer Science" },
  "cs":                      { code: "1107", label: "Computer Science" },
  "comp sci":                { code: "1107", label: "Computer Science" },
  "software engineering":    { code: "1107", label: "Computer Science" },
  "computer engineering":    { code: "1409", label: "Computer Engineering" },
  "information science":     { code: "1105", label: "Information Science" },
  "information technology":  { code: "1102", label: "Information Technology" },
  "data science":            { code: "1103", label: "Data Science" },
  "cybersecurity":           { code: "1110", label: "Cybersecurity" },

  // Engineering
  "mechanical engineering":  { code: "1419", label: "Mechanical Engineering" },
  "electrical engineering":  { code: "1410", label: "Electrical Engineering" },
  "civil engineering":       { code: "1408", label: "Civil Engineering" },
  "chemical engineering":    { code: "1407", label: "Chemical Engineering" },
  "aerospace engineering":   { code: "1402", label: "Aerospace Engineering" },
  "biomedical engineering":  { code: "1405", label: "Biomedical Engineering" },
  "industrial engineering":  { code: "1435", label: "Industrial Engineering" },
  "environmental engineering": { code: "1414", label: "Environmental Engineering" },

  // Business
  "business":                { code: "5201", label: "Business Administration" },
  "business administration": { code: "5201", label: "Business Administration" },
  "mba":                     { code: "5201", label: "Business Administration" },
  "accounting":              { code: "5203", label: "Accounting" },
  "finance":                 { code: "5208", label: "Finance" },
  "marketing":               { code: "5214", label: "Marketing" },
  "management":              { code: "5202", label: "Business Management" },
  "entrepreneurship":        { code: "5207", label: "Entrepreneurship" },

  // Sciences
  "biology":                 { code: "2601", label: "Biology" },
  "chemistry":               { code: "4005", label: "Chemistry" },
  "physics":                 { code: "4008", label: "Physics" },
  "mathematics":             { code: "2701", label: "Mathematics" },
  "math":                    { code: "2701", label: "Mathematics" },
  "statistics":              { code: "2705", label: "Statistics" },
  "environmental science":   { code: "0301", label: "Environmental Science" },
  "neuroscience":            { code: "2615", label: "Neuroscience" },
  "biochemistry":            { code: "2602", label: "Biochemistry" },

  // Health & Medicine
  "nursing":                 { code: "5138", label: "Nursing (RN)" },
  "pre-med":                 { code: "2601", label: "Biology (Pre-Med)" },
  "public health":           { code: "5122", label: "Public Health" },
  "pharmacy":                { code: "5120", label: "Pharmacy" },
  "health sciences":         { code: "5100", label: "Health Sciences" },
  "kinesiology":             { code: "3101", label: "Kinesiology" },

  // Social Sciences & Humanities
  "psychology":              { code: "4201", label: "Psychology" },
  "economics":               { code: "4501", label: "Economics" },
  "political science":       { code: "4510", label: "Political Science" },
  "sociology":               { code: "4511", label: "Sociology" },
  "history":                 { code: "5401", label: "History" },
  "english":                 { code: "2301", label: "English" },
  "communications":          { code: "0901", label: "Communications" },
  "journalism":              { code: "0904", label: "Journalism" },
  "philosophy":              { code: "3801", label: "Philosophy" },
  "anthropology":            { code: "4502", label: "Anthropology" },
  "criminology":             { code: "4399", label: "Criminal Justice" },

  // Arts & Design
  "art":                     { code: "5004", label: "Art" },
  "fine arts":               { code: "5007", label: "Fine Arts" },
  "graphic design":          { code: "5003", label: "Graphic Design" },
  "architecture":            { code: "0401", label: "Architecture" },
  "music":                   { code: "5009", label: "Music" },
  "film":                    { code: "5006", label: "Film & Media" },
  "theater":                 { code: "5005", label: "Theater" },

  // Education & Social Work
  "education":               { code: "1301", label: "Education" },
  "social work":             { code: "4407", label: "Social Work" },

  // Law & Pre-Law
  "pre-law":                 { code: "4510", label: "Political Science (Pre-Law)" },
  "law":                     { code: "2201", label: "Law" },
};

export function lookupCip(major: string): { code: string; label: string } | null {
  const key = major.toLowerCase().trim();
  if (CIP_MAP[key]) return CIP_MAP[key];

  // Partial match — find first entry whose key contains the query
  const partial = Object.entries(CIP_MAP).find(([k]) => k.includes(key) || key.includes(k));
  if (partial) return partial[1];

  // Allow direct CIP code passthrough (e.g. "1107")
  if (/^\d{4}$/.test(key)) return { code: key, label: `CIP ${key}` };

  return null;
}
