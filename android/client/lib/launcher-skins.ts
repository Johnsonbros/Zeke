import { Colors, Gradients, BorderRadius, Spacing } from "@/constants/theme";

export interface LauncherSkin {
  id: string;
  name: string;
  trigger: {
    size: number;
    borderRadius: number;
    gradientColors: readonly [string, string];
    glowColors: readonly [string, string];
    iconColor: string;
    iconSize: number;
    shadowColor: string;
  };
  icon: {
    size: number;
    containerSize: number;
    borderRadius: number;
    iconSize: number;
    labelFontSize: number;
    innerBorderColor: string;
    shadowColor: string;
  };
  menu: {
    blurIntensity: number;
    borderRadius: number;
    borderWidth: number;
    borderColor: string;
  };
  layout: {
    baseRadius: number;
    ringSpacing: number;
    padding: number;
  };
  animations: {
    openDamping: number;
    openStiffness: number;
    closeDamping: number;
    closeStiffness: number;
    iconStaggerDelay: number;
  };
}

export const DEFAULT_SKIN: LauncherSkin = {
  id: "default",
  name: "Default",
  trigger: {
    size: 60,
    borderRadius: BorderRadius.md,
    gradientColors: Gradients.primary,
    glowColors: ["#6366F1", "#8B5CF6"],
    iconColor: "#FFFFFF",
    iconSize: 26,
    shadowColor: "#6366F1",
  },
  icon: {
    size: 64,
    containerSize: 80,
    borderRadius: BorderRadius.md + 4,
    iconSize: 26,
    labelFontSize: 11,
    innerBorderColor: "rgba(255, 255, 255, 0.25)",
    shadowColor: "#000000",
  },
  menu: {
    blurIntensity: 60,
    borderRadius: 200,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  layout: {
    baseRadius: 110,
    ringSpacing: 85,
    padding: 16,
  },
  animations: {
    openDamping: 14,
    openStiffness: 100,
    closeDamping: 18,
    closeStiffness: 120,
    iconStaggerDelay: 0.04,
  },
};

export const NEON_SKIN: LauncherSkin = {
  id: "neon",
  name: "Neon",
  trigger: {
    size: 64,
    borderRadius: 32,
    gradientColors: ["#FF0080", "#7928CA"] as const,
    glowColors: ["#FF0080", "#FF00FF"],
    iconColor: "#FFFFFF",
    iconSize: 28,
    shadowColor: "#FF0080",
  },
  icon: {
    size: 68,
    containerSize: 84,
    borderRadius: 20,
    iconSize: 28,
    labelFontSize: 10,
    innerBorderColor: "rgba(255, 0, 128, 0.4)",
    shadowColor: "#FF0080",
  },
  menu: {
    blurIntensity: 80,
    borderRadius: 220,
    borderWidth: 2,
    borderColor: "rgba(255, 0, 128, 0.3)",
  },
  layout: {
    baseRadius: 115,
    ringSpacing: 90,
    padding: 16,
  },
  animations: {
    openDamping: 12,
    openStiffness: 120,
    closeDamping: 16,
    closeStiffness: 140,
    iconStaggerDelay: 0.03,
  },
};

export const MINIMAL_SKIN: LauncherSkin = {
  id: "minimal",
  name: "Minimal",
  trigger: {
    size: 56,
    borderRadius: 14,
    gradientColors: ["#374151", "#1F2937"] as const,
    glowColors: ["#4B5563", "#374151"],
    iconColor: "#FFFFFF",
    iconSize: 24,
    shadowColor: "#000000",
  },
  icon: {
    size: 60,
    containerSize: 76,
    borderRadius: 16,
    iconSize: 24,
    labelFontSize: 10,
    innerBorderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000000",
  },
  menu: {
    blurIntensity: 40,
    borderRadius: 180,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  layout: {
    baseRadius: 100,
    ringSpacing: 80,
    padding: 12,
  },
  animations: {
    openDamping: 16,
    openStiffness: 90,
    closeDamping: 20,
    closeStiffness: 100,
    iconStaggerDelay: 0.05,
  },
};

export const GLASS_SKIN: LauncherSkin = {
  id: "glass",
  name: "Glass",
  trigger: {
    size: 62,
    borderRadius: 18,
    gradientColors: ["rgba(99, 102, 241, 0.9)", "rgba(139, 92, 246, 0.9)"] as const,
    glowColors: ["rgba(99, 102, 241, 0.6)", "rgba(139, 92, 246, 0.6)"],
    iconColor: "#FFFFFF",
    iconSize: 26,
    shadowColor: "#6366F1",
  },
  icon: {
    size: 66,
    containerSize: 82,
    borderRadius: 18,
    iconSize: 26,
    labelFontSize: 11,
    innerBorderColor: "rgba(255, 255, 255, 0.3)",
    shadowColor: "rgba(0, 0, 0, 0.3)",
  },
  menu: {
    blurIntensity: 100,
    borderRadius: 200,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  layout: {
    baseRadius: 108,
    ringSpacing: 82,
    padding: 16,
  },
  animations: {
    openDamping: 13,
    openStiffness: 110,
    closeDamping: 17,
    closeStiffness: 130,
    iconStaggerDelay: 0.04,
  },
};

export const SKIN_REGISTRY: Record<string, LauncherSkin> = {
  default: DEFAULT_SKIN,
  neon: NEON_SKIN,
  minimal: MINIMAL_SKIN,
  glass: GLASS_SKIN,
};

export function getSkin(skinId: string): LauncherSkin {
  return SKIN_REGISTRY[skinId] || DEFAULT_SKIN;
}

export function getAllSkins(): LauncherSkin[] {
  return Object.values(SKIN_REGISTRY);
}

export function createCustomSkin(
  baseSkin: LauncherSkin,
  overrides: Partial<LauncherSkin>
): LauncherSkin {
  return {
    ...baseSkin,
    ...overrides,
    trigger: { ...baseSkin.trigger, ...overrides.trigger },
    icon: { ...baseSkin.icon, ...overrides.icon },
    menu: { ...baseSkin.menu, ...overrides.menu },
    layout: { ...baseSkin.layout, ...overrides.layout },
    animations: { ...baseSkin.animations, ...overrides.animations },
  };
}
