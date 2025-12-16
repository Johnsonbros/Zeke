import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  interpolateColor,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Colors, Gradients } from "@/constants/theme";
import { bluetoothService, ConnectionState, BLEDevice } from "@/lib/bluetooth";
import { deepgramService, DeepgramConnectionState } from "@/lib/deepgram";

export default function LiveCaptureScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation();
  const { theme } = useTheme();

  const [connectedDevice, setConnectedDevice] = useState<BLEDevice | null>(null);
  const [bleConnectionState, setBleConnectionState] = useState<ConnectionState>("disconnected");
  const [deepgramState, setDeepgramState] = useState<DeepgramConnectionState>("disconnected");
  const [isCapturing, setIsCapturing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const pulseAnim = useSharedValue(0);
  const durationInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptScrollRef = useRef<ScrollView>(null);
  const [isConfigLoading, setIsConfigLoading] = useState(true);
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      setIsConfigLoading(true);
      const configLoaded = await deepgramService.fetchConfig();
      setIsConfigured(configLoaded);
      setIsConfigLoading(false);

      const device = await bluetoothService.getConnectedDevice();
      setConnectedDevice(device);
    };
    initialize();

    const unsubscribeBle = bluetoothService.onConnectionStateChange((state, device) => {
      setBleConnectionState(state);
      setConnectedDevice(device);
    });

    const unsubscribeDeepgram = deepgramService.onConnectionStateChange((state) => {
      setDeepgramState(state);
    });

    const unsubscribeTranscript = deepgramService.onTranscription((text, isFinal) => {
      if (isFinal) {
        setTranscript((prev) => (prev ? `${prev} ${text}` : text));
        setInterimTranscript("");
      } else {
        setInterimTranscript(text);
      }
      transcriptScrollRef.current?.scrollToEnd({ animated: true });
    });

    const unsubscribeError = deepgramService.onError((err) => {
      setError(err);
      if (isCapturing) {
        stopCapture();
      }
    });

    return () => {
      unsubscribeBle();
      unsubscribeDeepgram();
      unsubscribeTranscript();
      unsubscribeError();
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isCapturing) {
      pulseAnim.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1000 }),
          withTiming(0, { duration: 1000 })
        ),
        -1,
        false
      );
    } else {
      pulseAnim.value = withTiming(0);
    }
  }, [isCapturing]);

  const startCapture = useCallback(async () => {
    if (!connectedDevice) {
      Alert.alert(
        "No Device Connected",
        "Please connect to an Omi or Limitless device first in Settings.",
        [{ text: "OK" }]
      );
      return;
    }

    if (!isConfigured) {
      Alert.alert(
        "Transcription Not Available",
        "Real-time transcription is not configured. Please add the DEEPGRAM_API_KEY secret.",
        [{ text: "OK" }]
      );
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setError(null);
    setTranscript("");
    setInterimTranscript("");
    setDuration(0);

    const started = await deepgramService.startStreamingFromBluetooth();
    if (started) {
      setIsCapturing(true);
      durationInterval.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } else {
      Alert.alert(
        "Capture Failed",
        "Could not start audio capture. Please check your device connection.",
        [{ text: "OK" }]
      );
    }
  }, [connectedDevice, isConfigured]);

  const stopCapture = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    deepgramService.stopStreaming();
    setIsCapturing(false);

    if (durationInterval.current) {
      clearInterval(durationInterval.current);
      durationInterval.current = null;
    }
  }, []);

  const handleSaveCapture = useCallback(async () => {
    if (!transcript.trim()) {
      Alert.alert("Nothing to Save", "No transcript was captured.", [{ text: "OK" }]);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    Alert.prompt
      ? Alert.prompt(
          "Save Capture",
          "Enter a title for this memory (optional):",
          async (title) => {
            const success = await deepgramService.sendCaptureToZeke(title || undefined);
            if (success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert("Saved!", "Your capture has been saved to ZEKE.", [
                {
                  text: "OK",
                  onPress: () => {
                    deepgramService.clearSession();
                    setTranscript("");
                    navigation.goBack();
                  },
                },
              ]);
            } else {
              Alert.alert("Save Failed", "Could not save the capture. Please try again.", [
                { text: "OK" },
              ]);
            }
          },
          "plain-text",
          ""
        )
      : Alert.alert(
          "Save Capture",
          "Save this transcript to ZEKE memories?",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Save",
              onPress: async () => {
                const success = await deepgramService.sendCaptureToZeke();
                if (success) {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  Alert.alert("Saved!", "Your capture has been saved to ZEKE.", [
                    {
                      text: "OK",
                      onPress: () => {
                        deepgramService.clearSession();
                        setTranscript("");
                        navigation.goBack();
                      },
                    },
                  ]);
                } else {
                  Alert.alert("Save Failed", "Could not save the capture. Please try again.", [
                    { text: "OK" },
                  ]);
                }
              },
            },
          ]
        );
  }, [transcript, navigation]);

  const handleDiscardCapture = useCallback(() => {
    if (!transcript.trim()) {
      deepgramService.clearSession();
      navigation.goBack();
      return;
    }

    Alert.alert("Discard Capture?", "This will delete the current transcript.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          deepgramService.clearSession();
          setTranscript("");
          navigation.goBack();
        },
      },
    ]);
  }, [transcript, navigation]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const pulseStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      pulseAnim.value,
      [0, 1],
      [Colors.dark.error, "rgba(239, 68, 68, 0.5)"]
    );
    return {
      backgroundColor,
      transform: [{ scale: 1 + pulseAnim.value * 0.1 }],
    };
  });

  const getStatusColor = (): string => {
    if (bleConnectionState !== "connected") return Colors.dark.error;
    if (deepgramState === "connected") return Colors.dark.success;
    if (deepgramState === "connecting") return Colors.dark.warning;
    return Colors.dark.textSecondary;
  };

  const getStatusText = (): string => {
    if (bleConnectionState !== "connected") return "Device Disconnected";
    if (deepgramState === "connected") return "Live Transcribing";
    if (deepgramState === "connecting") return "Connecting...";
    return connectedDevice?.name || "Ready";
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: headerHeight + Spacing.md }]}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
          <ThemedText type="small" secondary>
            {getStatusText()}
          </ThemedText>
        </View>

        {isCapturing ? (
          <View style={styles.durationContainer}>
            <Animated.View style={[styles.recordingDot, pulseStyle]} />
            <ThemedText type="h2" style={styles.duration}>
              {formatDuration(duration)}
            </ThemedText>
          </View>
        ) : null}
      </View>

      <ScrollView
        ref={transcriptScrollRef}
        style={styles.transcriptContainer}
        contentContainerStyle={[
          styles.transcriptContent,
          { paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {transcript || interimTranscript ? (
          <>
            <ThemedText type="body" style={styles.transcriptText}>
              {transcript}
            </ThemedText>
            {interimTranscript ? (
              <ThemedText type="body" style={[styles.transcriptText, styles.interimText]}>
                {interimTranscript}
              </ThemedText>
            ) : null}
          </>
        ) : (
          <View style={styles.emptyState}>
            <Feather
              name={isCapturing ? "mic" : "volume-2"}
              size={48}
              color={theme.textSecondary}
            />
            <ThemedText type="body" secondary style={styles.emptyText}>
              {isCapturing
                ? "Listening for audio..."
                : connectedDevice
                ? "Tap the button below to start capturing"
                : "Connect a device to begin"}
            </ThemedText>
          </View>
        )}
      </ScrollView>

      {error ? (
        <Card elevation={1} style={styles.errorCard}>
          <Feather name="alert-circle" size={16} color={Colors.dark.error} />
          <ThemedText type="small" style={{ color: Colors.dark.error, marginLeft: Spacing.sm }}>
            {error}
          </ThemedText>
        </Card>
      ) : null}

      <View
        style={[
          styles.controlsContainer,
          { paddingBottom: insets.bottom + Spacing.lg },
        ]}
      >
        {isCapturing ? (
          <View style={styles.controlsRow}>
            <Pressable
              onPress={stopCapture}
              style={({ pressed }) => [
                styles.stopButton,
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <View style={styles.stopButtonInner}>
                <Feather name="square" size={24} color="#FFFFFF" />
              </View>
            </Pressable>
          </View>
        ) : transcript ? (
          <View style={styles.controlsRow}>
            <Pressable
              onPress={handleDiscardCapture}
              style={({ pressed }) => [
                styles.secondaryButton,
                { opacity: pressed ? 0.8 : 1, backgroundColor: theme.backgroundSecondary },
              ]}
            >
              <Feather name="trash-2" size={20} color={Colors.dark.error} />
            </Pressable>
            <Pressable
              onPress={handleSaveCapture}
              style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
            >
              <LinearGradient colors={Gradients.primary} style={styles.saveButton}>
                <Feather name="check" size={24} color="#FFFFFF" />
                <ThemedText type="body" style={{ color: "#FFFFFF", marginLeft: Spacing.sm }}>
                  Save Capture
                </ThemedText>
              </LinearGradient>
            </Pressable>
          </View>
        ) : (
          <View style={styles.controlsRow}>
            <Pressable
              onPress={startCapture}
              disabled={bleConnectionState !== "connected"}
              style={({ pressed }) => ({
                opacity: pressed || bleConnectionState !== "connected" ? 0.6 : 1,
              })}
            >
              <LinearGradient colors={Gradients.primary} style={styles.captureButton}>
                <Feather name="mic" size={32} color="#FFFFFF" />
              </LinearGradient>
            </Pressable>
          </View>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  durationContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  duration: {
    fontVariant: ["tabular-nums"],
  },
  transcriptContainer: {
    flex: 1,
  },
  transcriptContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  transcriptText: {
    lineHeight: 28,
  },
  interimText: {
    opacity: 0.6,
    fontStyle: "italic",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 100,
    gap: Spacing.lg,
  },
  emptyText: {
    textAlign: "center",
    paddingHorizontal: Spacing.xl,
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  controlsContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.lg,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  stopButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.dark.error,
    alignItems: "center",
    justifyContent: "center",
  },
  stopButtonInner: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
  },
});
