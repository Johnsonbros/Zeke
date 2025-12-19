import React, { useState, useCallback } from "react";
import { View, StyleSheet, ScrollView, Pressable, Platform, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeIn,
  FadeInDown,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Colors, Gradients } from "@/constants/theme";

type SetupStep = {
  id: number;
  title: string;
  description: string;
  icon: keyof typeof Feather.glyphMap;
  lightColor?: string;
  lightLabel?: string;
  tip?: string;
};

const FACTORY_RESET_STEPS: SetupStep[] = [
  {
    id: 1,
    title: "Clear Any Red Light",
    description: "If your pendant shows a solid red light (while not charging), hold the button for 10+ seconds until the red light turns off.",
    icon: "alert-circle",
    lightColor: Colors.dark.error,
    lightLabel: "Red = Hold 10s",
    tip: "Skip this step if there's no red light",
  },
  {
    id: 2,
    title: "Quick Double-Press",
    description: "Press the button quickly (tap and release), then immediately press and hold. The timing is important - very little pause between the two presses.",
    icon: "target",
    tip: "Think: tap... hold",
  },
  {
    id: 3,
    title: "Watch for Purple Light",
    description: "Keep holding after the second press. A purple light will appear - continue holding.",
    icon: "eye",
    lightColor: "#A855F7",
    lightLabel: "Purple = Keep holding",
  },
  {
    id: 4,
    title: "Release When Purple Disappears",
    description: "When the purple light goes away, release the button.",
    icon: "check-circle",
  },
  {
    id: 5,
    title: "Confirm Solid Blue",
    description: "The light should turn solid blue. This means your pendant is factory reset and ready to pair with ZEKE.",
    icon: "bluetooth",
    lightColor: Colors.dark.primary,
    lightLabel: "Blue = Ready to pair",
  },
];

const PRE_PAIRING_CHECKLIST = [
  {
    id: "bluetooth",
    label: "Bluetooth is turned on",
    icon: "bluetooth" as const,
  },
  {
    id: "forget",
    label: "Forgot pendant from phone Bluetooth settings",
    icon: "x-circle" as const,
  },
  {
    id: "nearby",
    label: "Pendant is nearby (within a few feet)",
    icon: "map-pin" as const,
  },
  {
    id: "blue",
    label: "Pendant shows solid blue light",
    icon: "circle" as const,
  },
];

const TROUBLESHOOTING_TIPS = [
  {
    problem: "Pendant won't connect",
    solutions: [
      "Factory reset the pendant (follow steps above)",
      "Forget pendant from phone Bluetooth settings",
      "Reboot your phone and try again",
      "Make sure pendant shows solid blue light",
    ],
  },
  {
    problem: "Pendant keeps disconnecting",
    solutions: [
      "Keep phone within a few feet of pendant",
      "Don't force-close the app - keep it in background",
      "On Android: disable battery optimization for ZEKE",
      "Only pair to one phone at a time",
    ],
  },
  {
    problem: "Not recording audio",
    solutions: [
      "Check pendant is connected in ZEKE app (not just Bluetooth settings)",
      "Verify app has microphone permission",
      "Restart phone and reconnect",
    ],
  },
  {
    problem: "Double-press reset too slow",
    solutions: [
      "If you see red light, hold button until it turns off",
      "Try again with faster timing between presses",
      "Think: quick tap, then immediately hold",
    ],
  },
];

