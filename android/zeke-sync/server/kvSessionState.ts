/**
 * Session State Persistence using Replit Key-Value Store
 * 
 * Persists active conversation states, voice pipeline states, and automation
 * states across server restarts. This ensures ZEKE can resume context
 * seamlessly after restarts.
 */

import { kvStore } from "./kvStore";
import { log } from "./logger";

const SESSION_NAMESPACE = "session";
const STATE_NAMESPACE = "state";

const TTL = {
  CONVERSATION_STATE: 24 * 60 * 60 * 1000,  // 24 hours
  VOICE_STATE: 60 * 60 * 1000,              // 1 hour
  AUTOMATION_STATE: 7 * 24 * 60 * 60 * 1000, // 7 days
  ACTIVE_CONTEXT: 30 * 60 * 1000,           // 30 minutes
};

export interface ConversationState {
  conversationId: string;
  lastMessageAt: number;
  messageCount: number;
  activeTopics: string[];
  pendingActions: string[];
  source: "web" | "sms" | "voice";
}

export interface VoicePipelineState {
  isActive: boolean;
  lastUtteranceAt: number | null;
  commandsProcessed: number;
  currentSessionStart: number | null;
  pendingText: string;
}

export interface AutomationState {
  automationId: string;
  lastTriggeredAt: number | null;
  triggerCount: number;
  isEnabled: boolean;
  lastResult: string | null;
}

export interface ActiveContext {
  userId: string;
  currentRoute: string;
  lastActivityAt: number;
  recentQueries: string[];
  focusedDomains: string[];
}

export async function saveConversationState(state: ConversationState): Promise<boolean> {
  const key = `conv:${state.conversationId}`;
  const success = await kvStore.set(SESSION_NAMESPACE, key, state, TTL.CONVERSATION_STATE);
  if (success) {
    log(`[SessionState] Saved conversation state: ${state.conversationId}`, "cache");
  }
  return success;
}

export async function getConversationState(conversationId: string): Promise<ConversationState | null> {
  const key = `conv:${conversationId}`;
  return await kvStore.get<ConversationState>(SESSION_NAMESPACE, key);
}

export async function updateConversationActivity(
  conversationId: string, 
  updates: Partial<ConversationState>
): Promise<boolean> {
  const existing = await getConversationState(conversationId);
  if (!existing) return false;
  
  const updated: ConversationState = {
    ...existing,
    ...updates,
    lastMessageAt: Date.now(),
  };
  
  return saveConversationState(updated);
}

export async function getActiveConversations(): Promise<ConversationState[]> {
  const keys = await kvStore.list(SESSION_NAMESPACE, "conv:");
  const states: ConversationState[] = [];
  
  for (const key of keys) {
    const state = await kvStore.get<ConversationState>(SESSION_NAMESPACE, key);
    if (state) {
      states.push(state);
    }
  }
  
  return states.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
}

export async function saveVoicePipelineState(state: VoicePipelineState): Promise<boolean> {
  return await kvStore.set(STATE_NAMESPACE, "voice_pipeline", state, TTL.VOICE_STATE);
}

export async function getVoicePipelineState(): Promise<VoicePipelineState | null> {
  return await kvStore.get<VoicePipelineState>(STATE_NAMESPACE, "voice_pipeline");
}

export async function saveAutomationState(state: AutomationState): Promise<boolean> {
  const key = `auto:${state.automationId}`;
  return await kvStore.set(STATE_NAMESPACE, key, state, TTL.AUTOMATION_STATE);
}

export async function getAutomationState(automationId: string): Promise<AutomationState | null> {
  const key = `auto:${automationId}`;
  return await kvStore.get<AutomationState>(STATE_NAMESPACE, key);
}

export async function incrementAutomationTrigger(automationId: string): Promise<number> {
  const existing = await getAutomationState(automationId);
  const newCount = (existing?.triggerCount || 0) + 1;
  
  await saveAutomationState({
    automationId,
    lastTriggeredAt: Date.now(),
    triggerCount: newCount,
    isEnabled: existing?.isEnabled ?? true,
    lastResult: existing?.lastResult ?? null,
  });
  
  return newCount;
}

export async function saveActiveContext(context: ActiveContext): Promise<boolean> {
  const key = `ctx:${context.userId}`;
  return await kvStore.set(SESSION_NAMESPACE, key, context, TTL.ACTIVE_CONTEXT);
}

export async function getActiveContext(userId: string): Promise<ActiveContext | null> {
  const key = `ctx:${userId}`;
  return await kvStore.get<ActiveContext>(SESSION_NAMESPACE, key);
}

export async function clearAllSessionState(): Promise<void> {
  await kvStore.clearNamespace(SESSION_NAMESPACE);
  await kvStore.clearNamespace(STATE_NAMESPACE);
  log("[SessionState] Cleared all session state", "cache");
}

export const sessionState = {
  saveConversation: saveConversationState,
  getConversation: getConversationState,
  updateConversationActivity,
  getActiveConversations,
  saveVoicePipeline: saveVoicePipelineState,
  getVoicePipeline: getVoicePipelineState,
  saveAutomation: saveAutomationState,
  getAutomation: getAutomationState,
  incrementAutomationTrigger,
  saveActiveContext,
  getActiveContext,
  clearAll: clearAllSessionState,
};

export default sessionState;
