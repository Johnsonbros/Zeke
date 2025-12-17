import React from "react";
import { View, StyleSheet, Pressable, Platform } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";

import { HeaderTitle } from "@/components/HeaderTitle";
import { getHealthStatus } from "@/lib/zeke-api-adapter";
import { Colors, Spacing, Gradients, BorderRadius } from "@/constants/theme";

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

function GradientIcon({
  name,
  size,
  colors = Gradients.primary,
}: {
  name: React.ComponentProps<typeof Feather>["name"];
  size: number;
  colors?: readonly [string, string, ...string[]];
}) {
  return (
    <MaskedView
      maskElement={
        <View style={{ alignItems: "center", justifyContent: "center" }}>
          <Feather name={name} size={size} color="#FFF" />
        </View>
      }
    >
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <Feather name={name} size={size} color="transparent" />
      </LinearGradient>
    </MaskedView>
  );
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

  const hitSlop = { top: 12, bottom: 12, left: 12, right: 12 };

  const ButtonContent = (
    <>
      <Pressable
        onPress={handleChatPress}
        hitSlop={hitSlop}
        android_ripple={{ color: "rgba(255,255,255,0.2)", borderless: true, radius: 22 }}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <View style={styles.chatButtonGlow} />
        <GradientIcon name="message-circle" size={24} colors={Gradients.accent} />
      </Pressable>
      <View style={styles.divider} pointerEvents="none" />
      <Pressable
        onPress={handleSettingsPress}
        hitSlop={hitSlop}
        android_ripple={{ color: "rgba(255,255,255,0.2)", borderless: true, radius: 22 }}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Feather name="settings" size={22} color={Colors.dark.textSecondary} />
      </Pressable>
    </>
  );

  if (Platform.OS === "ios") {
    return (
      <View style={styles.glassContainer} pointerEvents="box-none">
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={styles.glassInner}>{ButtonContent}</View>
      </View>
    );
  }

  return (
    <View style={[styles.glassContainer, styles.glassContainerFallback]} pointerEvents="box-none">
      <View style={styles.glassInner}>{ButtonContent}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  glassContainer: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  glassContainerFallback: {
    backgroundColor: "rgba(30, 41, 59, 0.85)",
  },
  glassInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginHorizontal: Spacing.xs,
  },
  button: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.sm,
  },
  buttonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  chatButtonGlow: {
    position: "absolute",
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Gradients.accent[0],
    opacity: 0.15,
  },
});
