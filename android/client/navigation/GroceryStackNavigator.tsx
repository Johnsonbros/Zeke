import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import GroceryScreen from "@/screens/GroceryScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type GroceryStackParamList = {
  Grocery: undefined;
};

const Stack = createNativeStackNavigator<GroceryStackParamList>();

export default function GroceryStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Grocery"
        component={GroceryScreen}
        options={{
          headerTitle: "Grocery List",
        }}
      />
    </Stack.Navigator>
  );
}
