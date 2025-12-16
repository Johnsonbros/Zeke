import React from "react";
import { View, StyleSheet, Image } from "react-native";

import { GradientText } from "@/components/GradientText";
import { ThemedText } from "@/components/ThemedText";
import { Spacing, Colors } from "@/constants/theme";

interface HeaderTitleProps {
  title: string;
  isOnline?: boolean;
}

export function HeaderTitle({ title, isOnline = false }: HeaderTitleProps) {
  return (
    <View style={styles.container}>
      <Image
        source={require("../../assets/images/icon.png")}
        style={styles.icon}
        resizeMode="contain"
      />
      <View style={styles.titleContainer}>
        <GradientText type="h2" style={styles.title}>{title}</GradientText>
        <View style={styles.statusContainer}>
          <View style={[styles.statusDot, { backgroundColor: isOnline ? Colors.dark.success : Colors.dark.error }]} />
          <ThemedText style={[styles.statusText, { color: isOnline ? Colors.dark.success : Colors.dark.error }]}>
            {isOnline ? "Connected" : "Offline"}
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: Spacing.sm,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  titleContainer: {
    flexDirection: "column",
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 26,
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "500",
  },
});
