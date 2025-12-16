import React, { useState } from "react";
import { View, TextInput, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Gradients, Colors } from "@/constants/theme";

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function SearchBar({
  value,
  onChangeText,
  onSubmit,
  placeholder = "Search memories...",
  autoFocus = false,
}: SearchBarProps) {
  const { theme } = useTheme();
  const [isFocused, setIsFocused] = useState(false);

  const content = (
    <View
      style={[
        styles.innerContainer,
        { backgroundColor: theme.backgroundDefault },
      ]}
    >
      <Feather
        name="search"
        size={20}
        color={isFocused ? Colors.dark.primary : theme.textSecondary}
      />
      <TextInput
        style={[styles.input, { color: theme.text }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChangeText("")}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Feather name="x" size={18} color={theme.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );

  if (isFocused) {
    return (
      <LinearGradient
        colors={Gradients.primary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradientBorder}
      >
        {content}
      </LinearGradient>
    );
  }

  return (
    <View style={[styles.container, { borderColor: theme.border }]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  gradientBorder: {
    borderRadius: BorderRadius.md,
    padding: 2,
  },
  innerContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    height: 48,
    borderRadius: BorderRadius.md - 2,
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 16,
    height: "100%",
  },
});
