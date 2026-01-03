import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { HeaderTitle } from "@/components/HeaderTitle";
import { PendantStatusIndicator } from "@/components/PendantStatusIndicator";
import { getHealthStatus } from "@/lib/zeke-api-adapter";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";

export function ZekeHeaderTitle() {
  const { data: health, isSuccess } = useQuery({
    queryKey: ["/api/health"],
    queryFn: () => getHealthStatus(),
    refetchInterval: 60000,
    retry: 1,
    staleTime: 30000,
  });

  // Also poll pendant status for activity
  const { data: pendantStatus } = useQuery<any>({
    queryKey: ["/api/pendant/status"],
    refetchInterval: 3000,
    retry: 1,
  });

  const isOnline = isSuccess && health?.connected === true;
  const isActive = pendantStatus?.streaming === true;
  const currentAction = isActive ? "Listening..." : "Connected";

  return (
    <HeaderTitle 
      title="ZEKE" 
      isOnline={isOnline} 
      isActive={isActive}
      currentAction={currentAction}
    />
  );
}

export function ZekeHeaderButtons() {
  const navigation = useNavigation<any>();

  const handleChatPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("CommsTab", {
      screen: "CommunicationsHub",
      params: { initialTab: "chat" },
    });
  };

  const handleSettingsPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("HomeTab", { screen: "Settings" });
  };

  return (
    <View style={styles.container}>
      <PendantStatusIndicator />
      <Pressable
        onPress={handleChatPress}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={({ pressed }) => [
          styles.button,
          styles.chatButton,
          pressed && styles.buttonPressed,
        ]}
      >
        <Feather name="message-circle" size={22} color={Colors.dark.accent} />
      </Pressable>
      <Pressable
        onPress={handleSettingsPress}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
        ]}
      >
        <Feather name="settings" size={22} color={Colors.dark.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  button: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(30, 41, 59, 0.6)",
  },
  chatButton: {
    backgroundColor: "rgba(139, 92, 246, 0.15)",
  },
  buttonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
});
