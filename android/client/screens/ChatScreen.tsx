import React, { useState, useRef, useEffect } from "react";
import { View, StyleSheet, FlatList, TextInput, Pressable, Platform, KeyboardAvoidingView, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useQuery, useMutation } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ThemedText } from "@/components/ThemedText";
import { ChatBubble, Message, TypingIndicator } from "@/components/ChatBubble";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, Colors, BorderRadius, Gradients } from "@/constants/theme";
import { queryClient, apiRequest, getApiUrl, isZekeSyncMode } from "@/lib/query-client";
import { chatWithZeke, createConversation, getConversationMessages, sendMessage as sendZekeMessage } from "@/lib/zeke-api-adapter";

const CHAT_SESSION_KEY = "zeke_chat_session_id";
const ZEKE_CONVERSATION_KEY = "zeke_conversation_id";

interface ApiChatSession {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ApiChatMessage {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  createdAt: string;
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
  const { theme } = useTheme();
  const flatListRef = useRef<FlatList>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);

  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();

  const animatedInputContainerStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: keyboardHeight.value }],
    };
  });

  useEffect(() => {
    initializeSession();
  }, []);

  const initializeSession = async () => {
    try {
      if (isZekeSyncMode()) {
        const storedConversationId = await AsyncStorage.getItem(ZEKE_CONVERSATION_KEY);
        
        if (storedConversationId) {
          try {
            const messages = await getConversationMessages(storedConversationId);
            if (messages) {
              setSessionId(storedConversationId);
              setIsInitializing(false);
              return;
            }
          } catch {
            // Conversation doesn't exist, create new one
          }
        }
        
        const newConversation = await createConversation('Chat with ZEKE');
        await AsyncStorage.setItem(ZEKE_CONVERSATION_KEY, newConversation.id);
        setSessionId(newConversation.id);
      } else {
        const storedSessionId = await AsyncStorage.getItem(CHAT_SESSION_KEY);
        
        if (storedSessionId) {
          const url = new URL(`/api/chat/sessions/${storedSessionId}/messages`, getApiUrl());
          const res = await fetch(url.toString(), { credentials: 'include' });
          if (res.ok) {
            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              setSessionId(storedSessionId);
              setIsInitializing(false);
              return;
            }
          }
        }
        
        const createRes = await apiRequest('POST', '/api/chat/sessions', { title: 'Chat with ZEKE' });
        const contentType = createRes.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          throw new Error('Server returned non-JSON response');
        }
        const newSession: ApiChatSession = await createRes.json();
        await AsyncStorage.setItem(CHAT_SESSION_KEY, newSession.id);
        setSessionId(newSession.id);
      }
    } catch (error) {
      console.error('Failed to initialize chat session:', error);
      setInitError('Unable to connect to chat. Please check your connection and try again.');
    } finally {
      setIsInitializing(false);
    }
  };

  const { data: messagesData, isLoading: isLoadingMessages, isFetching } = useQuery<ApiChatMessage[]>({
    queryKey: isZekeSyncMode() ? ['/api/conversations', sessionId, 'messages'] : ['/api/chat/sessions', sessionId, 'messages'],
    queryFn: async () => {
      if (!sessionId) return [];
      
      if (isZekeSyncMode()) {
        const messages = await getConversationMessages(sessionId);
        return messages.map(m => ({
          id: m.id,
          sessionId: m.conversationId,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        }));
      } else {
        const url = new URL(`/api/chat/sessions/${sessionId}/messages`, getApiUrl());
        const res = await fetch(url.toString(), { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch messages');
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          throw new Error('Server returned non-JSON response');
        }
        return res.json();
      }
    },
    enabled: !!sessionId,
  });

  const apiMessages: Message[] = (messagesData ?? []).map(mapApiMessageToMessage);
  const messages: Message[] = [...apiMessages, ...optimisticMessages];

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const scrollToBottom = () => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const handleSend = async () => {
    if (!inputText.trim() || !sessionId) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const messageContent = inputText.trim();
    const tempId = `temp-${Date.now()}`;
    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    
    const optimisticUserMessage: Message = {
      id: tempId,
      content: messageContent,
      role: 'user',
      timestamp,
    };
    
    setInputText("");
    setOptimisticMessages(prev => [...prev, optimisticUserMessage]);
    setIsTyping(true);
    
    try {
      if (isZekeSyncMode()) {
        await sendZekeMessage(sessionId, messageContent);
        setOptimisticMessages([]);
        await queryClient.invalidateQueries({ queryKey: ['/api/conversations', sessionId, 'messages'] });
      } else {
        const res = await apiRequest('POST', `/api/chat/sessions/${sessionId}/messages`, { content: messageContent });
        await res.json();
        setOptimisticMessages([]);
        await queryClient.invalidateQueries({ queryKey: ['/api/chat/sessions', sessionId, 'messages'] });
      }
    } catch (error) {
      setIsTyping(false);
      setOptimisticMessages(prev => prev.filter(m => m.id !== tempId));
      Alert.alert('Error', 'Failed to send message. Please try again.');
    } finally {
      setIsTyping(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => (
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
          <Feather name="wifi-off" size={48} color={Colors.dark.textSecondary} />
          <ThemedText type="h3" style={{ marginBottom: Spacing.sm, marginTop: Spacing.lg }}>Connection Issue</ThemedText>
          <ThemedText type="body" secondary style={{ textAlign: "center", marginBottom: Spacing.lg }}>
            {initError}
          </ThemedText>
          <Pressable
            onPress={() => {
              setInitError(null);
              setIsInitializing(true);
              initializeSession();
            }}
            style={({ pressed }) => [styles.retryButton, pressed && { opacity: 0.7 }]}
          >
            <ThemedText type="body" style={{ color: Colors.dark.primary }}>Retry</ThemedText>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <ThemedText type="h3" style={{ marginBottom: Spacing.sm }}>Welcome to ZEKE</ThemedText>
        <ThemedText type="body" secondary style={{ textAlign: "center" }}>
          Ask me about your memories, meetings, or anything from your recordings.
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
          paddingBottom: Spacing.lg + 80,
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
            paddingBottom: insets.bottom > 0 ? insets.bottom : Spacing.lg,
          },
          Platform.OS !== "web" ? animatedInputContainerStyle : undefined,
        ]}
      >
        <View style={[styles.inputWrapper, { backgroundColor: theme.backgroundSecondary }]}>
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
                console.log("Voice recording captured:", audioUri, `(${durationSeconds}s)`);
                setInputText(`Voice message (${durationSeconds}s) - tap send to transcribe`);
              }}
              disabled={isTyping || isInitializing}
            />
            <Pressable
              onPress={handleSend}
              disabled={!inputText.trim() || isTyping || !sessionId}
              style={({ pressed }) => ({ opacity: pressed || !inputText.trim() || isTyping ? 0.6 : 1 })}
            >
              <LinearGradient
                colors={inputText.trim() && !isTyping ? Gradients.primary : [theme.textSecondary, theme.textSecondary]}
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
