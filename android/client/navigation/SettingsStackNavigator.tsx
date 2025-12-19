import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import SettingsScreen from "@/screens/SettingsScreen";
import NotificationSettingsScreen from "@/screens/NotificationSettingsScreen";
import DataExportScreen from "@/screens/DataExportScreen";
import AnalyticsScreen from "@/screens/AnalyticsScreen";
import BluetoothConnectionScreen from "@/screens/BluetoothConnectionScreen";
import LiveCaptureScreen from "@/screens/LiveCaptureScreen";
import DeviceFeaturesScreen from "@/screens/DeviceFeaturesScreen";
import LimitlessSetupScreen from "@/screens/LimitlessSetupScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type SettingsStackParamList = {
  Settings: undefined;
  NotificationSettings: undefined;
  DataExport: undefined;
  Analytics: undefined;
  BluetoothConnection: undefined;
  LiveCapture: undefined;
  DeviceFeatures: undefined;
  LimitlessSetup: undefined;
};

const Stack = createNativeStackNavigator<SettingsStackParamList>();

export default function SettingsStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          headerTitle: "Settings",
        }}
      />
      <Stack.Screen
        name="NotificationSettings"
        component={NotificationSettingsScreen}
        options={{
          headerTitle: "Notifications",
        }}
      />
      <Stack.Screen
        name="DataExport"
        component={DataExportScreen}
        options={{
          headerTitle: "Export Data",
        }}
      />
      <Stack.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{
          headerTitle: "Analytics",
        }}
      />
      <Stack.Screen
        name="BluetoothConnection"
        component={BluetoothConnectionScreen}
        options={{
          headerTitle: "Pair Device",
        }}
      />
      <Stack.Screen
        name="LiveCapture"
        component={LiveCaptureScreen}
        options={{
          headerTitle: "Live Capture",
        }}
      />
      <Stack.Screen
        name="DeviceFeatures"
        component={DeviceFeaturesScreen}
        options={{
          headerTitle: "Device Features",
        }}
      />
      <Stack.Screen
        name="LimitlessSetup"
        component={LimitlessSetupScreen}
        options={{
          headerTitle: "Limitless Setup",
        }}
      />
    </Stack.Navigator>
  );
}
