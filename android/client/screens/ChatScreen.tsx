import React, { useState, useRef, useEffect, useMemo } from "react";
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
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ThemedText } from "@/components/ThemedText";
import { ChatBubble, Message, TypingIndicator } from "@/components/ChatBubble";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, Colors, BorderRadius, Gradients } from "@/constants/theme";
import { queryClient, isZekeSyncMode } from "@/lib/query-client";
import {
  createConversation,
  getConversationMessages,
  sendMessage as sendZekeMessage,
} from "@/lib/zeke-api-adapter";
import { sendStreamingMessage } from "@/lib/sse-client";

const CHAT_SESSION_KEY = "zeke_chat_session_id";
const ZEKE_CONVERSATION_KEY = "zeke_conversation_id";

interface ApiChatMessage {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  createdAt: string;
}

// Extended Message type for unified conversation
interface UnifiedMessage extends Message {
  channel?: "chat" | "sms";
  rawTimestamp?: string;
}

function formatTimestamp(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function mapApiMessageToMessage(msg: ApiChatMessage): Message {
  return {
    id: msg.id,
    content: msg.content,
    role: msg.role as "user" | "assistant",
    timestamp: formatTimestamp(msg.createdAt),
  };
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const flatListRef = useRef<FlatList>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const streamAbortRef = useRef<{ abort: () => void } | null>(null);

  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();

  const animatedInputContainerStyle = useAnimatedStyle(() => {
    // Only apply negative translation (moving up) when keyboard is open
    const translateY = Math.min(0, keyboardHeight.value);
    return {
      transform: [{ translateY }],
    };
  });

  useEffect(() => {
    initializeSession();
    
    // Cleanup streaming on unmount
    return () => {
      if (streamAbortRef.current) {
        streamAbortRef.current.abort();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isValidId = (id: string | null): boolean => {
    return !!id && id !== "undefined" && id !== "null" && id.length > 5;
  };

  const initializeSession = async () => {
    try {
      if (isZekeSyncMode()) {
        const storedConversationId = await AsyncStorage.getItem(
          ZEKE_CONVERSATION_KEY,
        );

        if (isValidId(storedConversationId)) {
          try {
            const messages = await getConversationMessages(
              storedConversationId!,
            );
            if (Array.isArray(messages)) {
              setSessionId(storedConversationId);
              setIsInitializing(false);
              return;
            }
          } catch {
            await AsyncStorage.removeItem(ZEKE_CONVERSATION_KEY);
          }
        } else if (storedConversationId) {
          await AsyncStorage.removeItem(ZEKE_CONVERSATION_KEY);
        }

        const newConversation = await createConversation("Chat with ZEKE");
        if (!newConversation?.id || !isValidId(newConversation.id)) {
          throw new Error(
            "Failed to create conversation - invalid ID received",
          );
        }
        await AsyncStorage.setItem(ZEKE_CONVERSATION_KEY, newConversation.id);
        setSessionId(newConversation.id);
      } else {
        const storedSessionId = await AsyncStorage.getItem(CHAT_SESSION_KEY);

        if (isValidId(storedSessionId)) {
          try {
            const { apiClient } = await import("@/lib/api-client");
            await apiClient.get(
              `/api/chat/sessions/${storedSessionId}/messages`,
            );
            setSessionId(storedSessionId);
            setIsInitializing(false);
            return;
          } catch {
            await AsyncStorage.removeItem(CHAT_SESSION_KEY);
          }
        } else if (storedSessionId) {
          await AsyncStorage.removeItem(CHAT_SESSION_KEY);
        }

        try {
          const { apiClient } = await import("@/lib/api-client");
          console.log("[Chat] Creating session via apiClient");

          const data = await apiClient.post<{ id: string }>(
            "/api/chat/sessions",
            { title: "Chat with ZEKE" },
          );
          console.log("[Chat] Session created successfully:", data.id);

          if (!data.id) {
            throw new Error("Invalid session response");
          }

          await AsyncStorage.setItem(CHAT_SESSION_KEY, data.id);
          setSessionId(data.id);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error("[Chat] API error:", errorMessage);
          throw new Error(
            "Failed to create chat session. Check your connection.",
          );
        }
      }
    } catch (error) {
      console.error("Failed to initialize chat session:", error);
      setInitError(
        "Unable to connect to chat. Please check your connection and try again.",
      );
    } finally {
      setIsInitializing(false);
    }
  };

  const { data: messagesData, isLoading: isLoadingMessages } = useQuery<
    ApiChatMessage[]
  >({
    queryKey: isZekeSyncMode()
      ? ["/api/conversations", sessionId, "messages"]
      : ["/api/chat/sessions", sessionId, "messages"],
    queryFn: async () => {
      if (!isValidId(sessionId)) return [];

      if (isZekeSyncMode()) {
        const messages = await getConversationMessages(sessionId!);
        return messages.map((m) => ({
          id: m.id,
          sessionId: m.conversationId,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        }));
      } else {
        const { apiClient } = await import("@/lib/api-client");
        return await apiClient.get<ApiChatMessage[]>(
          `/api/chat/sessions/${sessionId}/messages`,
        );
      }
    },
    enabled: isValidId(sessionId),
  });

  // Map chat messages to unified format
  const apiMessages: UnifiedMessage[] = useMemo(() => {
    return (messagesData ?? []).map((msg) => ({
      ...mapApiMessageToMessage(msg),
      channel: "chat" as const,
      rawTimestamp: msg.createdAt,
    }));
  }, [messagesData]);
  
  const streamingMessage: Message | null = streamingContent
    ? {
        id: "streaming",
        content: streamingContent,
        role: "assistant",
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      }
    : null;

  const messages: UnifiedMessage[] = useMemo(
    () => [
      ...apiMessages,
      ...optimisticMessages,
      ...(streamingMessage ? [streamingMessage] : []),
    ],
    [apiMessages, optimisticMessages, streamingMessage],
  );

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const scrollToBottom = () => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const handleSend = async () => {
    if (!inputText.trim() || !isValidId(sessionId)) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const messageContent = inputText.trim();
    const tempId = `temp-${Date.now()}`;
    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const optimisticUserMessage: Message = {
      id: tempId,
      content: messageContent,
      role: "user",
      timestamp,
    };

    setInputText("");
    setOptimisticMessages((prev) => [...prev, optimisticUserMessage]);
    setIsTyping(true);

    try {
      if (isZekeSyncMode()) {
        await sendZekeMessage(sessionId!, messageContent);
        setOptimisticMessages([]);
        await queryClient.invalidateQueries({
          queryKey: ["/api/conversations", sessionId, "messages"],
        });
        setIsTyping(false);
      } else {
        // Use streaming for local mode
        const streamRequest = await sendStreamingMessage(sessionId!, messageContent, {
          onChunk: (chunk) => {
            setStreamingContent((prev) => prev + chunk);
            setIsTyping(false);
          },
          onComplete: async () => {
            setStreamingContent("");
            setOptimisticMessages([]);
            await queryClient.invalidateQueries({
              queryKey: ["/api/chat/sessions", sessionId, "messages"],
            });
          },
          onError: async (error) => {
            console.error("[Chat] Streaming error, falling back:", error);
            setStreamingContent("");
            setIsTyping(true);
            
            // Fallback to non-streaming endpoint
            try {
              const { apiClient } = await import("@/lib/api-client");
              await apiClient.post(`/api/chat/sessions/${sessionId!}/messages`, {
                content: messageContent,
              });
              setOptimisticMessages([]);
              await queryClient.invalidateQueries({
                queryKey: ["/api/chat/sessions", sessionId, "messages"],
              });
            } catch {
              setOptimisticMessages((prev) => prev.filter((m) => m.id !== tempId));
              Alert.alert("Error", "Failed to send message. Please try again.");
            } finally {
              setIsTyping(false);
            }
          },
          onUserMessage: () => {
            setOptimisticMessages([]);
          },
        });
        streamAbortRef.current = streamRequest;
      }
    } catch {
      setIsTyping(false);
      setStreamingContent("");
      setOptimisticMessages((prev) => prev.filter((m) => m.id !== tempId));
      Alert.alert("Error", "Failed to send message. Please try again.");
    }
  };

  const renderMessage = ({ item }: { item: UnifiedMessage }) => (
    <ChatBubble message={item} />
  );

  const renderFooter = () => {
    if (!isTyping) return null;
    return <TypingIndicator />;
  };

  const renderEmpty = () => {
    if (isInitializing || isLoadingMessages) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator color={Colors.dark.primary} />
          <ThemedText type="body" secondary style={{ marginTop: Spacing.md }}>
            Loading conversation...
          </ThemedText>
        </View>
      );
    }
    if (initError) {
      return (
        <View style={styles.emptyContainer}>
          <Feather
            name="wifi-off"
            size={48}
            color={Colors.dark.textSecondary}
          />
          <ThemedText
            type="h3"
            style={{ marginBottom: Spacing.sm, marginTop: Spacing.lg }}
          >
            Connection Issue
          </ThemedText>
          <ThemedText
            type="body"
            secondary
            style={{ textAlign: "center", marginBottom: Spacing.lg }}
          >
            {initError}
          </ThemedText>
          <Pressable
            onPress={() => {
              setInitError(null);
              setIsInitializing(true);
              initializeSession();
            }}
            style={({ pressed }) => [
              styles.retryButton,
              pressed && { opacity: 0.7 },
            ]}
          >
            <ThemedText type="body" style={{ color: Colors.dark.primary }}>
              Retry
            </ThemedText>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <ThemedText type="h3" style={{ marginBottom: Spacing.sm }}>
          Welcome to ZEKE
        </ThemedText>
        <ThemedText type="body" secondary style={{ textAlign: "center" }}>
          Ask me about your schedule, tasks, or anything I can help with.
        </ThemedText>
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
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
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
          Platform.OS !== "web" ? animatedInputContainerStyle : undefined,
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
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask ZEKE anything..."
            placeholderTextColor={theme.textSecondary}
            multiline
            maxLength={1000}
            returnKeyType="default"
            blurOnSubmit={false}
            editable={!isInitializing && !!sessionId}
          />
          <View style={styles.inputButtons}>
            <VoiceInputButton
              onRecordingComplete={(audioUri, durationSeconds) => {
                console.log(
                  "Voice recording captured:",
                  audioUri,
                  `(${durationSeconds}s)`,
                );
                setInputText(
                  `Voice message (${durationSeconds}s) - tap send to transcribe`,
                );
              }}
              disabled={isTyping || isInitializing}
            />
            <Pressable
              onPress={handleSend}
              disabled={!inputText.trim() || isTyping || !sessionId}
              style={({ pressed }) => ({
                opacity: pressed || !inputText.trim() || isTyping ? 0.6 : 1,
              })}
            >
              <LinearGradient
                colors={
                  inputText.trim() && !isTyping
                    ? Gradients.primary
                    : [theme.textSecondary, theme.textSecondary]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.sendButton}
              >
                {isTyping ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Feather name="send" size={18} color="#FFFFFF" />
                )}
              </LinearGradient>
            </Pressable>
          </View>
        </View>
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
  inputContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderRadius: BorderRadius.lg,
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.sm,
    paddingVertical: Spacing.sm,
    minHeight: 48,
  },
  input: {
    flex: 1,
    fontSize: 16,
    maxHeight: 100,
    paddingVertical: Platform.OS === "ios" ? Spacing.sm : 0,
  },
  inputButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  retryButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
});
