import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import SettingsScreen from "@/screens/SettingsScreen";
import NotificationSettingsScreen from "@/screens/NotificationSettingsScreen";
import BluetoothConnectionScreen from "@/screens/BluetoothConnectionScreen";
import DeviceFeaturesScreen from "@/screens/DeviceFeaturesScreen";
import LimitlessSetupScreen from "@/screens/LimitlessSetupScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type SettingsStackParamList = {
  Settings: undefined;
  NotificationSettings: undefined;
  BluetoothConnection: undefined;
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
        name="BluetoothConnection"
        component={BluetoothConnectionScreen}
        options={{
          headerTitle: "Pair Device",
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
