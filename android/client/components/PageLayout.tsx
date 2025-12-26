import React, { ReactNode, useRef, useCallback } from "react";
import {
  View,
  ScrollView,
  RefreshControl,
  StyleSheet,
  ViewStyle,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import {
  KeyboardAwareScrollView,
  KeyboardAwareScrollViewProps,
} from "react-native-keyboard-controller";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, Colors } from "@/constants/theme";

interface PageLayoutProps {
  children: ReactNode;
  scrollable?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  keyboardAware?: boolean;
  resetScrollOnFocus?: boolean;
  contentStyle?: ViewStyle;
  noPadding?: boolean;
  extraBottomPadding?: number;
}

export function PageLayout({
  children,
  scrollable = true,
  refreshing = false,
  onRefresh,
  keyboardAware = false,
  resetScrollOnFocus = true,
  contentStyle,
  noPadding = false,
  extraBottomPadding = 0,
}: PageLayoutProps) {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const scrollViewRef = useRef<ScrollView>(null);
  
  let tabBarHeight = 0;
  try {
    tabBarHeight = useBottomTabBarHeight();
  } catch {
    tabBarHeight = 0;
  }

  useFocusEffect(
    useCallback(() => {
      if (resetScrollOnFocus && scrollViewRef.current) {
        scrollViewRef.current.scrollTo({ y: 0, animated: false });
      }
    }, [resetScrollOnFocus])
  );

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: theme.backgroundRoot,
  };

  const contentContainerStyle: ViewStyle = {
    paddingTop: headerHeight,
    paddingBottom: tabBarHeight + Spacing.lg + extraBottomPadding,
    paddingHorizontal: noPadding ? 0 : Spacing.lg,
    ...contentStyle,
  };

  const refreshControl = onRefresh ? (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={Colors.dark.primary}
    />
  ) : undefined;

  if (!scrollable) {
    return (
      <View style={[containerStyle, contentContainerStyle]}>
        {children}
      </View>
    );
  }

  if (keyboardAware && Platform.OS !== "web") {
    return (
      <KeyboardAwareScrollView
        ref={scrollViewRef as any}
        style={containerStyle}
        contentContainerStyle={contentContainerStyle}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
        bottomOffset={Spacing.lg}
      >
        {children}
      </KeyboardAwareScrollView>
    );
  }

  return (
    <ScrollView
      ref={scrollViewRef}
      style={containerStyle}
      contentContainerStyle={contentContainerStyle}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  );
}

export function usePageLayoutDimensions(extraBottomPadding: number = 0) {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  let tabBarHeight = 0;
  try {
    tabBarHeight = useBottomTabBarHeight();
  } catch {
    tabBarHeight = 0;
  }
  
  return {
    insets,
    headerHeight,
    tabBarHeight,
    contentPaddingTop: headerHeight,
    contentPaddingBottom: tabBarHeight + Spacing.lg + extraBottomPadding,
    horizontalPadding: Spacing.lg,
  };
}
