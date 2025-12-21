import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { ThemedText } from "./ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { ConnectionStatus } from "@/hooks/useZekeSync";

interface SyncStatusProps {
  status: ConnectionStatus;
  showLabel?: boolean;
  size?: "small" | "medium";
  onPress?: () => void;
}

export function SyncStatus({
  status,
  showLabel = false,
  size = "small",
  onPress,
}: SyncStatusProps) {
  const theme = useTheme();

  const dotSize = size === "small" ? 8 : 12;
  const containerPadding = size === "small" ? Spacing.xs : Spacing.sm;

  const getStatusColor = () => {
    switch (status) {
      case "connected":
        return theme.theme.success;
      case "connecting":
        return theme.theme.warning;
      case "disconnected":
        return theme.theme.error;
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case "connected":
        return "Synced";
      case "connecting":
        return "Connecting...";
      case "disconnected":
        return "Offline";
    }
  };

  const content = (
    <View style={[styles.container, { padding: containerPadding }]}>
      <View
        style={[
          styles.dot,
          {
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: getStatusColor(),
          },
        ]}
      />
      {showLabel ? (
        <ThemedText
          style={[
            styles.label,
            {
              color: getStatusColor(),
              fontSize: size === "small" ? 12 : 14,
            },
          ]}
        >
          {getStatusLabel()}
        </ThemedText>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  pressable: {
    borderRadius: BorderRadius.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  dot: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  label: {
    fontWeight: "500",
  },
});
