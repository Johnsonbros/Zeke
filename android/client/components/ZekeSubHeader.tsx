import React from "react";
import { View, StyleSheet, Image } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, Gradients } from "@/constants/theme";

interface ZekeSubHeaderProps {
  title: string;
}

export function ZekeSubHeader({ title }: ZekeSubHeaderProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <Image
        source={require("../../assets/images/icon.png")}
        style={styles.icon}
        resizeMode="contain"
      />
      <View style={styles.textContainer}>
        <ThemedText style={[styles.zekeText, { color: Gradients.primary[0] }]}>
          ZEKE
        </ThemedText>
        <View
          style={[styles.separator, { backgroundColor: theme.border }]}
        />
        <ThemedText style={[styles.titleText, { color: theme.text }]}>
          {title}
        </ThemedText>
      </View>
    </View>
  );
}

export function createZekeSubHeader(title: string) {
  return function ZekeSubHeaderComponent() {
    return <ZekeSubHeader title={title} />;
  };
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  icon: {
    width: 24,
    height: 24,
    borderRadius: 6,
  },
  textContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  zekeText: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  separator: {
    width: 1,
    height: 14,
    marginHorizontal: Spacing.xs,
  },
  titleText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
