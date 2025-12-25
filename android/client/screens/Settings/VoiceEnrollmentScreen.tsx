import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Pressable,
  TextInput,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { Audio } from "expo-audio";
import * as FileSystem from "expo-file-system";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { wearableApi } from "@/lib/wearable-api";

type RecordingState = "idle" | "recording" | "processing" | "complete" | "error";

export function VoiceEnrollmentScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const { deviceId } = useAuth();

  const [speakerName, setSpeakerName] = useState("");
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [enrollmentResult, setEnrollmentResult] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (recordingState === "recording") {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [recordingState, pulseAnim]);

  const requestPermissions = async (): Promise<boolean> => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Microphone access is needed to record your voice sample."
        );
        return false;
      }
      return true;
    } catch (error) {
      console.error("[Voice Enrollment] Permission error:", error);
      return false;
    }
  };

  const startRecording = async () => {
    if (!speakerName.trim()) {
      Alert.alert("Name Required", "Please enter your name before recording.");
      return;
    }

    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = recording;
      setRecordingState("recording");
      setRecordingDuration(0);
      setErrorMessage(null);
      setEnrollmentResult(null);

      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      console.log("[Voice Enrollment] Recording started");
    } catch (error) {
      console.error("[Voice Enrollment] Failed to start recording:", error);
      setRecordingState("error");
      setErrorMessage("Failed to start recording. Please try again.");
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    try {
      setRecordingState("processing");

      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (uri) {
        setAudioUri(uri);
        console.log("[Voice Enrollment] Recording saved:", uri);

        if (recordingDuration < 3) {
          setRecordingState("error");
          setErrorMessage("Recording too short. Please record at least 3 seconds.");
          return;
        }

        await enrollVoice(uri);
      }
    } catch (error) {
      console.error("[Voice Enrollment] Failed to stop recording:", error);
      setRecordingState("error");
      setErrorMessage("Failed to save recording. Please try again.");
    }
  };

  const enrollVoice = async (uri: string) => {
    if (!deviceId) {
      setRecordingState("error");
      setErrorMessage("Device not configured. Please pair your device first.");
      return;
    }

    try {
      console.log("[Voice Enrollment] Enrolling voice for:", speakerName);

      const result = await wearableApi.enrollVoice(deviceId, speakerName.trim(), uri);

      if (result.success) {
        setRecordingState("complete");
        setEnrollmentResult(`Voice enrolled successfully for ${speakerName}`);
        console.log("[Voice Enrollment] Enrollment successful:", result.profileId);
      } else {
        setRecordingState("error");
        setErrorMessage(result.message || "Enrollment failed. Please try again.");
      }
    } catch (error) {
      console.error("[Voice Enrollment] Enrollment error:", error);
      setRecordingState("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Enrollment failed. Please try again."
      );
    }
  };

  const resetState = () => {
    setRecordingState("idle");
    setRecordingDuration(0);
    setAudioUri(null);
    setEnrollmentResult(null);
    setErrorMessage(null);
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const renderRecordingUI = () => {
    switch (recordingState) {
      case "idle":
        return (
          <View style={styles.centerContent}>
            <ThemedText style={[styles.instructions, { color: theme.textSecondary }]}>
              Record a voice sample of at least 5 seconds.{"\n"}
              Speak naturally - introduce yourself or read a sentence.
            </ThemedText>
            <Pressable
              onPress={startRecording}
              style={[styles.recordButton, { backgroundColor: theme.primary }]}
            >
              <Feather name="mic" size={32} color="white" />
            </Pressable>
            <ThemedText style={{ marginTop: Spacing.md, color: theme.textSecondary }}>
              Tap to start recording
            </ThemedText>
          </View>
        );

      case "recording":
        return (
          <View style={styles.centerContent}>
            <ThemedText style={[styles.duration, { color: theme.text }]}>
              {formatDuration(recordingDuration)}
            </ThemedText>
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <Pressable
                onPress={stopRecording}
                style={[styles.recordButton, styles.recordingActive, { backgroundColor: theme.error }]}
              >
                <Feather name="square" size={28} color="white" />
              </Pressable>
            </Animated.View>
            <ThemedText style={{ marginTop: Spacing.md, color: theme.textSecondary }}>
              Tap to stop recording
            </ThemedText>
            {recordingDuration < 3 ? (
              <ThemedText style={{ marginTop: Spacing.sm, color: theme.error, fontSize: 12 }}>
                Record at least 3 seconds
              </ThemedText>
            ) : null}
          </View>
        );

      case "processing":
        return (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={theme.primary} />
            <ThemedText style={{ marginTop: Spacing.lg, color: theme.textSecondary }}>
              Processing voice sample...
            </ThemedText>
          </View>
        );

      case "complete":
        return (
          <View style={styles.centerContent}>
            <View style={[styles.successIcon, { backgroundColor: theme.success + "20" }]}>
              <Feather name="check" size={40} color={theme.success} />
            </View>
            <ThemedText style={{ marginTop: Spacing.lg, textAlign: "center", color: theme.text }}>
              {enrollmentResult}
            </ThemedText>
            <Pressable
              onPress={resetState}
              style={[styles.actionButton, { backgroundColor: theme.primary, marginTop: Spacing.xl }]}
            >
              <ThemedText style={{ color: "white", fontWeight: "600" }}>
                Enroll Another Voice
              </ThemedText>
            </Pressable>
          </View>
        );

      case "error":
        return (
          <View style={styles.centerContent}>
            <View style={[styles.errorIcon, { backgroundColor: theme.error + "20" }]}>
              <Feather name="x" size={40} color={theme.error} />
            </View>
            <ThemedText style={{ marginTop: Spacing.lg, textAlign: "center", color: theme.error }}>
              {errorMessage}
            </ThemedText>
            <Pressable
              onPress={resetState}
              style={[styles.actionButton, { backgroundColor: theme.primary, marginTop: Spacing.xl }]}
            >
              <ThemedText style={{ color: "white", fontWeight: "600" }}>
                Try Again
              </ThemedText>
            </Pressable>
          </View>
        );
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: headerHeight + Spacing.xl,
          paddingHorizontal: Spacing.lg,
          paddingBottom: insets.bottom + Spacing.xl,
          backgroundColor: theme.backgroundRoot,
        },
      ]}
    >
      <View style={{ marginBottom: Spacing.xl }}>
        <ThemedText style={{ fontSize: 16, marginBottom: Spacing.md, color: theme.text }}>
          Speaker Name
        </ThemedText>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.backgroundSecondary,
              color: theme.text,
              opacity: recordingState !== "idle" ? 0.5 : 1,
            },
          ]}
          value={speakerName}
          onChangeText={setSpeakerName}
          placeholder="Enter your name"
          placeholderTextColor={theme.textSecondary}
          editable={recordingState === "idle"}
        />
      </View>

      <View
        style={[
          styles.recordingArea,
          { backgroundColor: theme.backgroundSecondary },
        ]}
      >
        {renderRecordingUI()}
      </View>

      {Platform.OS === "web" ? (
        <View style={{ marginTop: Spacing.lg, padding: Spacing.md, backgroundColor: theme.backgroundSecondary, borderRadius: 8 }}>
          <ThemedText style={{ color: theme.textSecondary, textAlign: "center", fontSize: 13 }}>
            Voice enrollment works best in the Expo Go app on your mobile device.
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  input: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: 8,
    fontSize: 16,
  },
  recordingArea: {
    flex: 1,
    borderRadius: 16,
    padding: Spacing.xl,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  instructions: {
    textAlign: "center",
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  recordingActive: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  duration: {
    fontSize: 48,
    fontWeight: "600",
    marginBottom: Spacing.lg,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  errorIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  actionButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: 8,
  },
});
