import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Platform,
  TextInput,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "@/hooks/useTheme";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { CommunicationStackParamList } from "@/navigation/CommunicationStackNavigator";

type VoIPCallingScreenRouteProp = RouteProp<CommunicationStackParamList, "VoIPCalling">;
type NavigationProp = NativeStackNavigationProp<CommunicationStackParamList>;

type CallState = "idle" | "connecting" | "ringing" | "connected" | "ended";

const DIAL_PAD = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["*", "0", "#"],
];

const DIAL_PAD_LETTERS: Record<string, string> = {
  "2": "ABC",
  "3": "DEF",
  "4": "GHI",
  "5": "JKL",
  "6": "MNO",
  "7": "PQRS",
  "8": "TUV",
  "9": "WXYZ",
};

interface DialPadButtonProps {
  digit: string;
  onPress: () => void;
  disabled?: boolean;
}

function DialPadButton({ digit, onPress, disabled }: DialPadButtonProps) {
  const { theme } = useTheme();
  const letters = DIAL_PAD_LETTERS[digit] || "";
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.9);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={styles.dialPadButtonContainer}
    >
      <Animated.View
        style={[
          styles.dialPadButton,
          { backgroundColor: theme.backgroundSecondary },
          animatedStyle,
          disabled && { opacity: 0.5 },
        ]}
      >
        <ThemedText type="h2" style={styles.dialPadDigit}>
          {digit}
        </ThemedText>
        {letters ? (
          <ThemedText type="caption" style={[styles.dialPadLetters, { color: theme.textSecondary }]}>
            {letters}
          </ThemedText>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

export default function VoIPCallingScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<VoIPCallingScreenRouteProp>();
  
  const initialPhoneNumber = route.params?.phoneNumber || "";
  const contactName = route.params?.contactName;
  
  const [phoneNumber, setPhoneNumber] = useState(initialPhoneNumber);
  const [callState, setCallState] = useState<CallState>("idle");
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [isVoIPAvailable, setIsVoIPAvailable] = useState(false);
  
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    checkVoIPAvailability();
  }, []);

  useEffect(() => {
    if (callState === "connected") {
      callTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
      
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: 1000 }),
          withTiming(1, { duration: 1000 })
        ),
        -1,
        false
      );
    } else {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
      cancelAnimation(pulseScale);
      pulseScale.value = 1;
    }

    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
    };
  }, [callState, pulseScale]);

  const checkVoIPAvailability = async () => {
    if (Platform.OS === "web") {
      setIsVoIPAvailable(false);
      return;
    }
    
    try {
      const TwilioVoice = require("@twilio/voice-react-native-sdk").Voice;
      setIsVoIPAvailable(true);
    } catch (error) {
      console.log("Twilio Voice SDK not available:", error);
      setIsVoIPAvailable(false);
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleDigitPress = useCallback((digit: string) => {
    if (callState === "idle") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setPhoneNumber((prev) => prev + digit);
    } else if (callState === "connected") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [callState]);

  const handleDeletePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPhoneNumber((prev) => prev.slice(0, -1));
  }, []);

  const handleCallPress = useCallback(async () => {
    if (!phoneNumber) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    if (!isVoIPAvailable) {
      try {
        setCallState("connecting");
        const response = await apiRequest("POST", "/api/twilio/call/initiate", { to: phoneNumber });
        const data = await response.json();
        
        if (data.sid) {
          setCallState("ringing");
          setTimeout(() => {
            setCallState("connected");
          }, 3000);
        } else {
          throw new Error("Failed to initiate call");
        }
      } catch (error) {
        console.error("Error initiating call:", error);
        setCallState("idle");
        Alert.alert("Call Failed", "Unable to initiate the call. Please try again.");
      }
      return;
    }

    try {
      setCallState("connecting");
      
      const tokenResponse = await apiRequest("POST", "/api/twilio/voice/token", {
        identity: `zeke-mobile-${Date.now()}`,
      });
      const { token } = await tokenResponse.json();
      
      setCallState("ringing");
      
      setTimeout(() => {
        setCallState("connected");
      }, 2000);
    } catch (error) {
      console.error("Error initiating VoIP call:", error);
      setCallState("idle");
      Alert.alert("Call Failed", "Unable to initiate the call. Please try again.");
    }
  }, [phoneNumber, isVoIPAvailable]);

  const handleEndCall = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setCallState("ended");
    setCallDuration(0);
    
    setTimeout(() => {
      setCallState("idle");
      if (route.params?.phoneNumber) {
        navigation.goBack();
      }
    }, 1000);
  }, [navigation, route.params]);

  const handleMuteToggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsMuted((prev) => !prev);
  }, []);

  const handleSpeakerToggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsSpeaker((prev) => !prev);
  }, []);

  const pulseAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const isInCall = callState === "connecting" || callState === "ringing" || callState === "connected";

  return (
    <ThemedView style={[styles.container, { paddingBottom: insets.bottom + Spacing.xl }]}>
      {Platform.OS === "web" ? (
        <View style={styles.webNotice}>
          <View style={[styles.noticeCard, { backgroundColor: theme.backgroundSecondary }]}>
            <Feather name="smartphone" size={48} color={theme.primary} />
            <ThemedText type="h3" style={styles.noticeTitle}>
              VoIP Available on Mobile
            </ThemedText>
            <ThemedText type="body" style={[styles.noticeText, { color: theme.textSecondary }]}>
              To make VoIP calls directly from the app, please use the mobile version with a development build.
            </ThemedText>
            <ThemedText type="caption" style={[styles.noticeCaption, { color: theme.textSecondary }]}>
              Build with: eas build --profile development --platform android
            </ThemedText>
          </View>
        </View>
      ) : null}
      
      <View style={styles.displayArea}>
        {contactName ? (
          <ThemedText type="h4" style={styles.contactName}>
            {contactName}
          </ThemedText>
        ) : null}
        
        <TextInput
          style={[styles.phoneNumberInput, { color: theme.text }]}
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          placeholder="Enter number"
          placeholderTextColor={theme.textSecondary}
          keyboardType="phone-pad"
          editable={callState === "idle"}
        />
        
        {isInCall ? (
          <View style={styles.callStatusContainer}>
            <Animated.View style={pulseAnimatedStyle}>
              <View style={[styles.callStatusDot, { 
                backgroundColor: callState === "connected" ? Colors.dark.success : Colors.dark.warning 
              }]} />
            </Animated.View>
            <ThemedText type="body" style={{ color: theme.textSecondary }}>
              {callState === "connecting" ? "Connecting..." : 
               callState === "ringing" ? "Ringing..." : 
               formatDuration(callDuration)}
            </ThemedText>
          </View>
        ) : null}
      </View>

      {isInCall ? (
        <View style={styles.callControlsContainer}>
          <Pressable
            onPress={handleMuteToggle}
            style={[
              styles.callControlButton,
              { backgroundColor: isMuted ? theme.error : theme.backgroundSecondary },
            ]}
          >
            <Feather name={isMuted ? "mic-off" : "mic"} size={24} color={theme.text} />
            <ThemedText type="caption" style={{ color: theme.textSecondary }}>
              {isMuted ? "Unmute" : "Mute"}
            </ThemedText>
          </Pressable>
          
          <Pressable
            onPress={handleSpeakerToggle}
            style={[
              styles.callControlButton,
              { backgroundColor: isSpeaker ? theme.primary : theme.backgroundSecondary },
            ]}
          >
            <Feather name="volume-2" size={24} color={theme.text} />
            <ThemedText type="caption" style={{ color: theme.textSecondary }}>
              Speaker
            </ThemedText>
          </Pressable>
          
          <Pressable
            onPress={() => {}}
            style={[styles.callControlButton, { backgroundColor: theme.backgroundSecondary }]}
          >
            <Feather name="grid" size={24} color={theme.text} />
            <ThemedText type="caption" style={{ color: theme.textSecondary }}>
              Keypad
            </ThemedText>
          </Pressable>
        </View>
      ) : (
        <View style={styles.dialPadContainer}>
          {DIAL_PAD.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.dialPadRow}>
              {row.map((digit) => (
                <DialPadButton
                  key={digit}
                  digit={digit}
                  onPress={() => handleDigitPress(digit)}
                  disabled={isInCall}
                />
              ))}
            </View>
          ))}
        </View>
      )}

      <View style={styles.actionButtonsContainer}>
        {!isInCall && phoneNumber.length > 0 ? (
          <Pressable onPress={handleDeletePress} style={styles.deleteButton}>
            <Feather name="delete" size={24} color={theme.textSecondary} />
          </Pressable>
        ) : (
          <View style={styles.deleteButton} />
        )}
        
        {isInCall ? (
          <Pressable onPress={handleEndCall} style={styles.endCallButton}>
            <LinearGradient
              colors={[Colors.dark.error, "#DC2626"]}
              style={styles.callButtonGradient}
            >
              <Feather name="phone-off" size={32} color="white" />
            </LinearGradient>
          </Pressable>
        ) : (
          <Pressable
            onPress={handleCallPress}
            disabled={!phoneNumber}
            style={[styles.callButton, !phoneNumber && { opacity: 0.5 }]}
          >
            <LinearGradient
              colors={[Colors.dark.success, "#22C55E"]}
              style={styles.callButtonGradient}
            >
              <Feather name="phone" size={32} color="white" />
            </LinearGradient>
          </Pressable>
        )}
        
        <View style={styles.deleteButton} />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  webNotice: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  noticeCard: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.xl,
    alignItems: "center",
    maxWidth: 320,
  },
  noticeTitle: {
    marginTop: Spacing.lg,
    textAlign: "center",
  },
  noticeText: {
    marginTop: Spacing.md,
    textAlign: "center",
    lineHeight: 22,
  },
  noticeCaption: {
    marginTop: Spacing.lg,
    textAlign: "center",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 11,
  },
  displayArea: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  contactName: {
    marginBottom: Spacing.sm,
  },
  phoneNumberInput: {
    fontSize: 32,
    fontWeight: "300",
    textAlign: "center",
    letterSpacing: 2,
    minWidth: 200,
  },
  callStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  callStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dialPadContainer: {
    flex: 1,
    justifyContent: "center",
    gap: Spacing.md,
  },
  dialPadRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.lg,
  },
  dialPadButtonContainer: {
    width: 80,
    height: 80,
  },
  dialPadButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  dialPadDigit: {
    fontSize: 32,
    fontWeight: "300",
  },
  dialPadLetters: {
    fontSize: 10,
    marginTop: 2,
    letterSpacing: 2,
  },
  callControlsContainer: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xl,
  },
  callControlButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xs,
  },
  actionButtonsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  deleteButton: {
    width: 60,
    height: 60,
    justifyContent: "center",
    alignItems: "center",
  },
  callButton: {
    marginHorizontal: Spacing.xl,
  },
  endCallButton: {
    marginHorizontal: Spacing.xl,
  },
  callButtonGradient: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
  },
});
