import { Platform, View, StyleSheet } from "react-native";
import { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable, GlassView } from "expo-glass-effect";

import { useTheme } from "@/hooks/useTheme";

interface UseScreenOptionsParams {
  transparent?: boolean;
}

export function useScreenOptions({
  transparent = true,
}: UseScreenOptionsParams = {}): NativeStackNavigationOptions {
  const { theme, isDark } = useTheme();

  const isIOS = Platform.OS === "ios";
  const isAndroid = Platform.OS === "android";

  const baseOptions: NativeStackNavigationOptions = {
    headerTitleAlign: "center",
    headerTintColor: theme.text,
    gestureEnabled: true,
    gestureDirection: "horizontal",
    fullScreenGestureEnabled: isLiquidGlassAvailable() ? false : true,
    headerShadowVisible: false,
    contentStyle: {
      backgroundColor: theme.backgroundRoot,
    },
  };

  if (isIOS) {
    return {
      ...baseOptions,
      headerTransparent: transparent,
      headerBlurEffect: isDark ? "dark" : "light",
      headerStyle: {
        backgroundColor: transparent ? undefined : theme.backgroundRoot,
      },
      headerBackground: transparent
        ? () => (
            <View style={styles.headerBackgroundContainer}>
              {isLiquidGlassAvailable() ? (
                <GlassView
                  glassEffectStyle="regular"
                  style={StyleSheet.absoluteFill}
                />
              ) : (
                <BlurView
                  intensity={80}
                  tint={isDark ? "dark" : "light"}
                  style={StyleSheet.absoluteFill}
                />
              )}
              <View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    backgroundColor: isDark
                      ? "rgba(15, 23, 42, 0.7)"
                      : "rgba(241, 245, 249, 0.7)",
                  },
                ]}
              />
            </View>
          )
        : undefined,
    };
  }

  if (isAndroid) {
    return {
      ...baseOptions,
      headerTransparent: transparent,
      headerStyle: {
        backgroundColor: transparent ? "transparent" : theme.backgroundDefault,
      },
      headerBackground: transparent
        ? () => (
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: isDark
                    ? "rgba(15, 23, 42, 0.95)"
                    : "rgba(241, 245, 249, 0.95)",
                },
              ]}
            />
          )
        : undefined,
    };
  }

  return {
    ...baseOptions,
    headerTransparent: false,
    headerStyle: {
      backgroundColor: theme.backgroundRoot,
    },
  };
}

const styles = StyleSheet.create({
  headerBackgroundContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    pointerEvents: "none",
  },
});
