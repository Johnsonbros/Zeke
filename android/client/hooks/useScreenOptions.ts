import { Platform, StatusBar } from "react-native";
import { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/hooks/useTheme";

interface UseScreenOptionsParams {
  transparent?: boolean;
}

export function useScreenOptions({
  transparent = true,
}: UseScreenOptionsParams = {}): NativeStackNavigationOptions {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  
  const statusBarHeight = Platform.select({
    android: StatusBar.currentHeight || insets.top || 24,
    ios: insets.top,
    default: insets.top,
  });

  return {
    headerTitleAlign: "center",
    headerTransparent: transparent,
    headerBlurEffect: isDark ? "dark" : "light",
    headerTintColor: theme.text,
    headerStyle: {
      backgroundColor: Platform.select({
        ios: undefined,
        android: transparent ? "transparent" : theme.backgroundRoot,
        web: theme.backgroundRoot,
      }),
    },
    headerTopInsetEnabled: true,
    headerStatusBarHeight: Platform.OS === "android" ? statusBarHeight : undefined,
    gestureEnabled: true,
    gestureDirection: "horizontal",
    fullScreenGestureEnabled: isLiquidGlassAvailable() ? false : true,
    contentStyle: {
      backgroundColor: theme.backgroundRoot,
    },
  };
}
