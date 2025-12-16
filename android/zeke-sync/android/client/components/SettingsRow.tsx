import React from "react";
import { View, StyleSheet, Pressable, Switch } from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";

interface SettingsRowProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  isToggle?: boolean;
  toggleValue?: boolean;
  onToggle?: (value: boolean) => void;
  isDestructive?: boolean;
  showChevron?: boolean;
  disabled?: boolean;
}

export function SettingsRow({
  icon,
  label,
  value,
  onPress,
  isToggle = false,
  toggleValue = false,
  onToggle,
  isDestructive = false,
  showChevron = true,
  disabled = false,
}: SettingsRowProps) {
  const { theme } = useTheme();

  const iconColor = isDestructive ? Colors.dark.error : disabled ? theme.textSecondary : theme.textSecondary;
  const textColor = isDestructive ? Colors.dark.error : disabled ? theme.textSecondary : theme.text;

  if (isToggle) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundDefault, opacity: disabled ? 0.5 : 1 }]}>
        <View style={styles.left}>
          <View style={[styles.iconContainer, { backgroundColor: theme.backgroundSecondary }]}>
            <Feather name={icon} size={18} color={iconColor} />
          </View>
          <ThemedText style={{ color: textColor }}>{label}</ThemedText>
        </View>
        <Switch
          value={toggleValue}
          onValueChange={disabled ? undefined : onToggle}
          disabled={disabled}
          trackColor={{ false: theme.backgroundSecondary, true: Colors.dark.primary }}
          thumbColor="#FFFFFF"
        />
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: theme.backgroundDefault, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <View style={styles.left}>
        <View style={[styles.iconContainer, { backgroundColor: theme.backgroundSecondary }]}>
          <Feather name={icon} size={18} color={iconColor} />
        </View>
        <ThemedText style={{ color: textColor }}>{label}</ThemedText>
      </View>
      <View style={styles.right}>
        {value ? (
          <ThemedText type="small" secondary style={styles.value}>
            {value}
          </ThemedText>
        ) : null}
        {showChevron && !isToggle ? (
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        ) : null}
      </View>
    </Pressable>
  );
}

interface SettingsSectionProps {
  title?: string;
  children: React.ReactNode;
}

export function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <View style={styles.section}>
      {title ? (
        <ThemedText type="caption" secondary style={styles.sectionTitle}>
          {title}
        </ThemedText>
      ) : null}
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    minHeight: 56,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  value: {
    maxWidth: 150,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.lg,
  },
  sectionContent: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
});
