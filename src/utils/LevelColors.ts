export const LEVEL_COLOR_MAP: Record<string, string> = {
  // Standard & Apache
  INFO: "#3b82f6", // Blue
  INFO_ALT: "#10b981", // Green
  WARN: "#f97316", // Orange
  WARNING: "#f97316",
  ERROR: "#ef4444", // Red
  NOTICE: "#6366f1", // Indigo

  // Android Logcat Short Forms
  V: "#94a3b8", // Verbose - Slate/Gray
  D: "#0ea5e9", // Debug - Light Blue
  I: "#10b981", // Info - Emerald Green
  W: "#eab308", // Warn - Yellow
  E: "#ef4444", // Error - Red
  F: "#d946ef", // Fatal - Magenta/Purple
};

export function getLevelColor(level: string): string {
  const normalized = level.toUpperCase().trim();
  if (LEVEL_COLOR_MAP[normalized]) return LEVEL_COLOR_MAP[normalized];

  // Quick hash fallback for unknown log levels
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = normalized.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 65%, 55%)`;
}

export function getLevelLabel(level: string): string {
  const norm = level.toUpperCase().trim();
  const labels: Record<string, string> = {
    V: "Verbose",
    D: "Debug",
    I: "Info",
    W: "Warn",
    E: "Error",
    F: "Fatal",
  };
  // FIX: Return the normalized uppercase string instead of the raw input
  return labels[norm] || norm;
}
