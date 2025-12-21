import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";

interface AudioPlayerProps {
  audioUri?: string;
  duration?: number;
  title?: string;
  timestamp?: string;
  onPlayStateChange?: (isPlaying: boolean) => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const SAMPLE_AUDIO_URI =
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";

export function AudioPlayer({
  audioUri = SAMPLE_AUDIO_URI,
  duration: initialDuration = 0,
  title,
  timestamp,
  onPlayStateChange,
}: AudioPlayerProps) {
  const { theme } = useTheme();
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);

  const progress = useSharedValue(0);
  const scrubberScale = useSharedValue(1);
  const timelineWidth = useSharedValue(0);

  const player = useAudioPlayer(audioUri);
  const status = useAudioPlayerStatus(player);

  const isPlaying = status.playing;
  const currentTime = isScrubbing ? scrubTime : status.currentTime || 0;
  const duration = status.duration || initialDuration || 180;

  useEffect(() => {
    if (!isScrubbing && duration > 0) {
      progress.value = currentTime / duration;
    }
  }, [currentTime, duration, isScrubbing, progress]);

  useEffect(() => {
    onPlayStateChange?.(isPlaying);
  }, [isPlaying, onPlayStateChange]);

  const handlePlayPause = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  }, [isPlaying, player]);

  const handleSkipBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newTime = Math.max(0, currentTime - 15);
    player.seekTo(newTime);
  }, [currentTime, player]);

  const handleSkipForward = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newTime = Math.min(duration, currentTime + 15);
    player.seekTo(newTime);
  }, [currentTime, duration, player]);

  const updateTimeFromGesture = useCallback(
    (x: number) => {
      const clampedX = Math.max(0, Math.min(x, timelineWidth.value));
      const newProgress =
        timelineWidth.value > 0 ? clampedX / timelineWidth.value : 0;
      const newTime = newProgress * duration;
      progress.value = newProgress;
      setScrubTime(newTime);
    },
    [duration, progress, timelineWidth],
  );

  const finalizeScrub = useCallback(() => {
    player.seekTo(scrubTime);
    setIsScrubbing(false);
  }, [scrubTime, player]);

  const scrubGesture = Gesture.Pan()
    .onStart((e) => {
      scrubberScale.value = withSpring(1.5);
      runOnJS(setIsScrubbing)(true);
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
      runOnJS(updateTimeFromGesture)(e.x);
    })
    .onUpdate((e) => {
      runOnJS(updateTimeFromGesture)(e.x);
    })
    .onEnd(() => {
      scrubberScale.value = withSpring(1);
      runOnJS(finalizeScrub)();
    });

  const tapGesture = Gesture.Tap().onEnd((e) => {
    runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
    runOnJS(updateTimeFromGesture)(e.x);
    const clampedX = Math.max(0, Math.min(e.x, timelineWidth.value));
    const newProgress =
      timelineWidth.value > 0 ? clampedX / timelineWidth.value : 0;
    const newTime = newProgress * duration;
    player.seekTo(newTime);
  });

  const combinedGesture = Gesture.Race(scrubGesture, tapGesture);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const scrubberStyle = useAnimatedStyle(() => ({
    left: `${progress.value * 100}%`,
    transform: [{ scale: scrubberScale.value }, { translateX: -8 }],
  }));

  const handleTimelineLayout = (event: any) => {
    timelineWidth.value = event.nativeEvent.layout.width;
  };

  return (
    <View
      style={[styles.container, { backgroundColor: theme.backgroundDefault }]}
    >
      {title ? (
        <View style={styles.header}>
          <ThemedText type="body" style={styles.title} numberOfLines={1}>
            {title}
          </ThemedText>
          {timestamp ? (
            <ThemedText type="caption" secondary>
              {timestamp}
            </ThemedText>
          ) : null}
        </View>
      ) : null}

      <View style={styles.timelineContainer}>
        <GestureDetector gesture={combinedGesture}>
          <View style={styles.timelineWrapper} onLayout={handleTimelineLayout}>
            <View
              style={[
                styles.timelineTrack,
                { backgroundColor: theme.backgroundSecondary },
              ]}
            >
              <Animated.View
                style={[
                  styles.timelineProgress,
                  { backgroundColor: Colors.dark.primary },
                  progressStyle,
                ]}
              />
            </View>
            <Animated.View
              style={[
                styles.scrubber,
                { backgroundColor: Colors.dark.primary },
                scrubberStyle,
              ]}
            />
          </View>
        </GestureDetector>
      </View>

      <View style={styles.timeLabels}>
        <ThemedText type="caption" secondary>
          {formatTime(currentTime)}
        </ThemedText>
        <ThemedText type="caption" secondary>
          {formatTime(duration)}
        </ThemedText>
      </View>

      <View style={styles.controls}>
        <Pressable
          onPress={handleSkipBack}
          style={({ pressed }) => [
            styles.controlButton,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Feather name="rotate-ccw" size={20} color={theme.text} />
          <ThemedText type="caption" secondary style={styles.skipLabel}>
            15s
          </ThemedText>
        </Pressable>

        <Pressable
          onPress={handlePlayPause}
          style={({ pressed }) => [
            styles.playButton,
            {
              backgroundColor: Colors.dark.primary,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Feather
            name={isPlaying ? "pause" : "play"}
            size={28}
            color="#FFFFFF"
          />
        </Pressable>

        <Pressable
          onPress={handleSkipForward}
          style={({ pressed }) => [
            styles.controlButton,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Feather name="rotate-cw" size={20} color={theme.text} />
          <ThemedText type="caption" secondary style={styles.skipLabel}>
            15s
          </ThemedText>
        </Pressable>
      </View>

      {isScrubbing ? (
        <View
          style={[
            styles.scrubbingIndicator,
            { backgroundColor: theme.backgroundSecondary },
          ]}
        >
          <ThemedText type="h3">{formatTime(scrubTime)}</ThemedText>
        </View>
      ) : null}
    </View>
  );
}

export function CompactAudioPlayer({
  audioUri = SAMPLE_AUDIO_URI,
  duration: initialDuration = 0,
  title,
}: {
  audioUri?: string;
  duration?: number;
  title?: string;
}) {
  const { theme } = useTheme();

  const player = useAudioPlayer(audioUri);
  const status = useAudioPlayerStatus(player);

  const isPlaying = status.playing;
  const currentTime = status.currentTime || 0;
  const duration = status.duration || initialDuration || 180;

  const progress = useSharedValue(0);

  useEffect(() => {
    if (duration > 0) {
      progress.value = currentTime / duration;
    }
  }, [currentTime, duration, progress]);

  const handlePlayPause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  };

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <View
      style={[
        styles.compactContainer,
        { backgroundColor: theme.backgroundSecondary },
      ]}
    >
      <Pressable
        onPress={handlePlayPause}
        style={({ pressed }) => [
          styles.compactPlayButton,
          { backgroundColor: Colors.dark.primary, opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <Feather
          name={isPlaying ? "pause" : "play"}
          size={16}
          color="#FFFFFF"
        />
      </Pressable>

      <View style={styles.compactContent}>
        {title ? (
          <ThemedText
            type="small"
            numberOfLines={1}
            style={styles.compactTitle}
          >
            {title}
          </ThemedText>
        ) : null}
        <View style={styles.compactTimelineWrapper}>
          <View
            style={[
              styles.compactTimeline,
              { backgroundColor: theme.backgroundTertiary },
            ]}
          >
            <Animated.View
              style={[
                styles.compactProgress,
                { backgroundColor: Colors.dark.primary },
                progressStyle,
              ]}
            />
          </View>
          <ThemedText type="caption" secondary style={styles.compactTime}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.lg,
  },
  title: {
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  timelineContainer: {
    marginBottom: Spacing.sm,
  },
  timelineWrapper: {
    height: 24,
    justifyContent: "center",
  },
  timelineTrack: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  timelineProgress: {
    height: "100%",
    borderRadius: 2,
  },
  scrubber: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    top: 4,
  },
  timeLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing["2xl"],
  },
  controlButton: {
    alignItems: "center",
    padding: Spacing.sm,
  },
  skipLabel: {
    marginTop: 2,
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  scrubbingIndicator: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: [{ translateX: -40 }, { translateY: -30 }],
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  compactContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  compactPlayButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  compactContent: {
    flex: 1,
  },
  compactTitle: {
    marginBottom: Spacing.xs,
  },
  compactTimelineWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  compactTimeline: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  compactProgress: {
    height: "100%",
    borderRadius: 2,
  },
  compactTime: {
    minWidth: 70,
  },
});
