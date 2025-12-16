import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import ContactsScreen from "@/screens/ContactsScreen";
import ContactDetailScreen from "@/screens/ContactDetailScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { ZekeHeaderTitle, ZekeHeaderButtons } from "@/components/ZekeHeader";

export type ContactsStackParamList = {
  Contacts: undefined;
  ContactDetail: { contactId: string };
};

const Stack = createNativeStackNavigator<ContactsStackParamList>();

export default function ContactsStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Contacts"
        component={ContactsScreen}
        options={{
          headerTitle: "",
          headerLeft: () => <ZekeHeaderTitle />,
          headerRight: () => <ZekeHeaderButtons />,
        }}
      />
      <Stack.Screen
        name="ContactDetail"
        component={ContactDetailScreen}
        options={{
          headerTitle: "Contact",
        }}
      />
    </Stack.Navigator>
  );
}
