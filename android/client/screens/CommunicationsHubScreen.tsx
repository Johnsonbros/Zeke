import React, { useState, useMemo } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  Pressable,
  Platform,
  Alert,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import {
  useNavigation,
  CompositeNavigationProp,
} from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation } from "@tanstack/react-query";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { SearchBar } from "@/components/SearchBar";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, Colors, BorderRadius, Gradients } from "@/constants/theme";
import { CommunicationStackParamList } from "@/navigation/CommunicationStackNavigator";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { queryClient } from "@/lib/query-client";
import {
  getTwilioConversations,
  getTwilioCalls,
  getTwilioPhoneNumber,
  getContacts,
  initiateCall,
  sendSms,
  type TwilioSmsConversation,
  type TwilioCallRecord,
  type ZekeContact,
} from "@/lib/zeke-api-adapter";

type CommunicationNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<CommunicationStackParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

type TabType = "sms" | "voice" | "chat" | "contacts";

function formatTimestamp(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString();
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getInitials(name: string | null, phoneNumber: string): string {
  if (name) {
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }
  return phoneNumber.slice(-2);
}

function getAvatarColor(identifier: string): string {
  const colors = [
    Colors.dark.primary,
    Colors.dark.accent,
    Colors.dark.secondary,
    Colors.dark.success,
    Colors.dark.warning,
    Colors.dark.error,
  ];
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = identifier.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function getCallDirection(
  direction: string,
): "incoming" | "outgoing" | "missed" {
  if (direction === "inbound") return "incoming";
  return "outgoing";
}

function getCallIcon(
  direction: "incoming" | "outgoing" | "missed",
  status: string,
): { name: keyof typeof Feather.glyphMap; color: string } {
  if (status === "no-answer" || status === "busy" || status === "failed") {
    return { name: "phone-missed", color: Colors.dark.error };
  }
  switch (direction) {
    case "incoming":
      return { name: "phone-incoming", color: Colors.dark.success };
    case "outgoing":
      return { name: "phone-outgoing", color: Colors.dark.primary };
    case "missed":
      return { name: "phone-missed", color: Colors.dark.error };
  }
}

interface TabButtonProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
}

function TabButton({ label, isActive, onPress }: TabButtonProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tabButton,
        { opacity: pressed ? 0.8 : 1 },
      ]}
    >
      {isActive ? (
        <LinearGradient
          colors={Gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.tabButtonActive}
        >
          <ThemedText type="small" style={styles.tabButtonTextActive}>
            {label}
          </ThemedText>
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.tabButtonInactive,
            { backgroundColor: theme.backgroundSecondary },
          ]}
        >
          <ThemedText type="small" secondary>
            {label}
          </ThemedText>
        </View>
      )}
    </Pressable>
  );
}

interface SmsRowProps {
  conversation: TwilioSmsConversation;
  onPress: () => void;
}

function SmsRow({ conversation, onPress }: SmsRowProps) {
  const { theme } = useTheme();
  const displayName = conversation.contactName || conversation.phoneNumber;
  const initials = getInitials(
    conversation.contactName,
    conversation.phoneNumber,
  );
  const avatarColor = getAvatarColor(conversation.phoneNumber);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.backgroundDefault,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
        <ThemedText type="body" style={styles.avatarText}>
          {initials}
        </ThemedText>
      </View>
      <View style={styles.rowContent}>
        <View style={styles.rowHeader}>
          <ThemedText
            type="body"
            style={{ fontWeight: "600", flex: 1 }}
            numberOfLines={1}
          >
            {displayName}
          </ThemedText>
          <ThemedText type="caption" secondary>
            {formatTimestamp(conversation.lastMessageTime)}
          </ThemedText>
        </View>
        <View style={styles.rowFooter}>
          <ThemedText
            type="small"
            secondary
            style={{ flex: 1 }}
            numberOfLines={1}
          >
            {conversation.lastMessage}
          </ThemedText>
          {conversation.unreadCount > 0 ? (
            <View style={styles.unreadBadge}>
              <ThemedText type="caption" style={styles.unreadText}>
                {conversation.unreadCount}
              </ThemedText>
            </View>
          ) : null}
        </View>
      </View>
      <Feather name="chevron-right" size={20} color={theme.textSecondary} />
    </Pressable>
  );
}

