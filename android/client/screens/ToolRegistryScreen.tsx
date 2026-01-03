import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { ToolRegistry } from "@/components/ToolRegistry";
import { ThemedText } from "@/components/ThemedText";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";

export default function ToolRegistryScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        padding: Spacing.lg,
        paddingBottom: insets.bottom + Spacing["2xl"],
      }}
    >
      <View style={styles.header}> 
        <View style={[styles.iconWrapper, { backgroundColor: `${Colors.dark.primary}20` }]}> 
          <Feather name="tool" size={20} color={Colors.dark.primary} />
        </View>
        <ThemedText type="h2" style={{ color: theme.text }}>
          Tools & Actions
        </ThemedText>
        <ThemedText type="body" secondary style={{ marginTop: Spacing.xs }}>
          ZEKE pulls your available tools straight from the backend registry so new
          capabilities appear instantly without redeploying the app.
        </ThemedText>
      </View>

      <ToolRegistry />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
});
