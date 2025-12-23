import React from "react";
import { View, StyleSheet } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { NavigatorScreenParams } from "@react-navigation/native";
import * as Haptics from "expo-haptics";

import HomeStackNavigator from "@/navigation/HomeStackNavigator";
import CommunicationStackNavigator from "@/navigation/CommunicationStackNavigator";
import CalendarStackNavigator from "@/navigation/CalendarStackNavigator";
import GeoStackNavigator from "@/navigation/GeoStackNavigator";
import TasksStackNavigator from "@/navigation/TasksStackNavigator";
import { ZekeLauncher, LauncherItem } from "@/components/ZekeLauncher";
import { Gradients } from "@/constants/theme";
import type { HomeStackParamList } from "@/navigation/HomeStackNavigator";

export type MainTabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList> | undefined;
  CommsTab: undefined;
  CalendarTab: undefined;
  GeoTab: undefined;
  TasksTab: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

interface ZekeLauncherWrapperProps {
  navigation: any;
}

function ZekeLauncherWrapper({ navigation }: ZekeLauncherWrapperProps) {

  const launcherItems: LauncherItem[] = [
    {
      id: "home",
      icon: "home",
      label: "Home",
      gradientColors: ["#6366F1", "#8B5CF6"],
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation.navigate("HomeTab");
      },
    },
    {
      id: "comms",
      icon: "phone",
      label: "Comms",
      gradientColors: ["#8B5CF6", "#A855F7"],
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation.navigate("CommsTab");
      },
    },
    {
      id: "calendar",
      icon: "calendar",
      label: "Calendar",
      gradientColors: ["#10B981", "#059669"],
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation.navigate("CalendarTab");
      },
    },
    {
      id: "geo",
      icon: "map-pin",
      label: "Geo",
      gradientColors: ["#EF4444", "#DC2626"],
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation.navigate("GeoTab");
      },
    },
    {
      id: "tasks",
      icon: "check-square",
      label: "Tasks",
      gradientColors: ["#F59E0B", "#D97706"],
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation.navigate("TasksTab");
      },
    },
    {
      id: "upload",
      icon: "upload-cloud",
      label: "Upload",
      gradientColors: Gradients.accent,
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        navigation.navigate("HomeTab", { screen: "AudioUpload" });
      },
    },
    {
      id: "message",
      icon: "message-circle",
      label: "Message",
      gradientColors: ["#06B6D4", "#0891B2"],
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation.navigate("CommsTab");
      },
    },
    {
      id: "settings",
      icon: "settings",
      label: "Settings",
      gradientColors: ["#64748B", "#475569"],
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation.navigate("HomeTab", { screen: "Settings" });
      },
    },
  ];

  return <ZekeLauncher items={launcherItems} />;
}

export default function MainTabNavigator() {
  return (
    <View style={styles.container}>
      <Tab.Navigator
        initialRouteName="HomeTab"
        tabBar={({ navigation }) => <ZekeLauncherWrapper navigation={navigation} />}
        screenOptions={{
          headerShown: false,
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