interface VoiceRowProps {
  call: TwilioCallRecord;
  twilioPhoneNumber: string | null;
  onPress: () => void;
  onCallPress: () => void;
}

function VoiceRow({
  call,
  twilioPhoneNumber,
  onPress,
  onCallPress,
}: VoiceRowProps) {
  const { theme } = useTheme();
  const otherParty = call.from === twilioPhoneNumber ? call.to : call.from;
  const direction = getCallDirection(call.direction);
  const isMissed =
    call.status === "no-answer" ||
    call.status === "busy" ||
    call.status === "failed";
  const displayDirection = isMissed ? "missed" : direction;
  const { name: iconName, color: iconColor } = getCallIcon(
    displayDirection,
    call.status,
  );
  const initials = getInitials(null, otherParty);
  const avatarColor = getAvatarColor(otherParty);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.backgroundDefault,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
        <ThemedText type="body" style={styles.avatarText}>
          {initials}
        </ThemedText>
      </View>
      <View style={styles.rowContent}>
        <View style={styles.rowHeader}>
          <ThemedText
            type="body"
            style={{
              fontWeight: "600",
              flex: 1,
              color: isMissed ? Colors.dark.error : theme.text,
            }}
            numberOfLines={1}
          >
            {otherParty}
          </ThemedText>
          <ThemedText type="caption" secondary>
            {formatTimestamp(call.dateCreated)}
          </ThemedText>
        </View>
        <View style={styles.rowFooter}>
          <View style={styles.callInfo}>
            <Feather name={iconName} size={14} color={iconColor} />
            <ThemedText
              type="small"
              secondary
              style={{ marginLeft: Spacing.xs }}
            >
              {isMissed ? "Missed call" : formatDuration(call.duration)}
            </ThemedText>
          </View>
        </View>
      </View>
      <Pressable
        onPress={onCallPress}
        hitSlop={8}
        style={({ pressed }) => [
          styles.callButton,
          { opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <Feather name="phone" size={20} color={Colors.dark.success} />
      </Pressable>
    </Pressable>
  );
}

interface ChatPlaceholderProps {
  onStartChat: () => void;
}

function ChatPlaceholder({ onStartChat }: ChatPlaceholderProps) {
  return (
    <View style={styles.chatPlaceholder}>
      <LinearGradient
        colors={Gradients.accent}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.chatIcon}
      >
        <Feather name="message-circle" size={48} color="#FFFFFF" />
      </LinearGradient>
      <ThemedText
        type="h3"
        style={{ marginTop: Spacing.xl, marginBottom: Spacing.sm }}
      >
        Chat with ZEKE
      </ThemedText>
      <ThemedText
        type="body"
        secondary
        style={{ textAlign: "center", paddingHorizontal: Spacing.xl }}
      >
        Direct connection with ZEKE. Ask about your schedule, tasks, or get help
        with daily activities.
      </ThemedText>
      <Pressable
        onPress={onStartChat}
        style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
      >
        <LinearGradient
          colors={Gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.startChatButton}
        >
          <Feather name="message-square" size={20} color="#FFFFFF" />
          <ThemedText
            type="body"
            style={{
              color: "#FFFFFF",
              marginLeft: Spacing.sm,
              fontWeight: "600",
            }}
          >
            Start Chatting
          </ThemedText>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

function getContactInitials(contact: ZekeContact): string {
  const first = contact.firstName?.charAt(0)?.toUpperCase() || "";
  const last = contact.lastName?.charAt(0)?.toUpperCase() || "";
  return first + last || "?";
}

function getContactFullName(contact: ZekeContact): string {
  const parts = [
    contact.firstName,
    contact.middleName,
    contact.lastName,
  ].filter(Boolean);
  return parts.join(" ") || "Unknown";
}

function getAccessLevelColor(accessLevel: ZekeContact["accessLevel"]): string {
  switch (accessLevel) {
    case "family":
      return Colors.dark.accent;
    case "close_friend":
      return Colors.dark.primary;
    case "friend":
      return Colors.dark.secondary;
    case "acquaintance":
      return Colors.dark.warning;
    default:
      return Colors.dark.textSecondary;
  }
}

function formatAccessLevel(accessLevel: ZekeContact["accessLevel"]): string {
  switch (accessLevel) {
    case "close_friend":
      return "Close Friend";
    case "family":
      return "Family";
    case "friend":
      return "Friend";
    case "acquaintance":
      return "Acquaintance";
    default:
      return "";
  }
}

interface ContactRowProps {
  contact: ZekeContact;
  onPress: () => void;
  onCall: () => void;
  onMessage: () => void;
}

function ContactRow({ contact, onPress, onCall, onMessage }: ContactRowProps) {
  const { theme } = useTheme();
  const accessColor = getAccessLevelColor(contact.accessLevel);
  const accessLabel = formatAccessLevel(contact.accessLevel);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.backgroundDefault,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: accessColor }]}>
        <ThemedText type="body" style={styles.avatarText}>
          {getContactInitials(contact)}
        </ThemedText>
      </View>
      <View style={styles.rowContent}>
        <ThemedText type="body" style={{ fontWeight: "600" }}>
          {getContactFullName(contact)}
        </ThemedText>
        {accessLabel ? (
          <View
            style={[
              styles.accessBadge,
              { backgroundColor: accessColor + "30" },
            ]}
          >
            <ThemedText type="caption" style={{ color: accessColor }}>
              {accessLabel}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <View style={styles.contactActions}>
        {contact.phoneNumber ? (
          <>
            <Pressable
              onPress={onCall}
              hitSlop={8}
              style={({ pressed }) => [
                styles.actionButton,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Feather name="phone" size={20} color={Colors.dark.success} />
            </Pressable>
            <Pressable
              onPress={onMessage}
              hitSlop={8}
              style={({ pressed }) => [
                styles.actionButton,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Feather
                name="message-circle"
                size={20}
                color={Colors.dark.primary}
              />
            </Pressable>
          </>
        ) : null}
        <Feather name="chevron-right" size={20} color={theme.textSecondary} />
      </View>
    </Pressable>
  );
}

function EmptyState({
  type,
  onImport,
}: {
  type: "sms" | "voice" | "contacts";
  onImport?: () => void;
}) {
  const { theme } = useTheme();
  const iconName =
    type === "sms" ? "message-square" : type === "voice" ? "phone" : "users";
  const title =
    type === "sms"
      ? "No SMS Conversations"
      : type === "voice"
        ? "No Voice Calls"
        : "No Contacts";
  const message =
    type === "sms"
      ? "Your SMS conversations will appear here once you start messaging."
      : type === "voice"
        ? "Your call history will appear here once you make or receive calls."
        : "Import contacts from your device to get started.";

  return (
    <View style={styles.emptyState}>
      <Feather name={iconName} size={48} color={theme.textSecondary} />
      <ThemedText
        type="h4"
        style={{ marginTop: Spacing.lg, marginBottom: Spacing.sm }}
      >
        {title}
      </ThemedText>
      <ThemedText type="body" secondary style={{ textAlign: "center" }}>
        {message}
      </ThemedText>
      {type === "contacts" && onImport ? (
        <Pressable
          onPress={onImport}
          style={({ pressed }) => [
            styles.importButton,
            {
              opacity: pressed ? 0.8 : 1,
              backgroundColor: Colors.dark.primary,
              borderRadius: BorderRadius.md,
              paddingVertical: Spacing.sm,
              paddingHorizontal: Spacing.lg,
              flexDirection: "row",
              alignItems: "center",
              gap: Spacing.sm,
            },
          ]}
        >
          <Feather name="download" size={18} color="#FFFFFF" />
          <ThemedText style={{ color: "#FFFFFF", fontWeight: "600" }}>
            Import from Device
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

function LoadingState() {
  return (
    <View style={styles.loadingState}>
      <ActivityIndicator size="large" color={Colors.dark.primary} />
      <ThemedText type="body" secondary style={{ marginTop: Spacing.md }}>
        Loading...
      </ThemedText>
    </View>
  );
}

type ModalType = "none" | "sms" | "call";

export default function CommunicationsHubScreen() {
  useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<CommunicationNavigationProp>();

  const [activeTab, setActiveTab] = useState<TabType>("sms");
  const [modalType, setModalType] = useState<ModalType>("none");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [smsMessage, setSmsMessage] = useState("");

  const { data: twilioPhoneNumber } = useQuery({
    queryKey: ["twilio-phone-number"],
    queryFn: getTwilioPhoneNumber,
    staleTime: 300000,
  });

  const {
    data: conversations = [],
    isLoading: isLoadingSms,
    refetch: refetchSms,
    isRefetching: isRefetchingSms,
  } = useQuery({
    queryKey: ["twilio-conversations"],
    queryFn: getTwilioConversations,
    staleTime: 30000,
    enabled: activeTab === "sms",
  });

  const {
    data: calls = [],
    isLoading: isLoadingCalls,
    refetch: refetchCalls,
    isRefetching: isRefetchingCalls,
  } = useQuery({
    queryKey: ["twilio-calls"],
    queryFn: getTwilioCalls,
    staleTime: 30000,
    enabled: activeTab === "voice",
  });

  const {
    data: contacts = [],
    isLoading: isLoadingContacts,
    refetch: refetchContacts,
    isRefetching: isRefetchingContacts,
  } = useQuery<ZekeContact[]>({
    queryKey: ["/api/contacts"],
    queryFn: getContacts,
    staleTime: 30000,
    enabled: activeTab === "contacts",
  });

  const [contactSearchQuery, setContactSearchQuery] = useState("");

  const filteredContacts = useMemo(() => {
    if (!contacts) return [];
    if (!contactSearchQuery.trim()) return contacts;

    const query = contactSearchQuery.toLowerCase();
    return contacts.filter((c) => {
      const fullName = getContactFullName(c).toLowerCase();
      const email = c.email?.toLowerCase() || "";
      const phone = c.phoneNumber || "";
      return (
        fullName.includes(query) ||
        email.includes(query) ||
        phone.includes(query)
      );
    });
  }, [contacts, contactSearchQuery]);

  const sortedContacts = useMemo(() => {
    return [...filteredContacts].sort((a, b) => {
      const nameA = (a.lastName || a.firstName || "").toLowerCase();
      const nameB = (b.lastName || b.firstName || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [filteredContacts]);

  const smsMutation = useMutation({
    mutationFn: ({ to, message }: { to: string; message: string }) =>
      sendSms(to, message),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["twilio-conversations"] });
      setModalType("none");
      setPhoneNumber("");
      setSmsMessage("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "SMS sent successfully!");
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to send SMS");
    },
  });

  const newCallMutation = useMutation({
    mutationFn: (to: string) => initiateCall(to),
    onSuccess: () => {
      setModalType("none");
      setPhoneNumber("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Call initiated successfully!");
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to initiate call");
    },
  });

  const handleFabPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (activeTab === "sms") {
      setModalType("sms");
    } else if (activeTab === "voice") {
      setModalType("call");
    }
  };

  const handleSendSms = () => {
    if (!phoneNumber.trim() || !smsMessage.trim()) {
      Alert.alert("Error", "Please enter a phone number and message");
      return;
    }
    smsMutation.mutate({ to: phoneNumber.trim(), message: smsMessage.trim() });
  };

  const handleMakeCall = () => {
    if (!phoneNumber.trim()) {
      Alert.alert("Error", "Please enter a phone number");
      return;
    }
    newCallMutation.mutate(phoneNumber.trim());
  };

  const handleTabPress = (tab: TabType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
  };

  const handleSmsPress = (conversation: TwilioSmsConversation) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("SmsConversation", {
      phoneNumber: conversation.phoneNumber,
    });
  };

  const handleVoicePress = (call: TwilioCallRecord) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const otherParty = call.from === twilioPhoneNumber ? call.to : call.from;
    const isMissed =
      call.status === "no-answer" ||
      call.status === "busy" ||
      call.status === "failed";
    const direction = call.direction === "inbound" ? "Incoming" : "Outgoing";
    const callType = isMissed ? "Missed" : direction;
    const message = `${callType} call ${direction === "Incoming" ? "from" : "to"} ${otherParty}\n${!isMissed ? `Duration: ${formatDuration(call.duration)}\n` : ""}${formatTimestamp(call.dateCreated)}`;

    if (Platform.OS === "web") {
      window.alert(`Voice Call Details\n\n${message}`);
    } else {
      Alert.alert("Voice Call Details", message, [{ text: "OK" }]);
    }
  };

  const handleCallPress = (call: TwilioCallRecord) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const otherParty = call.from === twilioPhoneNumber ? call.to : call.from;
    navigation.navigate("VoIPCalling", { phoneNumber: otherParty });
  };

  const handleStartChat = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("Chat");
  };

  const handleContactPress = (contact: ZekeContact) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("ContactDetail", { contactId: contact.id.toString() });
  };

  const handleContactCall = (contact: ZekeContact) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (contact.phoneNumber) {
      navigation.navigate("VoIPCalling", {
        phoneNumber: contact.phoneNumber,
        contactName:
          `${contact.firstName || ""} ${contact.lastName || ""}`.trim() ||
          undefined,
      });
    }
  };

  const handleContactMessage = (contact: ZekeContact) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (contact.phoneNumber) {
      navigation.navigate("SmsConversation", {
        phoneNumber: contact.phoneNumber,
      });
    }
  };

  const handleImportContacts = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("ImportContacts");
  };

  const onRefresh = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (activeTab === "sms") {
      await refetchSms();
    } else if (activeTab === "voice") {
      await refetchCalls();
    } else if (activeTab === "contacts") {
      await refetchContacts();
    }
  };

  const renderSmsItem = ({ item }: { item: TwilioSmsConversation }) => (
    <SmsRow conversation={item} onPress={() => handleSmsPress(item)} />
  );

  const renderVoiceItem = ({ item }: { item: TwilioCallRecord }) => (
    <VoiceRow
      call={item}
      twilioPhoneNumber={twilioPhoneNumber ?? null}
      onPress={() => handleVoicePress(item)}
      onCallPress={() => handleCallPress(item)}
    />
  );

  const renderContactItem = ({ item }: { item: ZekeContact }) => (
    <ContactRow
      contact={item}
      onPress={() => handleContactPress(item)}
      onCall={() => handleContactCall(item)}
      onMessage={() => handleContactMessage(item)}
    />
  );

  const renderContent = () => {
    switch (activeTab) {
      case "sms":
        if (isLoadingSms) {
          return <LoadingState />;
        }
        if (conversations.length === 0) {
          return <EmptyState type="sms" />;
        }
        return (
          <FlatList
            data={conversations}
            renderItem={renderSmsItem}
            keyExtractor={(item) => item.phoneNumber}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefetchingSms}
                onRefresh={onRefresh}
                tintColor={Colors.dark.primary}
              />
            }
          />
        );
      case "voice":
        if (isLoadingCalls) {
          return <LoadingState />;
        }
        if (calls.length === 0) {
          return <EmptyState type="voice" />;
        }
        return (
          <FlatList
            data={calls}
            renderItem={renderVoiceItem}
            keyExtractor={(item) => item.sid}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefetchingCalls}
                onRefresh={onRefresh}
                tintColor={Colors.dark.primary}
              />
            }
          />
        );
      case "chat":
        return <ChatPlaceholder onStartChat={handleStartChat} />;
      case "contacts":
        if (isLoadingContacts) {
          return <LoadingState />;
        }
        if (sortedContacts.length === 0 && !contactSearchQuery) {
          return <EmptyState type="contacts" onImport={handleImportContacts} />;
        }
        return (
          <View style={styles.contactsContainer}>
            <View style={styles.contactsHeader}>
              <View style={styles.searchContainerExpanded}>
                <SearchBar
                  value={contactSearchQuery}
                  onChangeText={setContactSearchQuery}
                  placeholder="Search contacts..."
                />
              </View>
              <Pressable
                onPress={handleImportContacts}
                style={({ pressed }) => [
                  styles.importIconButton,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Feather
                  name="download"
                  size={20}
                  color={Colors.dark.primary}
                />
              </Pressable>
            </View>
            {sortedContacts.length === 0 ? (
              <View style={styles.noResults}>
                <ThemedText type="body" secondary>
                  No contacts match your search
                </ThemedText>
              </View>
            ) : (
              <FlatList
                data={sortedContacts}
                renderItem={renderContactItem}
                keyExtractor={(item) => item.id.toString()}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={isRefetchingContacts}
                    onRefresh={onRefresh}
                    tintColor={Colors.dark.primary}
                  />
                }
              />
            )}
          </View>
        );
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View
        style={[
          styles.contentContainer,
          {
            marginTop: headerHeight + Spacing.lg,
            paddingBottom: tabBarHeight + Spacing.xl,
          },
        ]}
      >
        <View style={styles.tabContainer}>
          <TabButton
            label="SMS"
            isActive={activeTab === "sms"}
            onPress={() => handleTabPress("sms")}
          />
          <TabButton
            label="Voice"
            isActive={activeTab === "voice"}
            onPress={() => handleTabPress("voice")}
          />
          <TabButton
            label="ZEKE"
            isActive={activeTab === "chat"}
            onPress={() => handleTabPress("chat")}
          />
          <TabButton
            label="Contacts"
            isActive={activeTab === "contacts"}
            onPress={() => handleTabPress("contacts")}
          />
        </View>
        <View style={styles.tabContent}>{renderContent()}</View>
      </View>

      {activeTab === "sms" || activeTab === "voice" ? (
        <Pressable
          onPress={handleFabPress}
          style={({ pressed }) => [
            styles.fab,
            { bottom: tabBarHeight + Spacing.xl, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <LinearGradient colors={Gradients.primary} style={styles.fabGradient}>
            <Feather
              name={activeTab === "sms" ? "message-circle" : "phone"}
              size={24}
              color="#FFFFFF"
            />
          </LinearGradient>
        </Pressable>
      ) : null}

      <Modal
        visible={modalType !== "none"}
        transparent
        animationType="slide"
        onRequestClose={() => setModalType("none")}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setModalType("none")}
          />
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.backgroundSecondary },
            ]}
          >
            <View style={styles.modalHeader}>
              <ThemedText type="h3">
                {modalType === "sms" ? "New Message" : "New Call"}
              </ThemedText>
              <Pressable onPress={() => setModalType("none")}>
                <Feather name="x" size={24} color={theme.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <TextInput
                style={[
                  styles.modalInput,
                  {
                    backgroundColor: theme.backgroundDefault,
                    color: theme.text,
                  },
                ]}
                placeholder="Phone number"
                placeholderTextColor={theme.textSecondary}
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                keyboardType="phone-pad"
                autoFocus
              />

              {modalType === "sms" ? (
                <TextInput
                  style={[
                    styles.modalInput,
                    styles.messageInput,
                    {
                      backgroundColor: theme.backgroundDefault,
                      color: theme.text,
                    },
                  ]}
                  placeholder="Type your message..."
                  placeholderTextColor={theme.textSecondary}
                  value={smsMessage}
                  onChangeText={setSmsMessage}
                  multiline
                  numberOfLines={4}
                />
              ) : null}
            </View>

            <Pressable
              onPress={modalType === "sms" ? handleSendSms : handleMakeCall}
              style={({ pressed }) => [
                styles.modalButton,
                { opacity: pressed ? 0.8 : 1 },
              ]}
              disabled={smsMutation.isPending || newCallMutation.isPending}
            >
              <LinearGradient
                colors={Gradients.primary}
                style={styles.modalButtonGradient}
              >
                {smsMutation.isPending || newCallMutation.isPending ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Feather
                      name={modalType === "sms" ? "send" : "phone"}
                      size={18}
                      color="#FFFFFF"
                    />
                    <ThemedText
                      style={{
                        color: "#FFFFFF",
                        fontWeight: "600",
                        marginLeft: Spacing.sm,
                      }}
                    >
                      {modalType === "sms" ? "Send Message" : "Call"}
                    </ThemedText>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
  },
  tabContainer: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  tabButton: {
    flex: 1,
  },
  tabButtonActive: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  tabButtonInactive: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  tabButtonTextActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  tabContent: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  avatarText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  rowContent: {
    flex: 1,
    gap: Spacing.xs,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  rowFooter: {
    flexDirection: "row",
    alignItems: "center",
  },
  callInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  unreadBadge: {
    backgroundColor: Colors.dark.accent,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xs,
    marginLeft: Spacing.sm,
  },
  unreadText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 11,
  },
  callButton: {
    padding: Spacing.sm,
    marginLeft: Spacing.sm,
  },
  chatPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  chatIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  startChatButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.xl,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  accessBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    alignSelf: "flex-start",
  },
  contactActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  actionButton: {
    padding: Spacing.xs,
  },
  contactsContainer: {
    flex: 1,
  },
  contactsHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  searchContainerExpanded: {
    flex: 1,
  },
  searchContainer: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  importIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  importButton: {
    marginTop: Spacing.xl,
  },
  importButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
  },
  importButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  noResults: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  fab: {
    position: "absolute",
    right: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  modalBody: {
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  modalInput: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: 16,
  },
  messageInput: {
    height: 100,
    textAlignVertical: "top",
  },
  modalButton: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  modalButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
});
