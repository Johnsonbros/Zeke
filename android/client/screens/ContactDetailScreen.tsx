import React, { useCallback, useState } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  useRoute,
  useNavigation,
  RouteProp,
  CompositeNavigationProp,
} from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { ContactFormModal } from "@/components/ContactFormModal";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, Colors, BorderRadius } from "@/constants/theme";
import { queryClient } from "@/lib/query-client";
import {
  getContact,
  deleteContact,
  initiateCall,
  ZekeContact,
  ZekeContactConversation,
} from "@/lib/zeke-api-adapter";
import { formatAccessLevel, getAccessLevelColor } from "@/lib/access-levels";
import { CommunicationStackParamList } from "@/navigation/CommunicationStackNavigator";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type ContactDetailRouteProp = RouteProp<
  CommunicationStackParamList,
  "ContactDetail"
>;
type ContactDetailNavProp = CompositeNavigationProp<
  NativeStackNavigationProp<CommunicationStackParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

function getInitials(contact: ZekeContact): string {
  const first = contact.firstName?.charAt(0)?.toUpperCase() || "";
  const last = contact.lastName?.charAt(0)?.toUpperCase() || "";
  return first + last || "?";
}

function getFullName(contact: ZekeContact): string {
  const parts = [
    contact.firstName,
    contact.middleName,
    contact.lastName,
  ].filter(Boolean);
  return parts.join(" ") || "Unknown";
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatBirthday(dateStr?: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString([], { month: "long", day: "numeric" });
}

function getSourceIcon(source: string): keyof typeof Feather.glyphMap {
  switch (source) {
    case "sms":
      return "message-square";
    case "voice":
      return "phone";
    case "app":
      return "message-circle";
    default:
      return "message-circle";
  }
}

function getSourceColor(source: string): string {
  switch (source) {
    case "sms":
      return Colors.dark.success;
    case "voice":
      return Colors.dark.warning;
    case "app":
      return Colors.dark.primary;
    default:
      return Colors.dark.textSecondary;
  }
}

interface InfoRowProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  onPress?: () => void;
}

function InfoRow({ icon, label, value, onPress }: InfoRowProps) {
  const { theme } = useTheme();

  const content = (
    <View style={styles.infoRow}>
      <Feather
        name={icon}
        size={18}
        color={theme.textSecondary}
        style={styles.infoIcon}
      />
      <View style={styles.infoContent}>
        <ThemedText type="caption" style={{ color: theme.textSecondary }}>
          {label}
        </ThemedText>
        <ThemedText
          type="body"
          style={onPress ? { color: Colors.dark.primary } : undefined}
        >
          {value}
        </ThemedText>
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
      >
        {content}
      </Pressable>
    );
  }
  return content;
}

interface PermissionRowProps {
  label: string;
  enabled: boolean;
}

function PermissionRow({ label, enabled }: PermissionRowProps) {
  const { theme } = useTheme();
  return (
    <View style={styles.permissionRow}>
      <ThemedText type="body">{label}</ThemedText>
      <Feather
        name={enabled ? "check-circle" : "x-circle"}
        size={20}
        color={enabled ? Colors.dark.success : theme.textSecondary}
      />
    </View>
  );
}

interface ConversationItemProps {
  conversation: ZekeContactConversation;
  onPress: () => void;
}

function ConversationItem({ conversation, onPress }: ConversationItemProps) {
  const { theme } = useTheme();
  const sourceIcon = getSourceIcon(conversation.source);
  const sourceColor = getSourceColor(conversation.source);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.conversationItem,
        {
          backgroundColor: theme.backgroundSecondary,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.sourceIconContainer,
          { backgroundColor: sourceColor + "20" },
        ]}
      >
        <Feather name={sourceIcon} size={18} color={sourceColor} />
      </View>
      <View style={styles.conversationContent}>
        <ThemedText type="body" numberOfLines={1} style={{ fontWeight: "500" }}>
          {conversation.title}
        </ThemedText>
        {conversation.summary ? (
          <ThemedText
            type="caption"
            numberOfLines={1}
            style={{ color: theme.textSecondary }}
          >
            {conversation.summary}
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.conversationMeta}>
        <ThemedText type="caption" style={{ color: theme.textSecondary }}>
          {formatRelativeDate(conversation.updatedAt)}
        </ThemedText>
        <Feather name="chevron-right" size={16} color={theme.textSecondary} />
      </View>
    </Pressable>
  );
}

