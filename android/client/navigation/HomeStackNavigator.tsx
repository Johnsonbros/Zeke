import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import HomeScreen from "@/screens/HomeScreen";
import FileUploadScreen from "@/screens/FileUploadScreen";
import SettingsScreen from "@/screens/SettingsScreen";
import NotificationSettingsScreen from "@/screens/NotificationSettingsScreen";
import BluetoothConnectionScreen from "@/screens/BluetoothConnectionScreen";
import LocationScreen from "@/screens/LocationScreen";
import MapScreen from "@/screens/MapScreen";
import DeviceFeaturesScreen from "@/screens/DeviceFeaturesScreen";
import ActivityHistoryScreen from "@/screens/ActivityHistoryScreen";
import ToolRegistryScreen from "@/screens/ToolRegistryScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { ZekeHeaderTitle, ZekeHeaderButtons } from "@/components/ZekeHeader";
import { createZekeSubHeader } from "@/components/ZekeSubHeader";

export type HomeStackParamList = {
  Home: undefined;
  FileUpload: undefined;
  Settings: undefined;
  NotificationSettings: undefined;
  BluetoothConnection: undefined;
  Location: undefined;
  Map: undefined;
  DeviceFeatures: undefined;
  ActivityHistory: undefined;
  ToolRegistry: undefined;
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: "",
          headerTitle: () => null,
          headerLeft: () => <ZekeHeaderTitle />,
          headerRight: () => <ZekeHeaderButtons />,
          headerLeftContainerStyle: { paddingLeft: 12 },
          headerRightContainerStyle: { paddingRight: 12 },
        }}
      />
      <Stack.Screen
        name="FileUpload"
        component={FileUploadScreen}
        options={{
          headerTitle: createZekeSubHeader("Upload to ZEKE"),
        }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          headerTitle: createZekeSubHeader("Settings"),
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
        name="Location"
        component={LocationScreen}
        options={{
          headerTitle: createZekeSubHeader("Location"),
        }}
      />
      <Stack.Screen
        name="Map"
        component={MapScreen}
        options={{
          headerTitle: createZekeSubHeader("Map"),
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
        name="ActivityHistory"
        component={ActivityHistoryScreen}
        options={{
          headerTitle: createZekeSubHeader("Activity History"),
        }}
      />
      <Stack.Screen
        name="ToolRegistry"
        component={ToolRegistryScreen}
        options={{
          headerTitle: createZekeSubHeader("Tools & Actions"),
        }}
      />
    </Stack.Navigator>
  );
}
