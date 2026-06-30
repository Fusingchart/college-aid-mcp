export function decodeOwnership(code) {
    return { 1: "Public", 2: "Private nonprofit", 3: "Private for-profit" }[code ?? -1] ?? "Unknown";
}
export function decodeLocale(code) {
    const map = {
        11: "City (Large)", 12: "City (Midsize)", 13: "City (Small)",
        21: "Suburb (Large)", 22: "Suburb (Midsize)", 23: "Suburb (Small)",
        31: "Town (Fringe)", 32: "Town (Distant)", 33: "Town (Remote)",
        41: "Rural (Fringe)", 42: "Rural (Distant)", 43: "Rural (Remote)",
    };
    return map[code ?? -1] ?? "Unknown";
}
export function decodeCarnegie(code) {
    const map = {
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
// Adjacent Carnegie tiers to broaden search when exact tier returns too few results
export const CARNEGIE_ADJACENT = {
    15: [15, 16], // R1 → also R2
    16: [16, 15, 17], // R2 → also R1, R3
    17: [17, 16, 18], // R3 → also R2, M1
    18: [18, 19, 17], // Master's Large → also M-Medium, R3
    19: [19, 18, 20], // Master's Medium → also M-Large, M-Small
    20: [20, 19, 21], // Master's Small → also M-Medium, Bacc A&S
    21: [21, 22, 20], // Bacc A&S → also Bacc Diverse, M-Small
    22: [22, 21, 23], // Bacc Diverse → also Bacc A&S, Mixed
};
export function fmt(n, prefix = "$") {
    if (n == null)
        return "N/A";
    return `${prefix}${Number(n).toLocaleString()}`;
}
export function fmtPct(n) {
    if (n == null)
        return "N/A";
    return `${(Number(n) * 100).toFixed(1)}%`;
}
