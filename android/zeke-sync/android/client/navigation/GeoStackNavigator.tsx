import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import LocationScreen from "@/screens/LocationScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { ZekeHeaderTitle, ZekeHeaderButtons } from "@/components/ZekeHeader";

export type GeoStackParamList = {
  Location: undefined;
};

const Stack = createNativeStackNavigator<GeoStackParamList>();

export default function GeoStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Location"
        component={LocationScreen}
        options={{
          headerTitle: "",
          headerLeft: () => <ZekeHeaderTitle />,
          headerRight: () => <ZekeHeaderButtons />,
        }}
      />
    </Stack.Navigator>
  );
}
