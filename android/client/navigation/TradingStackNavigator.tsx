import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";

import TradingScreen from "@/screens/TradingScreen";

export type TradingStackParamList = {
  TradingMain: undefined;
};

const Stack = createNativeStackNavigator<TradingStackParamList>();

export default function TradingStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: Colors.dark.backgroundRoot,
        },
        headerTintColor: Colors.dark.text,
        headerTitleStyle: {
          fontWeight: "600",
        },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="TradingMain"
        component={TradingScreen}
        options={{
          title: "Trading",
          headerShown: true,
        }}
      />
    </Stack.Navigator>
  );
}
