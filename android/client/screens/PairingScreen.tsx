import React, { useState } from "react";
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
import { Colors, Gradients, Spacing, BorderRadius } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";

export function PairingScreen() {
  const insets = useSafeAreaInsets();
  const { pairDevice, isLoading, error } = useAuth();
  const [secret, setSecret] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const getDeviceName = (): string => {
    if (Platform.OS === "web") {
      return "Web Browser";
    }
    return Device.deviceName || Device.modelName || `${Platform.OS} Device`;
  };

  const handlePair = async () => {
    if (!secret.trim()) {
      setLocalError("Please enter your access key");
      return;
    }

    if (secret.trim().length < 32) {
      setLocalError("Access key must be at least 32 characters");
      return;
    }

    setLocalError(null);
    const deviceName = getDeviceName();
    await pairDevice(secret.trim(), deviceName);
  };

  const displayError = localError || error;

  return (
    <ThemedView style={styles.container}>
      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + Spacing["2xl"],
            paddingBottom: insets.bottom + Spacing.xl,
          },
        ]}
      >
        <View style={styles.header}>
          <LinearGradient
            colors={Gradients.primary}
            style={styles.iconContainer}
          >
            <Feather name="shield" size={48} color={Colors.dark.text} />
          </LinearGradient>

          <ThemedText style={styles.title}>ZEKE Command Center</ThemedText>
          <ThemedText style={styles.subtitle}>Secure Device Pairing</ThemedText>
        </View>

        <View style={styles.form}>
          <ThemedText style={styles.label}>
            Enter your access key to pair this device
          </ThemedText>

          <TextInput
            style={styles.input}
            value={secret}
            onChangeText={(text) => {
              setSecret(text);
              setLocalError(null);
            }}
            placeholder="Access Key (min 32 characters)"
            placeholderTextColor={Colors.dark.textSecondary}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
          />

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
            onPress={handlePair}
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
                  <Feather name="link" size={20} color={Colors.dark.text} />
                  <ThemedText style={styles.buttonText}>Pair Device</ThemedText>
                </>
              )}
            </LinearGradient>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Feather name="info" size={14} color={Colors.dark.textSecondary} />
          <ThemedText style={styles.footerText}>
            The access key is set in the ZEKE backend. Once paired, this device
            will have secure access to all ZEKE features.
          </ThemedText>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
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
    marginBottom: Spacing.md,
    textAlign: "center",
  },
  input: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontSize: 16,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  errorText: {
    fontSize: 14,
    color: Colors.dark.error,
    flex: 1,
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
