import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  useNavigation,
  CompositeNavigationProp,
} from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { SearchBar } from "@/components/SearchBar";
import { EmptyState } from "@/components/EmptyState";
import { ContactFormModal } from "@/components/ContactFormModal";
import { useTheme } from "@/hooks/useTheme";
import { useContactSync } from "@/hooks/useContactSync";
import { Spacing, Colors, BorderRadius } from "@/constants/theme";
import { formatAccessLevel, getAccessLevelColor } from "@/lib/access-levels";
import { queryClient } from "@/lib/query-client";
import { getContacts, initiateCall, ZekeContact } from "@/lib/zeke-api-adapter";
import { ContactsStackParamList } from "@/navigation/ContactsStackNavigator";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type ContactsNavProp = CompositeNavigationProp<
  NativeStackNavigationProp<ContactsStackParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

interface ContactSection {
  letter: string;
  data: ZekeContact[];
}

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
        styles.contactRow,
        {
          backgroundColor: theme.backgroundDefault,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: accessColor }]}>
        <ThemedText type="body" style={styles.avatarText}>
          {getInitials(contact)}
        </ThemedText>
      </View>
      <View style={styles.contactInfo}>
        <ThemedText type="body" style={{ fontWeight: "600" }}>
          {getFullName(contact)}
        </ThemedText>
        {accessLabel ? (
          <View style={[styles.badge, { backgroundColor: accessColor + "30" }]}>
            <ThemedText type="caption" style={{ color: accessColor }}>
              {accessLabel}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <View style={styles.actions}>
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

function formatSyncTime(isoString: string | null): string {
  if (!isoString) return "Never synced";
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export default function ContactsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<ContactsNavProp>();
  const { syncNow, isSyncing, lastSyncTime, lastSyncCount, syncError } =
    useContactSync();

  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  const handleSync = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await syncNow();
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (result.error) {
      Alert.alert("Sync Failed", result.error);
    }
  };

  const {
    data: contacts,
    isLoading,
    isError,
    isFetching,
  } = useQuery<ZekeContact[]>({
    queryKey: ["/api/contacts"],
    queryFn: getContacts,
  });

  const callMutation = useMutation({
    mutationFn: (contactId: string) => initiateCall(contactId),
    onSuccess: () => {
      Alert.alert("Call Initiated", "The call is being connected.");
    },
    onError: () => {
      Alert.alert("Error", "Failed to initiate call. Please try again.");
    },
  });

  const filteredContacts = useMemo(() => {
    if (!contacts) return [];
    if (!searchQuery.trim()) return contacts;

    const query = searchQuery.toLowerCase();
    return contacts.filter((c) => {
      const fullName = getFullName(c).toLowerCase();
      const email = c.email?.toLowerCase() || "";
      const phone = c.phoneNumber || "";
      return (
        fullName.includes(query) ||
        email.includes(query) ||
        phone.includes(query)
      );
    });
  }, [contacts, searchQuery]);

  const sections = useMemo(() => {
    const sorted = [...filteredContacts].sort((a, b) => {
      const nameA = (a.lastName || a.firstName || "").toLowerCase();
      const nameB = (b.lastName || b.firstName || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });

    const grouped: Map<string, ZekeContact[]> = new Map();
    sorted.forEach((contact) => {
      const letter = (
        contact.lastName?.charAt(0) ||
        contact.firstName?.charAt(0) ||
        "#"
      ).toUpperCase();
      if (!grouped.has(letter)) {
        grouped.set(letter, []);
      }
      grouped.get(letter)!.push(contact);
    });

    const result: ContactSection[] = [];
    const sortedLetters = Array.from(grouped.keys()).sort();
    sortedLetters.forEach((letter) => {
      result.push({ letter, data: grouped.get(letter)! });
    });

    return result;
  }, [filteredContacts]);

  const flatData = useMemo(() => {
    const result: (
      | { type: "header"; letter: string }
      | { type: "contact"; contact: ZekeContact }
    )[] = [];
    sections.forEach((section) => {
      result.push({ type: "header", letter: section.letter });
      section.data.forEach((contact) => {
        result.push({ type: "contact", contact });
      });
    });
    return result;
  }, [sections]);

  const onRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
  }, []);

  const handleContactPress = (contact: ZekeContact) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("ContactDetail", { contactId: contact.id });
  };

  const handleCall = (contact: ZekeContact) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Call Contact", `Call ${getFullName(contact)}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Call",
        onPress: () => callMutation.mutate(contact.id),
      },
    ]);
  };

  const handleMessage = (contact: ZekeContact) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("SmsCompose", {
      contactId: contact.id,
      phoneNumber: contact.phoneNumber,
      contactName: getFullName(contact),
    });
  };

  const handleAddContact = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowAddModal(true);
  };

  const renderItem = ({ item }: { item: (typeof flatData)[number] }) => {
    if (item.type === "header") {
      return (
        <View
          style={[
            styles.sectionHeader,
            { backgroundColor: theme.backgroundRoot },
          ]}
        >
          <ThemedText
            type="small"
            style={{ color: theme.textSecondary, fontWeight: "600" }}
          >
            {item.letter}
          </ThemedText>
        </View>
      );
    }

    return (
      <ContactRow
        contact={item.contact}
        onPress={() => handleContactPress(item.contact)}
        onCall={() => handleCall(item.contact)}
        onMessage={() => handleMessage(item.contact)}
      />
    );
  };

  const keyExtractor = (item: (typeof flatData)[number], index: number) => {
    if (item.type === "header") {
      return `header-${item.letter}`;
    }
    return item.contact.id;
  };

  const renderEmpty = () => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Colors.dark.primary} />
        </View>
      );
    }
    if (isError) {
      return (
        <EmptyState
          icon="alert-circle"
          title="Failed to load contacts"
          description="Please try again later."
        />
      );
    }
    if (searchQuery.trim()) {
      return (
        <EmptyState
          icon="search"
          title="No results"
          description={`No contacts matching "${searchQuery}"`}
        />
      );
    }
    return (
      <EmptyState
        icon="users"
        title="No contacts yet"
        description="Add contacts to stay connected with the people in your life."
      />
    );
  };

  return (
    <ThemedView style={styles.container}>
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: tabBarHeight + Spacing.xl + 80,
          flexGrow: 1,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        data={flatData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={
          <View style={styles.searchContainer}>
            <SearchBar
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search contacts..."
            />
            <View style={styles.syncRow}>
              <View style={styles.syncInfo}>
                <Feather
                  name="refresh-cw"
                  size={12}
                  color={theme.textSecondary}
                />
                <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                  {formatSyncTime(lastSyncTime)}
                  {lastSyncCount > 0 ? ` (${lastSyncCount})` : ""}
                </ThemedText>
              </View>
              <Pressable
                onPress={handleSync}
                disabled={isSyncing}
                style={({ pressed }) => [
                  styles.syncButton,
                  pressed && { opacity: 0.7 },
                  isSyncing && { opacity: 0.5 },
                ]}
              >
                {isSyncing ? (
                  <ActivityIndicator size="small" color={Colors.dark.primary} />
                ) : (
                  <>
                    <Feather name="cloud-lightning" size={14} color={Colors.dark.primary} />
                    <ThemedText type="caption" style={{ color: Colors.dark.primary, fontWeight: "600" }}>
                      Sync Now
                    </ThemedText>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={onRefresh}
            tintColor={Colors.dark.primary}
            colors={[Colors.dark.primary]}
          />
        }
        stickyHeaderIndices={[]}
      />
      <Pressable
        onPress={handleAddContact}
        style={({ pressed }) => [
          styles.fab,
          { bottom: tabBarHeight + Spacing.lg, opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <View style={styles.fabInner}>
          <Feather name="user-plus" size={24} color="#FFFFFF" />
        </View>
      </Pressable>
      <ContactFormModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  syncRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.sm,
  },
  syncInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.primary + "20",
  },
  sectionHeader: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  avatarText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  contactInfo: {
    flex: 1,
    gap: Spacing.xs,
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  actionButton: {
    padding: Spacing.xs,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: Spacing["3xl"],
  },
  fab: {
    position: "absolute",
    right: Spacing.lg,
    zIndex: 100,
  },
  fabInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: {
        boxShadow: "0px 4px 16px rgba(0, 0, 0, 0.25)",
      },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 8,
      },
    }),
  },
});
