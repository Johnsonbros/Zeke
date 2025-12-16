import { Platform } from "react-native";

export const Colors = {
  light: {
    primary: "#6366F1",
    secondary: "#8B5CF6",
    accent: "#EC4899",
    text: "#F1F5F9",
    textSecondary: "#94A3B8",
    buttonText: "#FFFFFF",
    tabIconDefault: "#94A3B8",
    tabIconSelected: "#6366F1",
    link: "#6366F1",
    backgroundRoot: "#0F172A",
    backgroundDefault: "#1E293B",
    backgroundSecondary: "#334155",
    backgroundTertiary: "#475569",
    border: "#334155",
    success: "#10B981",
    warning: "#F59E0B",
    error: "#EF4444",
  },
  dark: {
    primary: "#6366F1",
    secondary: "#8B5CF6",
    accent: "#EC4899",
    text: "#F1F5F9",
    textSecondary: "#94A3B8",
    buttonText: "#FFFFFF",
    tabIconDefault: "#94A3B8",
    tabIconSelected: "#6366F1",
    link: "#6366F1",
    backgroundRoot: "#0F172A",
    backgroundDefault: "#1E293B",
    backgroundSecondary: "#334155",
    backgroundTertiary: "#475569",
    border: "#334155",
    success: "#10B981",
    warning: "#F59E0B",
    error: "#EF4444",
  },
};

export const Gradients = {
  primary: ["#6366F1", "#8B5CF6"] as const,
  accent: ["#8B5CF6", "#EC4899"] as const,
  background: ["#0F172A", "#1E293B"] as const,
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
  inputHeight: 48,
  buttonHeight: 48,
};

export const BorderRadius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  "2xl": 32,
  full: 9999,
};

export const Typography = {
  h1: {
    fontSize: 32,
    fontWeight: "700" as const,
  },
  h2: {
    fontSize: 24,
    fontWeight: "600" as const,
  },
  h3: {
    fontSize: 20,
    fontWeight: "600" as const,
  },
  h4: {
    fontSize: 18,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 16,
    fontWeight: "400" as const,
  },
  small: {
    fontSize: 14,
    fontWeight: "400" as const,
  },
  caption: {
    fontSize: 12,
    fontWeight: "400" as const,
  },
  link: {
    fontSize: 16,
    fontWeight: "400" as const,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, sans-serif",
    mono: "JetBrains Mono, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
});

export const Shadows = {
  small: Platform.select({
    web: {
      boxShadow: "0px 2px 4px rgba(0, 0, 0, 0.1)",
    },
    default: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
  }),
  medium: Platform.select({
    web: {
      boxShadow: "0px 4px 16px rgba(0, 0, 0, 0.15)",
    },
    default: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 4,
    },
  }),
  large: Platform.select({
    web: {
      boxShadow: "0px 8px 32px rgba(0, 0, 0, 0.25)",
    },
    default: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.25,
      shadowRadius: 16,
      elevation: 8,
    },
  }),
};
