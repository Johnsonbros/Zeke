import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import TasksScreen from "@/screens/TasksScreen";
import GroceryScreen from "@/screens/GroceryScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { ZekeHeaderTitle, ZekeHeaderButtons } from "@/components/ZekeHeader";

export type TasksStackParamList = {
  Tasks: undefined;
  Grocery: undefined;
};

const Stack = createNativeStackNavigator<TasksStackParamList>();

export default function TasksStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Tasks"
        component={TasksScreen}
        options={{
          headerTitle: "",
          headerLeft: () => <ZekeHeaderTitle />,
          headerRight: () => <ZekeHeaderButtons />,
        }}
      />
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
