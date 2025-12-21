import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { EmptyState } from "@/components/EmptyState";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import {
  Spacing,
  Colors,
  BorderRadius,
  Gradients,
  Shadows,
} from "@/constants/theme";
import { queryClient } from "@/lib/query-client";
import {
  getSmsConversations,
  getConversations,
  ZekeContactConversation,
  ZekeConversation,
  sendSms,
  initiateCall,
} from "@/lib/zeke-api-adapter";
import { CommunicationStackParamList } from "@/navigation/CommunicationStackNavigator";

type FilterType = "all" | "sms" | "voice" | "app";

interface CommunicationItem {
  id: string;
  conversationId: string;
  type: "sms" | "voice" | "app";
  title: string;
  phoneNumber?: string;
  contactId?: string;
  lastMessage?: string;
  timestamp: string;
  isUnread?: boolean;
  contactInitials?: string;
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

function getTypeIcon(type: string): keyof typeof Feather.glyphMap {
  switch (type) {
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

function getTypeColor(type: string): string {
  switch (type) {
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

function getTypeBadgeText(type: string): string {
  switch (type) {
    case "sms":
      return "SMS";
    case "voice":
      return "Voice";
    case "app":
      return "Chat";
    default:
      return type;
  }
}

interface FilterTabsProps {
  selected: FilterType;
  onSelect: (filter: FilterType) => void;
}

function FilterTabs({ selected, onSelect }: FilterTabsProps) {
  const { theme } = useTheme();
  const filters: { key: FilterType; label: string }[] = [
    { key: "all", label: "All" },
    { key: "sms", label: "SMS" },
    { key: "voice", label: "Voice" },
    { key: "app", label: "Chat" },
  ];

  return (
    <View style={styles.filterContainer}>
      {filters.map((f) => {
        const isSelected = selected === f.key;
        return (
          <Pressable
            key={f.key}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSelect(f.key);
            }}
            style={({ pressed }) => [
              styles.filterTab,
              isSelected && { backgroundColor: Colors.dark.primary + "20" },
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <ThemedText
              type="small"
              style={{
                color: isSelected ? Colors.dark.primary : theme.textSecondary,
                fontWeight: isSelected ? "600" : "400",
              }}
            >
              {f.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

interface CommunicationRowProps {
  item: CommunicationItem;
  onPress: () => void;
}

function CommunicationRow({ item, onPress }: CommunicationRowProps) {
  const { theme } = useTheme();
  const typeColor = getTypeColor(item.type);
  const typeIcon = getTypeIcon(item.type);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.communicationRow,
        {
          backgroundColor: theme.backgroundDefault,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      {item.contactInitials ? (
        <View style={[styles.avatar, { backgroundColor: Colors.dark.primary }]}>
          <ThemedText type="body" style={styles.avatarText}>
            {item.contactInitials}
          </ThemedText>
        </View>
      ) : (
        <View
          style={[
            styles.avatar,
            { backgroundColor: theme.backgroundSecondary },
          ]}
        >
          <Feather name="phone" size={20} color={theme.textSecondary} />
        </View>
      )}

      <View style={styles.contentContainer}>
        <View style={styles.topRow}>
          <ThemedText
            type="body"
            style={{ fontWeight: "600", flex: 1 }}
            numberOfLines={1}
          >
            {item.title}
          </ThemedText>
          <ThemedText type="caption" style={{ color: theme.textSecondary }}>
            {formatRelativeDate(item.timestamp)}
          </ThemedText>
        </View>
        <View style={styles.bottomRow}>
          {item.lastMessage ? (
            <ThemedText
              type="small"
              style={{ color: theme.textSecondary, flex: 1 }}
              numberOfLines={1}
            >
              {item.lastMessage}
            </ThemedText>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <View
            style={[styles.typeBadge, { backgroundColor: typeColor + "20" }]}
          >
            <Feather name={typeIcon} size={12} color={typeColor} />
            <ThemedText
              type="caption"
              style={{ color: typeColor, fontWeight: "500" }}
            >
              {getTypeBadgeText(item.type)}
            </ThemedText>
          </View>
        </View>
      </View>

      {item.isUnread ? <View style={styles.unreadDot} /> : null}

      <Feather name="chevron-right" size={18} color={theme.textSecondary} />
    </Pressable>
  );
}

type ModalType = "none" | "action" | "sms" | "call";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function CommunicationLogScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<CommunicationStackParamList>>();

  const [filter, setFilter] = useState<FilterType>("all");
  const [modalType, setModalType] = useState<ModalType>("none");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [smsMessage, setSmsMessage] = useState("");

  const fabScale = useSharedValue(1);
  const fabAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: fabScale.value }],
  }));

  const {
    data: smsConversations,
    isLoading: smsLoading,
    isFetching: smsFetching,
  } = useQuery<ZekeContactConversation[]>({
    queryKey: ["/api/sms-log"],
    queryFn: getSmsConversations,
  });

  const {
    data: appConversations,
    isLoading: appLoading,
    isFetching: appFetching,
  } = useQuery<ZekeConversation[]>({
    queryKey: ["/api/conversations"],
    queryFn: getConversations,
  });

  const smsMutation = useMutation({
    mutationFn: ({ to, message }: { to: string; message: string }) =>
      sendSms(to, message),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sms-log"] });
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

  const callMutation = useMutation({
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

  const isLoading = smsLoading || appLoading;
  const isFetching = smsFetching || appFetching;

  const allItems = useMemo(() => {
    const items: CommunicationItem[] = [];

    (smsConversations || []).forEach((conv) => {
      const initials = conv.title
        .split(" ")
        .slice(0, 2)
        .map((w) => w.charAt(0).toUpperCase())
        .join("");

      items.push({
        id: `sms-${conv.id}`,
        conversationId: conv.id,
        type: conv.source === "voice" ? "voice" : "sms",
        title: conv.title,
        phoneNumber: conv.phoneNumber,
        lastMessage: conv.summary,
        timestamp: conv.updatedAt,
        contactInitials: initials || undefined,
      });
    });

    (appConversations || []).forEach((conv) => {
      items.push({
        id: `app-${conv.id}`,
        conversationId: conv.id,
        type: "app",
        title: conv.title || "Chat with ZEKE",
        timestamp: conv.updatedAt,
      });
    });

    items.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    return items;
  }, [smsConversations, appConversations]);

  const filteredItems = useMemo(() => {
    if (filter === "all") return allItems;
    return allItems.filter((item) => item.type === filter);
  }, [allItems, filter]);

  const onRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/sms-log"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] }),
    ]);
  }, []);

  const handleItemPress = useCallback(
    (item: CommunicationItem) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (item.type === "sms" || item.type === "voice") {
        navigation.navigate("SmsConversation", {
          conversationId: item.conversationId,
          contactId: item.contactId,
          phoneNumber: item.phoneNumber,
        });
      }
    },
    [navigation],
  );

  const handleFabPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setModalType("action");
  }, []);

  const handleFabPressIn = () => {
    fabScale.value = withSpring(0.92, { damping: 15, stiffness: 200 });
  };

  const handleFabPressOut = () => {
    fabScale.value = withSpring(1, { damping: 15, stiffness: 200 });
  };

  const handleSendSms = useCallback(() => {
    if (!phoneNumber.trim()) {
      Alert.alert("Error", "Please enter a phone number");
      return;
    }
    if (!smsMessage.trim()) {
      Alert.alert("Error", "Please enter a message");
      return;
    }
    smsMutation.mutate({ to: phoneNumber.trim(), message: smsMessage.trim() });
  }, [phoneNumber, smsMessage, smsMutation]);

  const handleInitiateCall = useCallback(() => {
    if (!phoneNumber.trim()) {
      Alert.alert("Error", "Please enter a phone number");
      return;
    }
    callMutation.mutate(phoneNumber.trim());
  }, [phoneNumber, callMutation]);

  const closeModal = useCallback(() => {
    setModalType("none");
    setPhoneNumber("");
    setSmsMessage("");
  }, []);

  const renderItem = ({ item }: { item: CommunicationItem }) => (
    <CommunicationRow item={item} onPress={() => handleItemPress(item)} />
  );

  const keyExtractor = (item: CommunicationItem) => item.id;

  const renderEmpty = () => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Colors.dark.primary} size="large" />
        </View>
      );
    }

    const emptyMessage =
      filter === "all"
        ? "No communications yet"
        : `No ${getTypeBadgeText(filter)} conversations`;

    return (
      <EmptyState
        icon="message-circle"
        title={emptyMessage}
        description="Your conversations will appear here."
      />
    );
  };

  const fabBottom = insets.bottom + Spacing["3xl"];

  return (
    <ThemedView style={styles.container}>
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: insets.bottom + Spacing["3xl"] + 80,
          flexGrow: 1,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        data={filteredItems}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={
          <FilterTabs selected={filter} onSelect={setFilter} />
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
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
      />

      <View
        style={[styles.fabWrapper, { bottom: fabBottom }]}
        pointerEvents="box-none"
      >
        <AnimatedPressable
          onPress={handleFabPress}
          onPressIn={handleFabPressIn}
          onPressOut={handleFabPressOut}
          style={[styles.fabContainer, fabAnimatedStyle]}
        >
          <LinearGradient
            colors={Gradients.accent}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fabGradient}
          >
            <Feather name="plus" size={28} color="#FFFFFF" />
          </LinearGradient>
        </AnimatedPressable>
      </View>

      <Modal
        visible={modalType === "action"}
        animationType="fade"
        transparent
        onRequestClose={closeModal}
      >
        <Pressable style={styles.modalOverlay} onPress={closeModal}>
          <View
            style={[
              styles.actionSheet,
              { backgroundColor: theme.backgroundDefault },
            ]}
          >
            <View style={styles.actionSheetHandle} />
            <ThemedText type="h3" style={styles.actionSheetTitle}>
              New Communication
            </ThemedText>

            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setModalType("sms");
              }}
              style={({ pressed }) => [
                styles.actionOption,
                {
                  backgroundColor: pressed
                    ? theme.backgroundSecondary
                    : "transparent",
                },
              ]}
            >
              <View
                style={[
                  styles.actionIcon,
                  { backgroundColor: Colors.dark.success + "20" },
                ]}
              >
                <Feather
                  name="message-square"
                  size={24}
                  color={Colors.dark.success}
                />
              </View>
              <View style={styles.actionTextContainer}>
                <ThemedText type="body" style={{ fontWeight: "600" }}>
                  New SMS
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  Send a text message
                </ThemedText>
              </View>
              <Feather
                name="chevron-right"
                size={20}
                color={theme.textSecondary}
              />
            </Pressable>

            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setModalType("call");
              }}
              style={({ pressed }) => [
                styles.actionOption,
                {
                  backgroundColor: pressed
                    ? theme.backgroundSecondary
                    : "transparent",
                },
              ]}
            >
              <View
                style={[
                  styles.actionIcon,
                  { backgroundColor: Colors.dark.warning + "20" },
                ]}
              >
                <Feather name="phone" size={24} color={Colors.dark.warning} />
              </View>
              <View style={styles.actionTextContainer}>
                <ThemedText type="body" style={{ fontWeight: "600" }}>
                  New Call
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  Initiate a phone call
                </ThemedText>
              </View>
              <Feather
                name="chevron-right"
                size={20}
                color={theme.textSecondary}
              />
            </Pressable>

            <Pressable
              onPress={closeModal}
              style={[
                styles.cancelButton,
                { backgroundColor: theme.backgroundSecondary },
              ]}
            >
              <ThemedText type="body" style={{ fontWeight: "600" }}>
                Cancel
              </ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={modalType === "sms"}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAwareScrollViewCompat
            contentContainerStyle={styles.modalScrollContent}
            bounces={false}
          >
            <View
              style={[
                styles.formModal,
                { backgroundColor: theme.backgroundDefault },
              ]}
            >
              <View style={styles.modalHeader}>
                <Pressable onPress={closeModal} style={styles.modalCloseButton}>
                  <Feather name="x" size={24} color={theme.text} />
                </Pressable>
                <ThemedText type="h3">Compose SMS</ThemedText>
                <View style={{ width: 40 }} />
              </View>

              <View style={styles.formGroup}>
                <ThemedText
                  type="small"
                  style={[styles.label, { color: theme.textSecondary }]}
                >
                  Phone Number
                </ThemedText>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.backgroundSecondary,
                      color: theme.text,
                      borderColor: theme.border,
                    },
                  ]}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  placeholder="+1 (555) 123-4567"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                />
              </View>

              <View style={styles.formGroup}>
                <ThemedText
                  type="small"
                  style={[styles.label, { color: theme.textSecondary }]}
                >
                  Message
                </ThemedText>
                <TextInput
                  style={[
                    styles.textArea,
                    {
                      backgroundColor: theme.backgroundSecondary,
                      color: theme.text,
                      borderColor: theme.border,
                    },
                  ]}
                  value={smsMessage}
                  onChangeText={setSmsMessage}
                  placeholder="Type your message..."
                  placeholderTextColor={theme.textSecondary}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>

              <Pressable
                onPress={handleSendSms}
                disabled={smsMutation.isPending}
                style={({ pressed }) => [
                  styles.submitButton,
                  { opacity: pressed || smsMutation.isPending ? 0.7 : 1 },
                ]}
              >
                <LinearGradient
                  colors={Gradients.primary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.submitGradient}
                >
                  {smsMutation.isPending ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Feather name="send" size={18} color="#FFFFFF" />
                      <ThemedText type="body" style={styles.submitText}>
                        Send SMS
                      </ThemedText>
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>

      <Modal
        visible={modalType === "call"}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAwareScrollViewCompat
            contentContainerStyle={styles.modalScrollContent}
            bounces={false}
          >
            <View
              style={[
                styles.formModal,
                { backgroundColor: theme.backgroundDefault },
              ]}
            >
              <View style={styles.modalHeader}>
                <Pressable onPress={closeModal} style={styles.modalCloseButton}>
                  <Feather name="x" size={24} color={theme.text} />
                </Pressable>
                <ThemedText type="h3">Initiate Call</ThemedText>
                <View style={{ width: 40 }} />
              </View>

              <View style={styles.formGroup}>
                <ThemedText
                  type="small"
                  style={[styles.label, { color: theme.textSecondary }]}
                >
                  Phone Number
                </ThemedText>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.backgroundSecondary,
                      color: theme.text,
                      borderColor: theme.border,
                    },
                  ]}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  placeholder="+1 (555) 123-4567"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                />
              </View>

              <Pressable
                onPress={handleInitiateCall}
                disabled={callMutation.isPending}
                style={({ pressed }) => [
                  styles.submitButton,
                  { opacity: pressed || callMutation.isPending ? 0.7 : 1 },
                ]}
              >
                <LinearGradient
                  colors={[Colors.dark.warning, Colors.dark.success]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.submitGradient}
                >
                  {callMutation.isPending ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Feather name="phone" size={18} color="#FFFFFF" />
                      <ThemedText type="body" style={styles.submitText}>
                        Start Call
                      </ThemedText>
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterContainer: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  filterTab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  communicationRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginHorizontal: Spacing.lg,
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
  contentContainer: {
    flex: 1,
    gap: Spacing.xs,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.dark.primary,
    marginRight: Spacing.sm,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: Spacing["3xl"],
  },
  fabWrapper: {
    position: "absolute",
    right: Spacing.lg,
    zIndex: 9999,
    ...Platform.select({
      web: { elevation: 9999 },
      default: {},
    }),
  },
  fabContainer: {
    ...Shadows.large,
  },
  fabGradient: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "flex-end",
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: "flex-end",
  },
  actionSheet: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing["2xl"],
  },
  actionSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.dark.border,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  actionSheetTitle: {
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  actionOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  actionTextContainer: {
    flex: 1,
    gap: 2,
  },
  cancelButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
  },
  formModal: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing["2xl"],
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    marginBottom: Spacing.xl,
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  formGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    marginBottom: Spacing.sm,
    fontWeight: "500",
  },
  input: {
    height: Spacing.inputHeight,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
  },
  textArea: {
    minHeight: 120,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: 16,
  },
  submitButton: {
    marginTop: Spacing.md,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  submitGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    height: Spacing.buttonHeight,
  },
  submitText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
});
