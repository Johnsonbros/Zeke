/**
 * ============================================================================
 * CRITICAL FILE - SMS PAIRING HANDSHAKE
 * ============================================================================
 * 
 * This file contains the device pairing flow for ZEKE AI.
 * 
 * DO NOT MODIFY without explicit approval from the project owner.
 * 
 * Changes to this file can break:
 * - Device authentication
 * - SMS code verification
 * - User onboarding flow
 * 
 * If changes are required, ensure thorough testing on both iOS and Android
 * before deployment.
 * 
 * Related critical files:
 * - client/context/AuthContext.tsx
 * - server/routes.ts (SMS pairing endpoints)
 * - server/device-auth.ts
 * ============================================================================
 */

import React, { useState, useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Device from "expo-device";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { Colors, Gradients, Spacing, BorderRadius } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";

type PairingStep = "request" | "verify" | "legacy";

export function PairingScreen() {
  const insets = useSafeAreaInsets();
  const { requestSmsCode, verifySmsCode, pairDevice, smsPairingState, isLoading, error } = useAuth();
  const [step, setStep] = useState<PairingStep>("request");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [code, setCode] = useState(["", "", "", ""]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [legacySecret, setLegacySecret] = useState("");
  const [codeSentSuccess, setCodeSentSuccess] = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (countdown <= 0) return;
    
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown]);

  useEffect(() => {
    if (smsPairingState.attemptsRemaining !== null) {
      setAttemptsRemaining(smsPairingState.attemptsRemaining);
    }
  }, [smsPairingState.attemptsRemaining]);

  useEffect(() => {
    if (smsPairingState.sessionId && smsPairingState.expiresIn && smsPairingState.expiresIn > 0) {
      console.log("[Pairing] Restoring session from context:", smsPairingState.sessionId);
      setSessionId(smsPairingState.sessionId);
      setCountdown(smsPairingState.expiresIn);
      setCodeSentSuccess(true);
      setStep("verify");
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }, []);

  const getDeviceName = (): string => {
    if (Platform.OS === "web") {
      return "Web Browser";
    }
    return Device.deviceName || Device.modelName || `${Platform.OS} Device`;
  };

  const formatCountdown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleRequestCode = async () => {
    setLocalError(null);
    setAttemptsRemaining(null);
    setCodeSentSuccess(false);
    const deviceName = getDeviceName();
    const result = await requestSmsCode(deviceName);
    if (result.success && result.sessionId) {
      setSessionId(result.sessionId);
      setCountdown(result.expiresIn || 300);
      setCodeSentSuccess(true);
      setStep("verify");
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) {
      return;
    }

    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 4).split('');
      const newCode = ["", "", "", ""];
      digits.forEach((digit, i) => {
        newCode[i] = digit;
      });
      setCode(newCode);
      setLocalError(null);
      if (digits.length === 4) {
        inputRefs.current[3]?.focus();
      } else if (digits.length > 0) {
        inputRefs.current[Math.min(digits.length, 3)]?.focus();
      }
      return;
    }

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    setLocalError(null);

    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (index: number, key: string) => {
    if (key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyCode = async () => {
    const finalCode = code.join("");
    if (finalCode.length !== 4) {
      setLocalError("Please enter all 4 digits");
      return;
    }

    if (!sessionId || countdown <= 0) {
      setLocalError("Session expired. Please request a new code.");
      setStep("request");
      setCountdown(0);
      return;
    }

    setLocalError(null);
    const result = await verifySmsCode(sessionId, finalCode);
    if (!result.success) {
      if (result.attemptsRemaining !== undefined) {
        setAttemptsRemaining(result.attemptsRemaining);
      }
      if (result.attemptsRemaining === 0) {
        setCode(["", "", "", ""]);
        setStep("request");
        setSessionId(null);
        setCountdown(0);
        setAttemptsRemaining(null);
      }
    }
  };

  const handleLegacyPair = async () => {
    if (!legacySecret.trim()) {
      setLocalError("Please enter the pairing secret");
      return;
    }
    setLocalError(null);
    const deviceName = getDeviceName();
    const success = await pairDevice(legacySecret.trim(), deviceName);
    if (!success) {
      setLegacySecret("");
    }
  };

  const isCodeComplete = code.every((d) => d.length === 1);

  const handleBack = () => {
    setStep("request");
    setCode(["", "", "", ""]);
    setSessionId(null);
    setLocalError(null);
    setCountdown(0);
    setAttemptsRemaining(null);
    setLegacySecret("");
    setCodeSentSuccess(false);
  };

  const handleSwitchToLegacy = () => {
    setLocalError(null);
    setStep("legacy");
  };

  const handleBackToSms = () => {
    setLocalError(null);
    setLegacySecret("");
    setStep("request");
  };

  const displayError = step !== "legacy" ? (localError || error) : null;
  const legacyDisplayError = step === "legacy" ? localError : null;

  return (
    <ThemedView style={styles.container}>
      <KeyboardAwareScrollViewCompat
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing["2xl"],
            paddingBottom: insets.bottom + Spacing.xl,
          },
        ]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
      >
        <View style={styles.header}>
          <LinearGradient
            colors={Gradients.primary}
            style={styles.iconContainer}
          >
            <Feather name="shield" size={48} color={Colors.dark.text} />
          </LinearGradient>

          <ThemedText style={styles.title}>ZEKE Command Center</ThemedText>
          <ThemedText style={styles.subtitle}>
            {step === "request" ? "Secure Device Pairing" : step === "verify" ? "Enter Verification Code" : "Legacy Pairing"}
          </ThemedText>
        </View>

        {step === "request" ? (
          <View style={styles.form}>
            <ThemedText style={styles.label}>
              Tap below to receive a verification code via SMS
            </ThemedText>

            {displayError ? (
              <View style={styles.errorContainer}>
                <Feather
                  name="alert-circle"
                  size={16}
                  color={Colors.dark.error}
                />
                <ThemedText style={styles.errorText}>{displayError}</ThemedText>
              </View>
            ) : null}

            <Pressable
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleRequestCode}
              disabled={isLoading}
            >
              <LinearGradient
                colors={Gradients.accent}
                style={styles.buttonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {isLoading ? (
                  <ActivityIndicator color={Colors.dark.text} />
                ) : (
                  <>
                    <Feather name="smartphone" size={20} color={Colors.dark.text} />
                    <ThemedText style={styles.buttonText}>Send Code to Phone</ThemedText>
                  </>
                )}
              </LinearGradient>
            </Pressable>

            <Pressable
              style={styles.legacyLink}
              onPress={handleSwitchToLegacy}
              disabled={isLoading}
            >
              <Feather name="key" size={14} color={Colors.dark.textSecondary} />
              <ThemedText style={styles.legacyLinkText}>Have a pairing secret?</ThemedText>
            </Pressable>
          </View>
        ) : step === "verify" ? (
          <View style={styles.form}>
            {codeSentSuccess ? (
              <View style={styles.successContainer}>
                <Feather name="check-circle" size={18} color="#10B981" />
                <ThemedText style={styles.successText}>
                  Code sent! Check your phone for the SMS
                </ThemedText>
              </View>
            ) : null}

            <ThemedText style={styles.label}>
              Enter the 4-digit code below
            </ThemedText>

            <View style={styles.codeContainer}>
              {code.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={(ref) => { inputRefs.current[index] = ref; }}
                  style={[
                    styles.codeInput,
                    digit ? styles.codeInputFilled : null,
                  ]}
                  value={digit}
                  onChangeText={(value) => handleCodeChange(index, value)}
                  onKeyPress={({ nativeEvent }) =>
                    handleKeyPress(index, nativeEvent.key)
                  }
                  keyboardType="number-pad"
                  maxLength={index === 0 ? 4 : 1}
                  textContentType={index === 0 ? "oneTimeCode" : "none"}
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  selectTextOnFocus
                  editable={!isLoading}
                  autoFocus={index === 0}
                />
              ))}
            </View>

            {countdown > 0 ? (
              <ThemedText style={[styles.expiryText, countdown < 60 && styles.expiryWarning]}>
                Code expires in {formatCountdown(countdown)}
              </ThemedText>
            ) : null}

            {attemptsRemaining !== null ? (
              <ThemedText style={styles.attemptsText}>
                {attemptsRemaining > 0 
                  ? `${attemptsRemaining} attempt${attemptsRemaining !== 1 ? "s" : ""} remaining`
                  : "No attempts remaining - please request a new code"}
              </ThemedText>
            ) : null}

            {displayError ? (
              <View style={styles.errorContainer}>
                <Feather
                  name="alert-circle"
                  size={16}
                  color={Colors.dark.error}
                />
                <ThemedText style={styles.errorText}>{displayError}</ThemedText>
              </View>
            ) : null}

            <Pressable
              style={[
                styles.button,
                (!isCodeComplete || isLoading) && styles.buttonDisabled,
              ]}
              onPress={handleVerifyCode}
              disabled={!isCodeComplete || isLoading}
            >
              <LinearGradient
                colors={Gradients.accent}
                style={styles.buttonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {isLoading ? (
                  <ActivityIndicator color={Colors.dark.text} />
                ) : (
                  <>
                    <Feather name="check-circle" size={20} color={Colors.dark.text} />
                    <ThemedText style={styles.buttonText}>Verify Code</ThemedText>
                  </>
                )}
              </LinearGradient>
            </Pressable>

            <Pressable
              style={styles.backButton}
              onPress={handleBack}
              disabled={isLoading}
            >
              <Feather name="arrow-left" size={16} color={Colors.dark.textSecondary} />
              <ThemedText style={styles.backButtonText}>Request new code</ThemedText>
            </Pressable>
          </View>
        ) : (
          <View style={styles.form}>
            <ThemedText style={styles.label}>
              Enter the pairing secret from ZEKE settings
            </ThemedText>

            <TextInput
              style={styles.secretInput}
              value={legacySecret}
              onChangeText={(text) => {
                setLegacySecret(text);
                setLocalError(null);
              }}
              placeholder="Enter pairing secret"
              placeholderTextColor={Colors.dark.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
            />

            {legacyDisplayError ? (
              <View style={styles.errorContainer}>
                <Feather
                  name="alert-circle"
                  size={16}
                  color={Colors.dark.error}
                />
                <ThemedText style={styles.errorText}>{legacyDisplayError}</ThemedText>
              </View>
            ) : null}

            <Pressable
              style={[
                styles.button,
                (!legacySecret.trim() || isLoading) && styles.buttonDisabled,
              ]}
              onPress={handleLegacyPair}
              disabled={!legacySecret.trim() || isLoading}
            >
              <LinearGradient
                colors={Gradients.accent}
                style={styles.buttonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {isLoading ? (
                  <ActivityIndicator color={Colors.dark.text} />
                ) : (
                  <>
                    <Feather name="key" size={20} color={Colors.dark.text} />
                    <ThemedText style={styles.buttonText}>Pair with Secret</ThemedText>
                  </>
                )}
              </LinearGradient>
            </Pressable>

            <Pressable
              style={styles.backButton}
              onPress={handleBackToSms}
              disabled={isLoading}
            >
              <Feather name="arrow-left" size={16} color={Colors.dark.textSecondary} />
              <ThemedText style={styles.backButtonText}>Back to SMS pairing</ThemedText>
            </Pressable>
          </View>
        )}

        <View style={styles.footer}>
          <Feather name="info" size={14} color={Colors.dark.textSecondary} />
          <ThemedText style={styles.footerText}>
            {step === "request"
              ? "A verification code will be sent to the master phone number. Enter it here to pair this device."
              : step === "verify"
              ? "Once verified, this device will have secure access to all ZEKE features."
              : "Enter the secret key generated in ZEKE settings to pair this device."}
          </ThemedText>
        </View>
      </KeyboardAwareScrollViewCompat>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing["2xl"],
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.dark.textSecondary,
  },
  form: {
    marginBottom: Spacing["2xl"],
  },
  label: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.lg,
    textAlign: "center",
  },
  codeContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  codeInput: {
    width: 56,
    height: 64,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    color: Colors.dark.text,
    borderWidth: 2,
    borderColor: Colors.dark.border,
  },
  codeInputFilled: {
    borderColor: Colors.dark.accent,
  },
  expiryText: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  expiryWarning: {
    color: Colors.dark.error,
  },
  attemptsText: {
    fontSize: 12,
    color: Colors.dark.warning || "#F59E0B",
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  secretInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    fontSize: 16,
    padding: Spacing.md,
    color: Colors.dark.text,
    borderWidth: 2,
    borderColor: Colors.dark.border,
    marginBottom: Spacing.lg,
  },
  legacyLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
  },
  legacyLinkText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  successContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderRadius: BorderRadius.md,
    justifyContent: "center",
  },
  successText: {
    fontSize: 14,
    color: "#10B981",
    fontWeight: "600",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.sm,
    justifyContent: "center",
  },
  errorText: {
    fontSize: 14,
    color: Colors.dark.error,
  },
  loadingContainer: {
    alignItems: "center",
    gap: Spacing.sm,
    marginVertical: Spacing.lg,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  button: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
  },
  backButtonText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  footer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  footerText: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
});
