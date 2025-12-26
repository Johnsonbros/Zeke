import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { SettingsSection } from "@/components/SettingsRow";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";
import { getSettings, saveSettings } from "@/lib/storage";

export type DataRetentionOption = {
  label: string;
  days: number;
  description: string;
};

export const DATA_RETENTION_OPTIONS: DataRetentionOption[] = [
  { label: "7 days", days: 7, description: "Keep data for one week" },
  { label: "30 days", days: 30, description: "Keep data for one month" },
  { label: "90 days", days: 90, description: "Keep data for three months" },
  { label: "1 year", days: 365, description: "Keep data for one year" },
  { label: "Forever", days: -1, description: "Never automatically delete data" },
];

export function getRetentionLabel(days: number): string {
  const option = DATA_RETENTION_OPTIONS.find((opt) => opt.days === days);
  return option?.label ?? "30 days";
}

export default function DataRetentionScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();

  const [selectedDays, setSelectedDays] = useState<number>(-1);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const stored = await getSettings();
    setSelectedDays(stored.dataRetentionDays);
  };

  const handleSelect = async (days: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedDays(days);
    await saveSettings({ dataRetentionDays: days });
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      showsVerticalScrollIndicator={false}
    >
      <ThemedText type="body" secondary style={styles.description}>
        Choose how long ZEKE keeps your conversation history and memories. 
        Select "Forever" to store your data indefinitely.
      </ThemedText>

      <SettingsSection title="RETENTION PERIOD">
        <View style={{ borderRadius: BorderRadius.md, overflow: "hidden" }}>
          {DATA_RETENTION_OPTIONS.map((option, index) => {
            const isSelected = selectedDays === option.days;
            const isLast = index === DATA_RETENTION_OPTIONS.length - 1;

            return (
              <View key={option.days}>
                <Pressable
                  onPress={() => handleSelect(option.days)}
                  style={({ pressed }) => [
                    styles.optionRow,
                    {
                      backgroundColor: theme.backgroundDefault,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <View style={styles.optionContent}>
                    <ThemedText type="body">{option.label}</ThemedText>
                    <ThemedText type="small" secondary>
                      {option.description}
                    </ThemedText>
                  </View>
                  {isSelected ? (
                    <Feather
                      name="check-circle"
                      size={22}
                      color={Colors.dark.primary}
                    />
                  ) : (
                    <View
                      style={[
                        styles.uncheckedCircle,
                        { borderColor: theme.border },
                      ]}
                    />
                  )}
                </Pressable>
                {!isLast ? (
                  <View
                    style={[styles.divider, { backgroundColor: theme.border }]}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      </SettingsSection>

      <ThemedText type="small" secondary style={styles.note}>
        Note: This setting controls automatic data cleanup. You can always 
        manually clear your data from the Settings screen.
      </ThemedText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  description: {
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  optionContent: {
    flex: 1,
    marginRight: Spacing.md,
  },
  uncheckedCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.md,
  },
  note: {
    marginTop: Spacing.lg,
    lineHeight: 18,
  },
});
