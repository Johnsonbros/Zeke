import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Platform,
  Alert,
  Linking,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAudioRecorder, AudioModule, RecordingPresets } from "expo-audio";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  cancelAnimation,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";

interface VoiceInputButtonProps {
  onRecordingComplete: (audioUri: string, durationSeconds: number) => void;
  disabled?: boolean;
}

export function VoiceInputButton({
  onRecordingComplete,
  disabled,
}: VoiceInputButtonProps) {
  const { theme } = useTheme();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [permissionStatus, setPermissionStatus] = useState<{
    granted: boolean;
    canAskAgain: boolean;
  } | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const pulseScale = useSharedValue(1);
  const buttonScale = useSharedValue(1);
  const waveOpacity = useSharedValue(0);

  useEffect(() => {
    checkPermission();
  }, []);

  const checkPermission = async () => {
    if (Platform.OS === "web") {
      setPermissionStatus({ granted: false, canAskAgain: false });
      return;
    }
    try {
      const status = await AudioModule.getRecordingPermissionsAsync();
      setPermissionStatus({
        granted: status.granted,
        canAskAgain: status.canAskAgain,
      });
    } catch (error) {
      console.error("Error checking audio permission:", error);
      setPermissionStatus({ granted: false, canAskAgain: false });
    }
  };

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.3, { duration: 600 }),
          withTiming(1, { duration: 600 }),
        ),
        -1,
        false,
      );
      waveOpacity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 600 }),
          withTiming(0.2, { duration: 600 }),
        ),
        -1,
        false,
      );
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      cancelAnimation(pulseScale);
      cancelAnimation(waveOpacity);
      pulseScale.value = withTiming(1);
      waveOpacity.value = withTiming(0);
      setRecordingDuration(0);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording, pulseScale, waveOpacity]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const openSettings = async () => {
    try {
      await Linking.openSettings();
    } catch (error) {
      console.error("Could not open settings:", error);
    }
  };

  const handlePress = useCallback(async () => {
    if (Platform.OS === "web") {
      Alert.alert(
        "Voice Input Not Available",
        "Voice input is only available in the mobile app. Please use Expo Go to access this feature.",
      );
      return;
    }

    if (disabled) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    buttonScale.value = withSequence(withSpring(0.9), withSpring(1));

    if (isRecording) {
      const finalDuration = recordingDuration;
      try {
        await recorder.stop();
        setIsRecording(false);

        const uri = recorder.uri;
        if (uri) {
          onRecordingComplete(uri, finalDuration);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch (error) {
        console.error("Error stopping recording:", error);
        setIsRecording(false);
      }
    } else {
      if (!permissionStatus?.granted) {
        const status = await AudioModule.requestRecordingPermissionsAsync();
        setPermissionStatus({
          granted: status.granted,
          canAskAgain: status.canAskAgain,
        });

        if (!status.granted) {
          if (!status.canAskAgain && (Platform.OS as string) !== "web") {
            Alert.alert(
              "Microphone Permission Required",
              "Microphone access was denied. Please enable it in your device settings to use voice input.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Open Settings", onPress: openSettings },
              ],
            );
          } else {
            Alert.alert(
              "Microphone Permission Required",
              "Please enable microphone access to use voice input.",
            );
          }
          return;
        }
      }

      try {
        await recorder.record();
        setIsRecording(true);
      } catch (error) {
        console.error("Error starting recording:", error);
        Alert.alert(
          "Recording Error",
          "Could not start recording. Please try again.",
        );
      }
    }
  }, [
    isRecording,
    disabled,
    buttonScale,
    permissionStatus,
    recorder,
    recordingDuration,
    onRecordingComplete,
  ]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: waveOpacity.value,
  }));

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  return (
    <View style={styles.container}>
      {isRecording ? (
        <Animated.View
          style={[
            styles.pulseRing,
            { borderColor: Colors.dark.error },
            pulseStyle,
          ]}
        />
      ) : null}
      <Animated.View style={buttonAnimatedStyle}>
        <Pressable
          onPress={handlePress}
          disabled={disabled}
          style={[
            styles.button,
            {
              backgroundColor: isRecording
                ? Colors.dark.error
                : theme.backgroundSecondary,
              opacity: disabled ? 0.5 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={isRecording ? "Stop recording" : "Start voice input"}
          accessibilityHint={
            isRecording
              ? "Double tap to stop recording and send message"
              : "Double tap to start voice recording"
          }
          accessibilityState={{ disabled, busy: isRecording }}
        >
          <Feather
            name={isRecording ? "square" : "mic"}
            size={18}
            color={isRecording ? "#FFFFFF" : theme.text}
          />
        </Pressable>
      </Animated.View>
      {isRecording ? (
        <View style={styles.durationBadge}>
          <View style={styles.recordingDot} />
          <ThemedText type="caption" style={{ color: Colors.dark.error }}>
            {formatDuration(recordingDuration)}
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
  },
  durationBadge: {
    position: "absolute",
    top: -24,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    gap: 4,
  },
  recordingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.error,
  },
});
