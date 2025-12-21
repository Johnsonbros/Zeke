import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import CommunicationsHubScreen from "@/screens/CommunicationsHubScreen";
import SmsConversationScreen from "@/screens/SmsConversationScreen";
import ContactDetailScreen from "@/screens/ContactDetailScreen";
import VoIPCallingScreen from "@/screens/VoIPCallingScreen";
import ImportContactsScreen from "@/screens/ImportContactsScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { ZekeHeaderTitle, ZekeHeaderButtons } from "@/components/ZekeHeader";

export type CommunicationStackParamList = {
  CommunicationsHub: undefined;
  SmsConversation: {
    conversationId?: string;
    contactId?: string;
    phoneNumber?: string;
  };
  ConversationDetail: { conversationId: string; type: "sms" | "voice" | "app" };
  ContactDetail: { contactId: string };
  VoIPCalling: { phoneNumber?: string; contactName?: string };
  ImportContacts: undefined;
};

const Stack = createNativeStackNavigator<CommunicationStackParamList>();

export default function CommunicationStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="CommunicationsHub"
        component={CommunicationsHubScreen}
        options={{
          headerTitle: "",
          headerLeft: () => <ZekeHeaderTitle />,
          headerRight: () => <ZekeHeaderButtons />,
        }}
      />
      <Stack.Screen
        name="SmsConversation"
        component={SmsConversationScreen}
        options={{
          headerTitle: "Conversation",
        }}
      />
      <Stack.Screen
        name="ContactDetail"
        component={ContactDetailScreen}
        options={{
          headerTitle: "Contact",
        }}
      />
      <Stack.Screen
        name="VoIPCalling"
        component={VoIPCallingScreen}
        options={{
          headerTitle: "Call",
        }}
      />
      <Stack.Screen
        name="ImportContacts"
        component={ImportContactsScreen}
        options={{
          headerTitle: "Import Contacts",
        }}
      />
    </Stack.Navigator>
  );
}
