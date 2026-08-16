export type ThemeColors = {
  bg: string;
  surface: string;
  surface2: string;
  text: string;
  textSoft: string;
  textMuted: string;
  accent: string;
  accentStrong: string;
  alert: string;
  caution: string;
  safe: string;
  border: string;
  borderStrong: string;
};

export const colors: ThemeColors = {
  bg: "#0c0b0a",
  surface: "rgba(247,243,238,0.05)",
  surface2: "rgba(247,243,238,0.09)",
  text: "#f7f3ee",
  textSoft: "rgba(247,243,238,0.58)",
  textMuted: "rgba(247,243,238,0.32)",
  accent: "#c65b45",
  accentStrong: "#e4a396",
  alert: "#ff3b30",
  caution: "#d9a441",
  safe: "#34c759",
  border: "rgba(247,243,238,0.1)",
  borderStrong: "rgba(247,243,238,0.18)",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const type = {
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: "uppercase" as const,
    fontWeight: "700" as const,
    color: colors.accent,
  },
  h1: {
    fontSize: 26,
    fontWeight: "700" as const,
    color: colors.text,
    letterSpacing: -0.4,
    lineHeight: 32,
  },
  h2: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: colors.text,
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 14,
    color: colors.textSoft,
    lineHeight: 20,
  },
  label: {
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase" as const,
    fontWeight: "600" as const,
    color: colors.textMuted,
  },
} as const;
