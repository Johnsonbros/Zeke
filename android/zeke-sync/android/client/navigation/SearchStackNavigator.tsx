import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import SearchScreen from "@/screens/SearchScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type SearchStackParamList = {
  Search: undefined;
};

const Stack = createNativeStackNavigator<SearchStackParamList>();

export default function SearchStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Search"
        component={SearchScreen}
        options={{
          headerTitle: "Search",
        }}
      />
    </Stack.Navigator>
  );
}
