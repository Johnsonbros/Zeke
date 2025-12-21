import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight, HeaderButton } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useQuery, useMutation } from "@tanstack/react-query";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, Colors, BorderRadius, Gradients } from "@/constants/theme";
import { queryClient } from "@/lib/query-client";
import {
  sendSms,
  initiateCall,
  getTwilioConversation,
  getTwilioPhoneNumber,
  type TwilioSmsMessage,
} from "@/lib/zeke-api-adapter";
import { CommunicationStackParamList } from "@/navigation/CommunicationStackNavigator";

type Props = NativeStackScreenProps<
  CommunicationStackParamList,
  "SmsConversation"
>;

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return "Today";
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  return date.toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function getStatusInfo(status: string): { icon: keyof typeof Feather.glyphMap; label: string } {
  switch (status?.toLowerCase()) {
    case "delivered":
      return { icon: "check-circle", label: "Delivered" };
    case "sent":
      return { icon: "check", label: "Sent" };
    case "queued":
    case "sending":
      return { icon: "clock", label: "Sending" };
    case "failed":
    case "undelivered":
      return { icon: "alert-circle", label: "Failed" };
    default:
      return { icon: "check", label: "" };
  }
}

function groupMessagesByDate(
  messages: TwilioSmsMessage[],
): { date: string; messages: TwilioSmsMessage[] }[] {
  const groups: Map<string, TwilioSmsMessage[]> = new Map();

  messages.forEach((msg) => {
    const date = new Date(msg.dateCreated).toDateString();
    if (!groups.has(date)) {
      groups.set(date, []);
    }
    groups.get(date)!.push(msg);
  });

  return Array.from(groups.entries())
    .map(([date, msgs]) => ({
      date,
      messages: msgs.sort(
        (a, b) =>
          new Date(a.dateCreated).getTime() - new Date(b.dateCreated).getTime(),
      ),
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

// Notification detection patterns - messages that look like automated notifications from ZEKE
const NOTIFICATION_PATTERNS = [
  /^reminder:/i,
  /^alert:/i,
  /^task:/i,
  /^grocery:/i,
  /^calendar:/i,
  /don['']t forget/i,
  /remember to/i,
  /upcoming:/i,
  /scheduled:/i,
  /^zeke:/i,
  /^notification:/i,
];

function isNotificationMessage(message: TwilioSmsMessage, isOutbound: boolean): boolean {
  // Only inbound messages from ZEKE can be notifications
  if (isOutbound) return false;
  
  const body = message.body.toLowerCase();
  return NOTIFICATION_PATTERNS.some((pattern) => pattern.test(body));
}

type MessageType = "notification" | "conversation";

function getMessageType(message: TwilioSmsMessage, isOutbound: boolean): MessageType {
  if (isNotificationMessage(message, isOutbound)) {
    return "notification";
  }
  return "conversation";
}

interface SmsBubbleProps {
  message: TwilioSmsMessage;
  isOutbound: boolean;
}

function SmsBubble({ message, isOutbound }: SmsBubbleProps) {
  const { theme } = useTheme();
  const statusInfo = isOutbound ? getStatusInfo(message.status) : null;
  const isFailed = message.status?.toLowerCase() === "failed" || message.status?.toLowerCase() === "undelivered";
  const messageType = getMessageType(message, isOutbound);
  const isNotification = messageType === "notification";

  if (isOutbound) {
    return (
      <View style={[styles.bubbleContainer, styles.outboundContainer]}>
        <LinearGradient
          colors={Gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.outboundBubble}
        >
          <ThemedText style={styles.outboundText}>{message.body}</ThemedText>
        </LinearGradient>
        <View style={styles.timestampRow}>
          <ThemedText type="caption" secondary style={styles.timestamp}>
            {formatMessageTime(message.dateCreated)}
          </ThemedText>
          {statusInfo ? (
            <View style={styles.statusContainer}>
              <Feather
                name={statusInfo.icon}
                size={12}
                color={isFailed ? Colors.dark.error : theme.textSecondary}
              />
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  // Notification style - distinct from regular conversation messages
  if (isNotification) {
    return (
      <View style={[styles.bubbleContainer, styles.inboundContainer]}>
        <View
          style={[
            styles.notificationBubble,
            { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
          ]}
        >
          <View style={styles.notificationHeader}>
            <Feather name="bell" size={12} color={Colors.dark.warning} />
            <ThemedText type="caption" style={styles.notificationLabel}>
              Notification
            </ThemedText>
          </View>
          <ThemedText style={styles.notificationText}>{message.body}</ThemedText>
        </View>
        <ThemedText type="caption" secondary style={styles.timestamp}>
          {formatMessageTime(message.dateCreated)}
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.bubbleContainer, styles.inboundContainer]}>
      <View
        style={[
          styles.inboundBubble,
          { backgroundColor: theme.backgroundDefault },
        ]}
      >
        <ThemedText>{message.body}</ThemedText>
      </View>
      <ThemedText type="caption" secondary style={styles.timestamp}>
        {formatMessageTime(message.dateCreated)}
      </ThemedText>
    </View>
  );
}

interface DateSeparatorProps {
  date: string;
}

function DateSeparator({ date }: DateSeparatorProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.dateSeparator}>
      <View style={[styles.separatorLine, { backgroundColor: theme.border }]} />
      <ThemedText type="caption" style={styles.dateText}>
        {formatDateSeparator(date)}
      </ThemedText>
      <View style={[styles.separatorLine, { backgroundColor: theme.border }]} />
    </View>
  );
}

export default function SmsConversationScreen({ route, navigation }: Props) {
  const { phoneNumber } = route.params;
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const flatListRef = useRef<FlatList>(null);

  const [inputText, setInputText] = useState("");
  const [optimisticMessages, setOptimisticMessages] = useState<TwilioSmsMessage[]>([]);
  const [showNotifications, setShowNotifications] = useState(true);

  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();

  const animatedInputContainerStyle = useAnimatedStyle(() => {
    // Only apply negative translation (moving up) when keyboard is open
    // keyboardHeight.value is negative when keyboard is open, 0 when closed
    const translateY = Math.min(0, keyboardHeight.value);
    return {
      transform: [{ translateY }],
    };
  });

  const { data: twilioPhoneNumber } = useQuery({
    queryKey: ["twilio-phone-number"],
    queryFn: getTwilioPhoneNumber,
    staleTime: 300000,
  });

  const {
    data: conversationData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["twilio-conversation", phoneNumber],
    queryFn: () => getTwilioConversation(phoneNumber || ""),
    enabled: !!phoneNumber,
    refetchInterval: 10000,
  });

  const contactName = conversationData?.contactName || phoneNumber || "Unknown";

  useEffect(() => {
    navigation.setOptions({
      headerTitle: contactName,
      headerRight: () => (
        <HeaderButton onPress={handleCallPress} pressOpacity={0.7}>
          <Feather name="phone" size={22} color={Colors.dark.primary} />
        </HeaderButton>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, contactName]);

  const handleCallPress = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (phoneNumber) {
      try {
        await initiateCall(phoneNumber);
        if (Platform.OS === "web") {
          window.alert("Call initiated successfully!");
        } else {
          Alert.alert("Call Initiated", "Your call is being connected.");
        }
      } catch (error: any) {
        if (Platform.OS === "web") {
          window.alert(
            `Failed to initiate call: ${error.message || "Please try again."}`,
          );
        } else {
          Alert.alert("Error", "Failed to initiate call. Please try again.");
        }
      }
    } else {
      if (Platform.OS === "web") {
        window.alert("No phone number available for calling.");
      } else {
        Alert.alert("Cannot Call", "No phone number available for calling.");
      }
    }
  }, [phoneNumber]);

  const messages = useMemo(() => {
    const apiMessages = conversationData?.messages || [];
    const allMessages = [...apiMessages, ...optimisticMessages];
    
    // Filter out notifications if toggle is off
    if (!showNotifications) {
      return allMessages.filter((msg) => {
        const isOutbound = msg.direction === "outbound-api" || 
          msg.direction === "outbound-reply" || 
          msg.from === twilioPhoneNumber;
        return !isNotificationMessage(msg, isOutbound);
      });
    }
    return allMessages;
  }, [conversationData, optimisticMessages, showNotifications, twilioPhoneNumber]);

  // Count notifications for the filter badge
  const notificationCount = useMemo(() => {
    const apiMessages = conversationData?.messages || [];
    return apiMessages.filter((msg) => {
      const isOutbound = msg.direction === "outbound-api" || 
        msg.direction === "outbound-reply" || 
        msg.from === twilioPhoneNumber;
      return isNotificationMessage(msg, isOutbound);
    }).length;
  }, [conversationData, twilioPhoneNumber]);

  const groupedMessages = useMemo(() => {
    return groupMessagesByDate(messages);
  }, [messages]);

  const flatListData = useMemo(() => {
    const items: {
      type: "date" | "message";
      data: string | TwilioSmsMessage;
    }[] = [];
    groupedMessages.forEach((group) => {
      items.push({ type: "date", data: group.date });
      group.messages.forEach((msg) => {
        items.push({ type: "message", data: msg });
      });
    });
    return items;
  }, [groupedMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [flatListData]);

  const scrollToBottom = () => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const sendMutation = useMutation({
    mutationFn: async ({ to, body, tempId }: { to: string; body: string; tempId: string }) => {
      return sendSms(to, body);
    },
    onSuccess: (_data, variables) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Clear optimistic message
      setOptimisticMessages((prev) => prev.filter((m) => m.sid !== variables.tempId));
      queryClient.invalidateQueries({
        queryKey: ["twilio-conversation", phoneNumber],
      });
      queryClient.invalidateQueries({ queryKey: ["twilio-conversations"] });
      refetch();
    },
    onError: (error: Error, variables) => {
      // Mark optimistic message as failed
      setOptimisticMessages((prev) =>
        prev.map((m) =>
          m.sid === variables.tempId ? { ...m, status: "failed" } : m
        )
      );
      if (Platform.OS === "web") {
        window.alert(
          `Failed to send message: ${error.message || "Please try again."}`,
        );
      } else {
        Alert.alert("Error", "Failed to send message. Please try again.");
      }
    },
  });

  const handleSend = async () => {
    if (!inputText.trim() || !phoneNumber) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const messageContent = inputText.trim();
    const tempId = `temp-${Date.now()}`;
    
    // Create optimistic message
    const optimisticMessage: TwilioSmsMessage = {
      sid: tempId,
      to: phoneNumber,
      from: twilioPhoneNumber || "",
      body: messageContent,
      status: "sending",
      direction: "outbound-api",
      dateSent: null,
      dateCreated: new Date().toISOString(),
    };
    
    setInputText("");
    setOptimisticMessages((prev) => [...prev, optimisticMessage]);

    sendMutation.mutate({ to: phoneNumber, body: messageContent, tempId });
  };

  const isOutboundMessage = (msg: TwilioSmsMessage): boolean => {
    return (
      msg.direction === "outbound-api" ||
      msg.direction === "outbound-reply" ||
      msg.from === twilioPhoneNumber
    );
  };

  const renderItem = ({
    item,
  }: {
    item: { type: "date" | "message"; data: string | TwilioSmsMessage };
  }) => {
    if (item.type === "date") {
      return <DateSeparator date={item.data as string} />;
    }
    const msg = item.data as TwilioSmsMessage;
    return <SmsBubble message={msg} isOutbound={isOutboundMessage(msg)} />;
  };

  const renderEmpty = () => {
    if (isLoading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator color={Colors.dark.primary} />
          <ThemedText type="body" secondary style={{ marginTop: Spacing.md }}>
            Loading messages...
          </ThemedText>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Feather name="message-square" size={48} color={theme.textSecondary} />
        <ThemedText
          type="h3"
          style={{ marginTop: Spacing.md, marginBottom: Spacing.sm }}
        >
          No messages yet
        </ThemedText>
        <ThemedText type="body" secondary style={{ textAlign: "center" }}>
          Start a conversation by sending a message below.
        </ThemedText>
      </View>
    );
  };

  const renderFilterHeader = () => {
    if (notificationCount === 0) return null;
    
    return (
      <View style={styles.filterContainer}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowNotifications(!showNotifications);
          }}
          style={[
            styles.filterChip,
            {
              backgroundColor: showNotifications 
                ? theme.backgroundSecondary 
                : Colors.dark.primary + "20",
              borderColor: showNotifications 
                ? theme.border 
                : Colors.dark.primary,
            },
          ]}
        >
          <Feather 
            name={showNotifications ? "bell" : "bell-off"} 
            size={14} 
            color={showNotifications ? theme.textSecondary : Colors.dark.primary} 
          />
          <ThemedText 
            type="caption" 
            style={{ 
              color: showNotifications ? theme.textSecondary : Colors.dark.primary,
              marginLeft: Spacing.xs,
            }}
          >
            {showNotifications ? "Notifications" : "Notifications hidden"}
          </ThemedText>
          {notificationCount > 0 ? (
            <View style={[
              styles.filterBadge,
              { backgroundColor: showNotifications ? theme.textSecondary : Colors.dark.primary },
            ]}>
              <ThemedText type="caption" style={styles.filterBadgeText}>
                {notificationCount}
              </ThemedText>
            </View>
          ) : null}
        </Pressable>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={headerHeight}
    >
      <FlatList
        ref={flatListRef}
        style={styles.messagesList}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.lg,
          paddingBottom: Math.max(tabBarHeight, insets.bottom) + 80 + Spacing.lg,
          paddingHorizontal: Spacing.lg,
          flexGrow: 1,
        }}
        data={flatListData}
        renderItem={renderItem}
        keyExtractor={(item, index) =>
          item.type === "date"
            ? `date-${item.data}`
            : `msg-${(item.data as TwilioSmsMessage).sid}`
        }
        ListEmptyComponent={renderEmpty}
        ListHeaderComponent={renderFilterHeader}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      />

      <Animated.View
        style={[
          styles.inputContainer,
          {
            backgroundColor: theme.backgroundDefault,
            bottom: Math.max(tabBarHeight, insets.bottom),
            paddingBottom: Spacing.md,
          },
          animatedInputContainerStyle,
        ]}
      >
        <View
          style={[
            styles.inputWrapper,
            { backgroundColor: theme.backgroundSecondary },
          ]}
        >
          <TextInput
            style={[styles.input, { color: theme.text }]}
            placeholder="Type a message..."
            placeholderTextColor={theme.textSecondary}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={1000}
            returnKeyType="default"
          />
        </View>
        <Pressable
          onPress={handleSend}
          disabled={!inputText.trim() || sendMutation.isPending}
          style={({ pressed }) => [
            styles.sendButton,
            {
              opacity:
                !inputText.trim() || sendMutation.isPending
                  ? 0.5
                  : pressed
                    ? 0.8
                    : 1,
            },
          ]}
        >
          <LinearGradient
            colors={Gradients.primary}
            style={styles.sendButtonGradient}
          >
            {sendMutation.isPending ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Feather name="send" size={20} color="#FFFFFF" />
            )}
          </LinearGradient>
        </Pressable>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  messagesList: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  bubbleContainer: {
    marginBottom: Spacing.md,
    maxWidth: "85%",
  },
  outboundContainer: {
    alignSelf: "flex-end",
    alignItems: "flex-end",
  },
  inboundContainer: {
    alignSelf: "flex-start",
    alignItems: "flex-start",
  },
  outboundBubble: {
    borderRadius: BorderRadius.md,
    borderBottomRightRadius: BorderRadius.xs,
    padding: Spacing.md,
  },
  outboundText: {
    color: "#FFFFFF",
  },
  inboundBubble: {
    borderRadius: BorderRadius.md,
    borderBottomLeftRadius: BorderRadius.xs,
    padding: Spacing.md,
  },
  timestamp: {
    marginTop: Spacing.xs,
  },
  timestampRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  statusContainer: {
    marginLeft: Spacing.xs,
  },
  dateSeparator: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  separatorLine: {
    flex: 1,
    height: 1,
  },
  dateText: {
    paddingHorizontal: Spacing.md,
    color: Colors.dark.textSecondary,
  },
  inputContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  inputWrapper: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 44,
    maxHeight: 120,
  },
  input: {
    fontSize: 16,
    minHeight: 28,
    maxHeight: 100,
  },
  sendButton: {
    marginBottom: Spacing.xs,
  },
  sendButtonGradient: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  notificationBubble: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.md,
  },
  notificationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  notificationLabel: {
    color: Colors.dark.warning,
    fontWeight: "600",
  },
  notificationText: {
    fontSize: 14,
    lineHeight: 20,
  },
  filterContainer: {
    marginBottom: Spacing.md,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  filterBadge: {
    marginLeft: Spacing.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: "center",
  },
  filterBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "600",
  },
});
