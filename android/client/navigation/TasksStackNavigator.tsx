import React from "react";
import { View, Pressable } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import TasksScreen from "@/screens/TasksScreen";
import GroceryScreen from "@/screens/GroceryScreen";
import ListsScreen from "@/screens/ListsScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useTheme } from "@/hooks/useTheme";
import { ZekeHeaderTitle, ZekeHeaderButtons } from "@/components/ZekeHeader";
import { createZekeSubHeader } from "@/components/ZekeSubHeader";
import { Spacing } from "@/constants/theme";

export type TasksStackParamList = {
  Tasks: undefined;
  Grocery: undefined;
  Lists: undefined;
};

function TasksHeaderRight() {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Pressable
        onPress={() => navigation.navigate("Grocery")}
        style={{ marginRight: Spacing.md }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Feather name="shopping-cart" size={22} color={theme.primary} />
      </Pressable>
      <Pressable
        onPress={() => navigation.navigate("Lists")}
        style={{ marginRight: Spacing.md }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Feather name="list" size={22} color={theme.primary} />
      </Pressable>
      <ZekeHeaderButtons />
    </View>
  );
}

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
          headerRight: () => <TasksHeaderRight />,
          headerLeftContainerStyle: { paddingLeft: 12 },
          headerRightContainerStyle: { paddingRight: 12 },
        }}
      />
      <Stack.Screen
        name="Grocery"
        component={GroceryScreen}
        options={{
          headerTitle: createZekeSubHeader("Grocery List"),
        }}
      />
      <Stack.Screen
        name="Lists"
        component={ListsScreen}
        options={{
          headerTitle: createZekeSubHeader("Lists"),
        }}
      />
    </Stack.Navigator>
  );
}
