import React from "react";
import { View, StyleSheet, Platform } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import HomeStackNavigator from "@/navigation/HomeStackNavigator";
import CommunicationStackNavigator from "@/navigation/CommunicationStackNavigator";
import CalendarStackNavigator from "@/navigation/CalendarStackNavigator";
import GeoStackNavigator from "@/navigation/GeoStackNavigator";
import TasksStackNavigator from "@/navigation/TasksStackNavigator";
import { useTheme } from "@/hooks/useTheme";
import { Spacing } from "@/constants/theme";

export type MainTabParamList = {
  HomeTab: undefined;
  CommsTab: undefined;
  CalendarTab: undefined;
  GeoTab: undefined;
  TasksTab: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabNavigator() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const androidBottomPadding = Math.max(insets.bottom, 16);
  const tabBarHeight =
    Platform.OS === "android" ? 80 + androidBottomPadding : 80;

  return (
    <View style={styles.container}>
      <Tab.Navigator
        initialRouteName="HomeTab"
        screenOptions={{
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.tabIconDefault,
          tabBarStyle: {
            position: "absolute",
            backgroundColor: Platform.select({
              ios: "transparent",
              android: theme.backgroundDefault,
            }),
            borderTopWidth: Platform.OS === "android" ? 1 : 0,
            borderTopColor: theme.border,
            elevation: Platform.OS === "android" ? 8 : 0,
            height: tabBarHeight,
            paddingBottom: Platform.OS === "ios" ? 24 : androidBottomPadding,
            paddingTop: Platform.OS === "android" ? Spacing.sm : 0,
          },
          tabBarBackground: () =>
            Platform.OS === "ios" ? (
              <BlurView
                intensity={100}
                tint={isDark ? "dark" : "light"}
                style={StyleSheet.absoluteFill}
              />
            ) : null,
          headerShown: false,
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: "600",
            marginTop: Platform.OS === "android" ? 4 : 0,
          },
          tabBarIconStyle: {
            marginBottom: Platform.OS === "android" ? -4 : 0,
          },
          tabBarItemStyle: {
            paddingVertical: Platform.OS === "android" ? Spacing.xs : 0,
          },
        }}
      >
        <Tab.Screen
          name="HomeTab"
          component={HomeStackNavigator}
          options={{
            title: "Home",
            tabBarIcon: ({ color, size }) => (
              <Feather name="home" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="CommsTab"
          component={CommunicationStackNavigator}
          options={{
            title: "Comms",
            tabBarIcon: ({ color, size }) => (
              <Feather name="phone" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="CalendarTab"
          component={CalendarStackNavigator}
          options={{
            title: "Calendar",
            tabBarIcon: ({ color, size }) => (
              <Feather name="calendar" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="GeoTab"
          component={GeoStackNavigator}
          options={{
            title: "Geo",
            tabBarIcon: ({ color, size }) => (
              <Feather name="map-pin" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="TasksTab"
          component={TasksStackNavigator}
          options={{
            title: "Tasks",
            tabBarIcon: ({ color, size }) => (
              <Feather name="check-square" size={size} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative",
  },
});
