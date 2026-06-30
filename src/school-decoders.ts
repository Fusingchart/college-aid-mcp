export function decodeOwnership(code: number | null): string {
  return { 1: "Public", 2: "Private nonprofit", 3: "Private for-profit" }[code ?? -1] ?? "Unknown";
}

export function decodeLocale(code: number | null): string {
  const map: Record<number, string> = {
    11: "City (Large)", 12: "City (Midsize)", 13: "City (Small)",
    21: "Suburb (Large)", 22: "Suburb (Midsize)", 23: "Suburb (Small)",
    31: "Town (Fringe)", 32: "Town (Distant)", 33: "Town (Remote)",
    41: "Rural (Fringe)", 42: "Rural (Distant)", 43: "Rural (Remote)",
  };
  return map[code ?? -1] ?? "Unknown";
}

export function decodeCarnegie(code: number | null): string {
  const map: Record<number, string> = {
    15: "R1 Doctoral (Very High Research)",
    16: "R2 Doctoral (High Research)",
    17: "Doctoral (Moderate Research)",
    18: "Master's — Large",
    19: "Master's — Medium",
    20: "Master's — Small",
    21: "Baccalaureate: Arts & Sciences",
    22: "Baccalaureate: Diverse Fields",
    23: "Baccalaureate/Associate's Mixed",
    24: "Associate's Colleges",
  };
  return map[code ?? -1] ?? "Other";
}

export function fmt(n: number | null | undefined, prefix = "$"): string {
  if (n == null) return "N/A";
  return `${prefix}${Number(n).toLocaleString()}`;
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null) return "N/A";
  return `${(Number(n) * 100).toFixed(1)}%`;
}
