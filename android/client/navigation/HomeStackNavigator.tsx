import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import HomeScreen from "@/screens/HomeScreen";
import AudioUploadScreen from "@/screens/AudioUploadScreen";
import SettingsScreen from "@/screens/SettingsScreen";
import NotificationSettingsScreen from "@/screens/NotificationSettingsScreen";
import BluetoothConnectionScreen from "@/screens/BluetoothConnectionScreen";
import LocationScreen from "@/screens/LocationScreen";
import DeviceFeaturesScreen from "@/screens/DeviceFeaturesScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { ZekeHeaderTitle, ZekeHeaderButtons } from "@/components/ZekeHeader";
import { createZekeSubHeader } from "@/components/ZekeSubHeader";

export type HomeStackParamList = {
  Home: undefined;
  AudioUpload: undefined;
  Settings: undefined;
  NotificationSettings: undefined;
  BluetoothConnection: undefined;
  Location: undefined;
  DeviceFeatures: undefined;
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
        name="AudioUpload"
        component={AudioUploadScreen}
        options={{
          headerTitle: createZekeSubHeader("Upload Audio"),
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
        name="DeviceFeatures"
        component={DeviceFeaturesScreen}
        options={{
          headerTitle: createZekeSubHeader("Device Features"),
        }}
      />
    </Stack.Navigator>
  );
}
