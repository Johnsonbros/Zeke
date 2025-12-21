import React from "react";
import { View, StyleSheet } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { useLocation } from "@/hooks/useLocation";
import { Spacing, Colors, BorderRadius } from "@/constants/theme";

export default function MapScreen() {
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const { location, geocoded } = useLocation();

  return (
    <ThemedView
      style={[styles.container, { paddingTop: headerHeight + Spacing.xl }]}
    >
      <View style={[styles.card, { backgroundColor: theme.backgroundDefault }]}>
        <Feather name="smartphone" size={48} color={Colors.dark.primary} />
        <ThemedText type="h3" style={styles.title}>
          Map View Available in Expo Go
        </ThemedText>
        <ThemedText type="body" secondary style={styles.description}>
          For the best map experience, scan the QR code with Expo Go on your
          mobile device.
        </ThemedText>
        {location ? (
          <View style={styles.locationInfo}>
            <ThemedText type="caption" secondary>
              Your current location:
            </ThemedText>
            <ThemedText type="body" style={{ marginTop: Spacing.xs }}>
              {geocoded?.formattedAddress ||
                `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`}
            </ThemedText>
          </View>
        ) : null}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  card: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.xl,
    alignItems: "center",
    maxWidth: 320,
  },
  title: {
    marginTop: Spacing.lg,
    textAlign: "center",
  },
  description: {
    marginTop: Spacing.sm,
    textAlign: "center",
    lineHeight: 22,
  },
  locationInfo: {
    marginTop: Spacing.lg,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(0,0,0,0.05)",
    width: "100%",
  },
});