export default function LimitlessSetupScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation();
  const { theme } = useTheme();

  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [expandedTroubleshoot, setExpandedTroubleshoot] = useState<number | null>(null);
  const [currentStep, setCurrentStep] = useState(0);

  const handleCheckItem = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleOpenSettings = useCallback(async () => {
    if (Platform.OS === "web") return;
    try {
      await Linking.openSettings();
    } catch (e) {
      console.log("Could not open settings");
    }
  }, []);

  const handleContinueToPairing = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("BluetoothConnection" as never);
  }, [navigation]);

  const allChecked = checkedItems.size === PRE_PAIRING_CHECKLIST.length;

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
      <Animated.View entering={FadeIn.duration(300)}>
        <View style={styles.heroSection}>
          <View style={[styles.iconWrapper, { backgroundColor: theme.backgroundSecondary }]}>
            <Feather name="disc" size={40} color={Colors.dark.secondary} />
          </View>
          <ThemedText type="h2" style={styles.heroTitle}>
            Limitless Pendant Setup
          </ThemedText>
          <ThemedText type="body" secondary style={styles.heroSubtitle}>
            Follow these steps to prepare your pendant for pairing with ZEKE
          </ThemedText>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(100).duration(300)}>
        <ThemedText type="h3" style={styles.sectionTitle}>
          Factory Reset Your Pendant
        </ThemedText>
        <ThemedText type="small" secondary style={styles.sectionSubtitle}>
          Required if switching from Limitless app to ZEKE
        </ThemedText>

        <View style={styles.stepsContainer}>
          {FACTORY_RESET_STEPS.map((step, index) => (
            <Pressable
              key={step.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setCurrentStep(index);
              }}
            >
              <Card 
                elevation={currentStep === index ? 2 : 1} 
                style={[
                  styles.stepCard,
                  currentStep === index && { borderColor: Colors.dark.primary, borderWidth: 1 },
                ]}
              >
                <View style={styles.stepHeader}>
                  <View
                    style={[
                      styles.stepNumber,
                      { 
                        backgroundColor: currentStep >= index 
                          ? Colors.dark.primary 
                          : theme.backgroundSecondary 
                      },
                    ]}
                  >
                    {currentStep > index ? (
                      <Feather name="check" size={14} color="#FFFFFF" />
                    ) : (
                      <ThemedText 
                        type="small" 
                        style={{ 
                          color: currentStep >= index ? "#FFFFFF" : theme.textSecondary 
                        }}
                      >
                        {step.id}
                      </ThemedText>
                    )}
                  </View>
                  <View style={styles.stepContent}>
                    <ThemedText type="body" style={{ fontWeight: "600" }}>
                      {step.title}
                    </ThemedText>
                    <ThemedText type="small" secondary style={{ marginTop: Spacing.xs }}>
                      {step.description}
                    </ThemedText>
                    {step.lightColor ? (
                      <View style={styles.lightIndicator}>
                        <View style={[styles.lightDot, { backgroundColor: step.lightColor }]} />
                        <ThemedText type="caption" secondary>
                          {step.lightLabel}
                        </ThemedText>
                      </View>
                    ) : null}
                    {step.tip ? (
                      <View style={styles.tipContainer}>
                        <Feather name="info" size={12} color={Colors.dark.warning} />
                        <ThemedText type="caption" style={{ color: Colors.dark.warning, marginLeft: Spacing.xs }}>
                          {step.tip}
                        </ThemedText>
                      </View>
                    ) : null}
                  </View>
                </View>
              </Card>
            </Pressable>
          ))}
        </View>

        <View style={styles.navigationButtons}>
          <Pressable
            onPress={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            style={({ pressed }) => [
              styles.navButton,
              { backgroundColor: theme.backgroundSecondary, opacity: currentStep === 0 ? 0.5 : pressed ? 0.8 : 1 },
            ]}
          >
            <Feather name="chevron-left" size={20} color={theme.text} />
            <ThemedText type="small">Previous</ThemedText>
          </Pressable>
          <Pressable
            onPress={() => setCurrentStep(Math.min(FACTORY_RESET_STEPS.length - 1, currentStep + 1))}
            disabled={currentStep === FACTORY_RESET_STEPS.length - 1}
            style={({ pressed }) => [
              styles.navButton,
              { backgroundColor: theme.backgroundSecondary, opacity: currentStep === FACTORY_RESET_STEPS.length - 1 ? 0.5 : pressed ? 0.8 : 1 },
            ]}
          >
            <ThemedText type="small">Next</ThemedText>
            <Feather name="chevron-right" size={20} color={theme.text} />
          </Pressable>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(200).duration(300)}>
        <ThemedText type="h3" style={[styles.sectionTitle, { marginTop: Spacing["2xl"] }]}>
          Pre-Pairing Checklist
        </ThemedText>

        <Card elevation={1} style={styles.checklistCard}>
          {PRE_PAIRING_CHECKLIST.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => handleCheckItem(item.id)}
              style={({ pressed }) => [
                styles.checklistItem,
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    backgroundColor: checkedItems.has(item.id)
                      ? Colors.dark.success
                      : theme.backgroundSecondary,
                    borderColor: checkedItems.has(item.id)
                      ? Colors.dark.success
                      : theme.border,
                  },
                ]}
              >
                {checkedItems.has(item.id) ? (
                  <Feather name="check" size={14} color="#FFFFFF" />
                ) : null}
              </View>
              <Feather
                name={item.icon}
                size={18}
                color={checkedItems.has(item.id) ? Colors.dark.success : theme.textSecondary}
                style={{ marginRight: Spacing.sm }}
              />
              <ThemedText
                type="body"
                style={{
                  flex: 1,
                  textDecorationLine: checkedItems.has(item.id) ? "line-through" : "none",
                  opacity: checkedItems.has(item.id) ? 0.7 : 1,
                }}
              >
                {item.label}
              </ThemedText>
            </Pressable>
          ))}
        </Card>

        {Platform.OS !== "web" ? (
          <Pressable
            onPress={handleOpenSettings}
            style={({ pressed }) => [
              styles.settingsLink,
              { opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Feather name="settings" size={16} color={Colors.dark.primary} />
            <ThemedText type="small" style={{ color: Colors.dark.primary, marginLeft: Spacing.sm }}>
              Open Phone Settings to forget old pairing
            </ThemedText>
          </Pressable>
        ) : null}

        <Pressable
          onPress={handleContinueToPairing}
          disabled={!allChecked}
          style={({ pressed }) => ({
            opacity: !allChecked ? 0.5 : pressed ? 0.8 : 1,
            marginTop: Spacing.lg,
          })}
        >
          <LinearGradient colors={Gradients.primary} style={styles.continueButton}>
            <ThemedText type="body" style={{ color: "#FFFFFF", fontWeight: "600" }}>
              Continue to Pairing
            </ThemedText>
            <Feather name="arrow-right" size={20} color="#FFFFFF" />
          </LinearGradient>
        </Pressable>
        {!allChecked ? (
          <ThemedText type="caption" secondary style={{ textAlign: "center", marginTop: Spacing.sm }}>
            Complete all checklist items to continue
          </ThemedText>
        ) : null}
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(300)}>
        <ThemedText type="h3" style={[styles.sectionTitle, { marginTop: Spacing["2xl"] }]}>
          Troubleshooting
        </ThemedText>

        {TROUBLESHOOTING_TIPS.map((tip, index) => (
          <Pressable
            key={index}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setExpandedTroubleshoot(expandedTroubleshoot === index ? null : index);
            }}
          >
            <Card elevation={1} style={styles.troubleshootCard}>
              <View style={styles.troubleshootHeader}>
                <Feather
                  name="help-circle"
                  size={18}
                  color={Colors.dark.warning}
                  style={{ marginRight: Spacing.sm }}
                />
                <ThemedText type="body" style={{ flex: 1, fontWeight: "500" }}>
                  {tip.problem}
                </ThemedText>
                <Feather
                  name={expandedTroubleshoot === index ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={theme.textSecondary}
                />
              </View>
              {expandedTroubleshoot === index ? (
                <View style={styles.troubleshootSolutions}>
                  {tip.solutions.map((solution, sIndex) => (
                    <View key={sIndex} style={styles.solutionItem}>
                      <View style={styles.solutionBullet} />
                      <ThemedText type="small" secondary style={{ flex: 1 }}>
                        {solution}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              ) : null}
            </Card>
          </Pressable>
        ))}
      </Animated.View>

      <View style={styles.supportSection}>
        <Feather name="message-circle" size={16} color={theme.textSecondary} />
        <ThemedText type="small" secondary style={{ marginLeft: Spacing.sm }}>
          Need more help? Join the Omi Discord for community support.
        </ThemedText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  heroSection: {
    alignItems: "center",
    marginBottom: Spacing["2xl"],
  },
  iconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  heroTitle: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  heroSubtitle: {
    textAlign: "center",
    paddingHorizontal: Spacing.xl,
  },
  sectionTitle: {
    marginBottom: Spacing.xs,
  },
  sectionSubtitle: {
    marginBottom: Spacing.lg,
  },
  stepsContainer: {
    gap: Spacing.sm,
  },
  stepCard: {
    marginBottom: 0,
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
    marginTop: 2,
  },
  stepContent: {
    flex: 1,
  },
  lightIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  lightDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  tipContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  navigationButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
  navButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    gap: Spacing.xs,
  },
  checklistCard: {
    marginBottom: 0,
  },
  checklistItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  settingsLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  continueButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  troubleshootCard: {
    marginBottom: Spacing.sm,
  },
  troubleshootHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  troubleshootSolutions: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    gap: Spacing.sm,
  },
  solutionItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  solutionBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.success,
    marginTop: 6,
  },
  supportSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing["2xl"],
    paddingVertical: Spacing.lg,
  },
});
