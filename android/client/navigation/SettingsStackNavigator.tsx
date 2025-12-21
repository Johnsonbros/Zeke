import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import SettingsScreen from "@/screens/SettingsScreen";
import NotificationSettingsScreen from "@/screens/NotificationSettingsScreen";
import BluetoothConnectionScreen from "@/screens/BluetoothConnectionScreen";
import DeviceFeaturesScreen from "@/screens/DeviceFeaturesScreen";
import LimitlessSetupScreen from "@/screens/LimitlessSetupScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { ZekeHeaderTitle, ZekeHeaderButtons } from "@/components/ZekeHeader";
import { createZekeSubHeader } from "@/components/ZekeSubHeader";

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
          headerTitle: "",
          headerLeft: () => <ZekeHeaderTitle />,
          headerRight: () => <ZekeHeaderButtons />,
          headerLeftContainerStyle: { paddingLeft: 12 },
          headerRightContainerStyle: { paddingRight: 12 },
        }}
      />
      <Stack.Screen
        name="NotificationSettings"
        component={NotificationSettingsScreen}
        options={{
          headerTitle: createZekeSubHeader("Notifications"),
        }}
      />
      <Stack.Screen
        name="BluetoothConnection"
        component={BluetoothConnectionScreen}
        options={{
          headerTitle: createZekeSubHeader("Pair Device"),
        }}
      />
      <Stack.Screen
        name="DeviceFeatures"
        component={DeviceFeaturesScreen}
        options={{
          headerTitle: createZekeSubHeader("Device Features"),
        }}
      />
      <Stack.Screen
        name="LimitlessSetup"
        component={LimitlessSetupScreen}
        options={{
          headerTitle: createZekeSubHeader("Limitless Setup"),
        }}
      />
    </Stack.Navigator>
  );
}
