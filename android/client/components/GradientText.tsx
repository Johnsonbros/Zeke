import React from "react";
import { Text, TextProps, StyleSheet } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { Gradients, Typography } from "@/constants/theme";

interface GradientTextProps extends TextProps {
  type?: "h1" | "h2" | "h3" | "h4" | "body" | "small";
  colors?: readonly [string, string, ...string[]];
}

export function GradientText({
  children,
  style,
  type = "h1",
  colors = Gradients.primary,
  ...rest
}: GradientTextProps) {
  const getTypeStyle = () => {
    switch (type) {
      case "h1":
        return Typography.h1;
      case "h2":
        return Typography.h2;
      case "h3":
        return Typography.h3;
      case "h4":
        return Typography.h4;
      case "body":
        return Typography.body;
      case "small":
        return Typography.small;
      default:
        return Typography.body;
    }
  };

  return (
    <MaskedView
      maskElement={
        <Text style={[styles.text, getTypeStyle(), style]} {...rest}>
          {children}
        </Text>
      }
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <Text
          style={[styles.text, getTypeStyle(), style, styles.invisible]}
          {...rest}
        >
          {children}
        </Text>
      </LinearGradient>
    </MaskedView>
  );
}

const styles = StyleSheet.create({
  text: {
    color: "#FFFFFF",
  },
  invisible: {
    opacity: 0,
  },
});
