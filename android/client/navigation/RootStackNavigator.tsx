import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MainTabNavigator from "@/navigation/MainTabNavigator";
import ChatScreen from "@/screens/ChatScreen";
import SmsComposeScreen from "@/screens/SmsComposeScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { createZekeSubHeader } from "@/components/ZekeSubHeader";

export type RootStackParamList = {
  Main: undefined;
  Chat: undefined;
  SmsCompose: {
    contactId?: string;
    phoneNumber?: string;
    contactName?: string;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Main"
        component={MainTabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{
          presentation: "modal",
          headerTitle: createZekeSubHeader("AI Chat"),
        }}
      />
      <Stack.Screen
        name="SmsCompose"
        component={SmsComposeScreen}
        options={{
          presentation: "modal",
          headerTitle: createZekeSubHeader("New Message"),
        }}
      />
    </Stack.Navigator>
  );
}
