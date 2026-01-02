import { Colors } from "@/constants/theme";
import { AccessLevel, accessLevels } from "@/lib/zeke-types";

export const accessLevelLabels: Record<AccessLevel, string> = {
  admin: "Admin",
  family: "Family",
  friend: "Friend",
  business: "Business",
  restricted: "Restricted",
  unknown: "Unknown",
};

const accessLevelColors: Record<AccessLevel, string> = {
  admin: Colors.dark.accent,
  family: Colors.dark.primary,
  friend: Colors.dark.secondary,
  business: Colors.dark.link,
  restricted: Colors.dark.warning,
  unknown: Colors.dark.textSecondary,
};

export const accessLevelOptions = accessLevels.map(level => ({
  value: level,
  label: accessLevelLabels[level],
}));

export function getAccessLevelColor(level: AccessLevel): string {
  return accessLevelColors[level];
}

export function formatAccessLevel(level: AccessLevel): string {
  return accessLevelLabels[level];
}