export default function ContactDetailScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const route = useRoute<ContactDetailRouteProp>();
  const navigation = useNavigation<ContactDetailNavProp>();
  const { contactId } = route.params;

  const [showEditModal, setShowEditModal] = useState(false);

  const {
    data: contact,
    isLoading,
    isError,
  } = useQuery<ZekeContact | null>({
    queryKey: ["/api/contacts", contactId],
    queryFn: () => getContact(contactId),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteContact(contactId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      navigation.goBack();
    },
    onError: () => {
      Alert.alert("Error", "Failed to delete contact. Please try again.");
    },
  });

  const callMutation = useMutation({
    mutationFn: () => initiateCall(contactId),
    onSuccess: () => {
      Alert.alert("Call Initiated", "The call is being connected.");
    },
    onError: () => {
      Alert.alert("Error", "Failed to initiate call. Please try again.");
    },
  });

  const handleCall = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (contact?.phoneNumber) {
      Alert.alert("Call Contact", `Call ${getFullName(contact)}?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Call", onPress: () => callMutation.mutate() },
      ]);
    }
  }, [contact, callMutation]);

  const handleMessage = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (contact?.phoneNumber) {
      navigation.navigate("SmsCompose", {
        contactId,
        phoneNumber: contact.phoneNumber,
        contactName: getFullName(contact),
      });
    }
  }, [contact, contactId, navigation]);

  const handleEmail = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (contact?.email) {
      Linking.openURL(`mailto:${contact.email}`);
    }
  }, [contact]);

  const handlePhonePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    handleCall();
  }, [handleCall]);

  const handleEmailPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    handleEmail();
  }, [handleEmail]);

  const handleDeleteContact = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      "Delete Contact",
      `Are you sure you want to delete ${contact ? getFullName(contact) : "this contact"}? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate(),
        },
      ],
    );
  }, [contact, deleteMutation]);

  const handleConversationPress = useCallback(
    (conversation: ZekeContactConversation) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Alert.alert("Conversation", `View conversation: ${conversation.title}`);
    },
    [],
  );

  const handleEdit = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowEditModal(true);
  }, []);

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <View
          style={[
            styles.loadingContainer,
            { paddingTop: headerHeight + Spacing.xl },
          ]}
        >
          <ActivityIndicator color={Colors.dark.primary} size="large" />
        </View>
      </ThemedView>
    );
  }

  if (isError || !contact) {
    return (
      <ThemedView style={styles.container}>
        <ScrollView
          contentContainerStyle={{
            paddingTop: headerHeight + Spacing.xl,
            paddingBottom: insets.bottom + Spacing.xl,
            flexGrow: 1,
          }}
        >
          <EmptyState
            icon="alert-circle"
            title="Contact not found"
            description="This contact may have been deleted."
          />
        </ScrollView>
      </ThemedView>
    );
  }

  const accessColor = getAccessLevelColor(contact.accessLevel);
  const subtitle = contact.organization || contact.occupation;

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: insets.bottom + Spacing["3xl"],
          paddingHorizontal: Spacing.lg,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={[styles.largeAvatar, { backgroundColor: accessColor }]}>
            <ThemedText type="h1" style={styles.largeAvatarText}>
              {getInitials(contact)}
            </ThemedText>
          </View>
          <ThemedText type="h2" style={styles.name}>
            {getFullName(contact)}
          </ThemedText>
          {subtitle ? (
            <ThemedText type="body" style={{ color: theme.textSecondary }}>
              {subtitle}
            </ThemedText>
          ) : null}

          <Pressable
            onPress={handleEdit}
            style={({ pressed }) => [
              styles.editButton,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Feather name="edit-2" size={20} color={Colors.dark.primary} />
          </Pressable>
        </View>

        <View style={styles.quickActions}>
          {contact.phoneNumber ? (
            <>
              <Pressable
                onPress={handleMessage}
                style={({ pressed }) => [
                  styles.quickActionButton,
                  { opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <View
                  style={[
                    styles.quickActionIcon,
                    { backgroundColor: Colors.dark.primary + "20" },
                  ]}
                >
                  <Feather
                    name="message-circle"
                    size={22}
                    color={Colors.dark.primary}
                  />
                </View>
                <ThemedText type="caption">Message</ThemedText>
              </Pressable>
              <Pressable
                onPress={handleCall}
                style={({ pressed }) => [
                  styles.quickActionButton,
                  { opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <View
                  style={[
                    styles.quickActionIcon,
                    { backgroundColor: Colors.dark.success + "20" },
                  ]}
                >
                  <Feather name="phone" size={22} color={Colors.dark.success} />
                </View>
                <ThemedText type="caption">Call</ThemedText>
              </Pressable>
            </>
          ) : null}
          {contact.email ? (
            <Pressable
              onPress={handleEmail}
              style={({ pressed }) => [
                styles.quickActionButton,
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <View
                style={[
                  styles.quickActionIcon,
                  { backgroundColor: Colors.dark.secondary + "20" },
                ]}
              >
                <Feather name="mail" size={22} color={Colors.dark.secondary} />
              </View>
              <ThemedText type="caption">Email</ThemedText>
            </Pressable>
          ) : null}
        </View>

        <Card elevation={1} style={styles.card}>
          <ThemedText type="h4" style={styles.cardTitle}>
            Contact Info
          </ThemedText>
          {contact.phoneNumber ? (
            <InfoRow
              icon="phone"
              label="Phone"
              value={contact.phoneNumber}
              onPress={handlePhonePress}
            />
          ) : null}
          {contact.email ? (
            <InfoRow
              icon="mail"
              label="Email"
              value={contact.email}
              onPress={handleEmailPress}
            />
          ) : null}
          {contact.organization ? (
            <InfoRow
              icon="briefcase"
              label="Organization"
              value={contact.organization}
            />
          ) : null}
          {contact.occupation ? (
            <InfoRow
              icon="user"
              label="Occupation"
              value={contact.occupation}
            />
          ) : null}
          {contact.birthday ? (
            <InfoRow
              icon="gift"
              label="Birthday"
              value={formatBirthday(contact.birthday)}
            />
          ) : null}
          {contact.notes ? (
            <InfoRow icon="file-text" label="Notes" value={contact.notes} />
          ) : null}
          {!contact.phoneNumber &&
          !contact.email &&
          !contact.organization &&
          !contact.occupation &&
          !contact.birthday &&
          !contact.notes ? (
            <ThemedText type="body" style={{ color: theme.textSecondary }}>
              No contact info available
            </ThemedText>
          ) : null}
        </Card>

        <Card elevation={1} style={styles.card}>
          <ThemedText type="h4" style={styles.cardTitle}>
            Permissions
          </ThemedText>
          <View
            style={[
              styles.accessBadge,
              { backgroundColor: accessColor + "20" },
            ]}
          >
            <Feather name="shield" size={14} color={accessColor} />
            <ThemedText
              type="small"
              style={{ color: accessColor, fontWeight: "600" }}
            >
              {formatAccessLevel(contact.accessLevel)}
            </ThemedText>
          </View>
          <View style={styles.permissionsGrid}>
            <PermissionRow
              label="Can access calendar"
              enabled={contact.canAccessCalendar}
            />
            <PermissionRow
              label="Can access tasks"
              enabled={contact.canAccessTasks}
            />
            <PermissionRow
              label="Can access grocery"
              enabled={contact.canAccessGrocery}
            />
            <PermissionRow
              label="Can set reminders"
              enabled={contact.canSetReminders}
            />
          </View>
        </Card>

        <Card elevation={1} style={styles.card}>
          <View style={styles.interactionHeader}>
            <ThemedText type="h4">Interaction History</ThemedText>
            <View
              style={[
                styles.countBadge,
                { backgroundColor: Colors.dark.primary + "20" },
              ]}
            >
              <ThemedText
                type="caption"
                style={{ color: Colors.dark.primary, fontWeight: "600" }}
              >
                {contact.interactionCount} interactions
              </ThemedText>
            </View>
          </View>
          {contact.lastInteractionAt ? (
            <ThemedText
              type="caption"
              style={{ color: theme.textSecondary, marginBottom: Spacing.md }}
            >
              Last interaction: {formatRelativeDate(contact.lastInteractionAt)}
            </ThemedText>
          ) : null}
          {contact.conversations && contact.conversations.length > 0 ? (
            <View style={styles.conversationsList}>
              {contact.conversations
                .slice(0, 5)
                .map((conv: ZekeContactConversation) => (
                  <ConversationItem
                    key={conv.id}
                    conversation={conv}
                    onPress={() => handleConversationPress(conv)}
                  />
                ))}
            </View>
          ) : (
            <ThemedText type="body" style={{ color: theme.textSecondary }}>
              No conversations yet
            </ThemedText>
          )}
        </Card>

        <Pressable
          onPress={handleDeleteContact}
          style={({ pressed }) => [
            styles.deleteButton,
            {
              backgroundColor: Colors.dark.error + "15",
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Feather name="trash-2" size={18} color={Colors.dark.error} />
          <ThemedText
            type="body"
            style={{ color: Colors.dark.error, fontWeight: "600" }}
          >
            Delete Contact
          </ThemedText>
        </Pressable>
      </ScrollView>
      <ContactFormModal
        visible={showEditModal}
        onClose={() => setShowEditModal(false)}
        contact={contact}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing["2xl"],
    position: "relative",
  },
  largeAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  largeAvatarText: {
    color: "#FFFFFF",
    fontSize: 36,
    fontWeight: "700",
  },
  name: {
    marginBottom: Spacing.xs,
  },
  editButton: {
    position: "absolute",
    top: 0,
    right: 0,
    padding: Spacing.sm,
  },
  quickActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing["2xl"],
    marginBottom: Spacing["2xl"],
  },
  quickActionButton: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  quickActionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    marginBottom: Spacing.lg,
  },
  cardTitle: {
    marginBottom: Spacing.md,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: Spacing.md,
  },
  infoIcon: {
    marginRight: Spacing.md,
    marginTop: 2,
  },
  infoContent: {
    flex: 1,
    gap: 2,
  },
  accessBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
  },
  permissionsGrid: {
    gap: Spacing.sm,
  },
  permissionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.xs,
  },
  interactionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  countBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
  conversationsList: {
    gap: Spacing.sm,
  },
  conversationItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  sourceIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  conversationContent: {
    flex: 1,
    gap: 2,
  },
  conversationMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.lg,
  },
});
