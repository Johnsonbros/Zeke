import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { HeaderTitle } from "@/components/HeaderTitle";
import { getHealthStatus } from "@/lib/zeke-api-adapter";
import { Colors, Spacing } from "@/constants/theme";

export function ZekeHeaderTitle() {
  const { data: health, isSuccess } = useQuery({
    queryKey: ["/api/health"],
    queryFn: () => getHealthStatus(),
    refetchInterval: 15000,
    retry: 1,
    staleTime: 10000,
  });

  const isOnline = isSuccess && health?.connected === true;

  return <HeaderTitle title="ZEKE" isOnline={isOnline} />;
}

export function ZekeHeaderButtons() {
  const navigation = useNavigation<any>();

  const handleChatPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("Chat");
  };

  const handleSettingsPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("HomeTab", { screen: "Settings" });
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={handleChatPress} style={styles.button}>
        <Feather name="message-circle" size={26} color={Colors.dark.primary} />
      </Pressable>
      <Pressable onPress={handleSettingsPress} style={styles.button}>
        <Feather name="settings" size={26} color={Colors.dark.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
  },
  button: {
    padding: Spacing.md,
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
