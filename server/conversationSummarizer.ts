import OpenAI from "openai";
import { 
  getConversation, 
  getMessagesByConversation, 
  updateConversationSummary,
  getConversationsNeedingSummary 
} from "./db";
import type { Message, Conversation } from "@shared/schema";

const MESSAGE_THRESHOLD = 30;
const SUMMARIZE_BATCH_SIZE = 50;

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for conversation summarization");
  }
  return new OpenAI({ apiKey });
}

export async function summarizeConversation(conversationId: string): Promise<string | null> {
  const conversation = getConversation(conversationId);
  if (!conversation) {
    console.error(`[Summarizer] Conversation ${conversationId} not found`);
    return null;
  }

  const allMessages = getMessagesByConversation(conversationId);
  if (allMessages.length === 0) {
    return null;
  }

  const summarizedCount = conversation.summarizedMessageCount || 0;
  const unsummarizedMessages = allMessages.slice(summarizedCount);
  
  if (unsummarizedMessages.length < MESSAGE_THRESHOLD) {
    return conversation.summary || null;
  }

  const messagesToSummarize = unsummarizedMessages.slice(0, SUMMARIZE_BATCH_SIZE);
  const existingSummary = conversation.summary;

  try {
    const client = getOpenAIClient();
    
    const messageContent = messagesToSummarize.map(m => 
      `${m.role.toUpperCase()}: ${m.content}`
    ).join("\n\n");

    const systemPrompt = `You are a conversation summarizer for a personal AI assistant named ZEKE.
Your job is to create concise, informative summaries of conversations that capture:
1. Key topics discussed
2. Important facts or preferences learned
3. Tasks or actions mentioned
4. Any commitments or follow-ups needed

${existingSummary ? `
Previous summary of earlier messages:
${existingSummary}

Now incorporate the new messages below into an updated, cohesive summary.
` : "Create a summary of the following conversation messages."}

Guidelines:
- Use bullet points for clarity
- Focus on actionable and memorable information
- Keep the summary under 500 words
- Preserve important details like names, dates, and specific requests
- Note any changes or corrections to previous information`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Messages to summarize:\n\n${messageContent}` },
      ],
      temperature: 0.3,
      max_tokens: 800,
    });

    const summary = response.choices[0]?.message?.content;
    if (!summary) {
      console.error("[Summarizer] No summary generated");
      return existingSummary;
    }

    const newSummarizedCount = summarizedCount + messagesToSummarize.length;
    updateConversationSummary(conversationId, summary, newSummarizedCount);
    
    console.log(`[Summarizer] Summarized ${messagesToSummarize.length} messages for conversation ${conversationId}`);
    return summary;

  } catch (error) {
    console.error("[Summarizer] Error summarizing conversation:", error);
    return existingSummary;
  }
}

export async function summarizeAllPendingConversations(): Promise<number> {
  const conversationsNeedingSummary = await getConversationsNeedingSummary(MESSAGE_THRESHOLD);
  
  if (conversationsNeedingSummary.length === 0) {
    return 0;
  }

  console.log(`[Summarizer] Found ${conversationsNeedingSummary.length} conversations needing summarization`);
  
  let summarizedCount = 0;
  for (const conv of conversationsNeedingSummary) {
    try {
      const result = await summarizeConversation(conv.conversationId);
      if (result) {
        summarizedCount++;
      }
    } catch (error) {
      console.error(`[Summarizer] Failed to summarize conversation ${conv.conversationId}:`, error);
    }
  }

  return summarizedCount;
}

export function getConversationContext(conversationId: string, recentMessageCount: number = 10): {
  summary: string | null;
  recentMessages: Message[];
  totalMessages: number;
  summarizedCount: number;
} {
  const conversation = getConversation(conversationId);
  const allMessages = getMessagesByConversation(conversationId);
  
  const recentMessages = allMessages.slice(-recentMessageCount);
  const summarizedCount = conversation?.summarizedMessageCount || 0;
  
  return {
    summary: conversation?.summary || null,
    recentMessages,
    totalMessages: allMessages.length,
    summarizedCount,
  };
}

export function formatConversationContextForPrompt(conversationId: string, recentMessageCount: number = 10): string {
  const { summary, recentMessages, totalMessages } = getConversationContext(conversationId, recentMessageCount);
  
  if (totalMessages === 0) {
    return "";
  }

  let context = "";
  
  if (summary && totalMessages > recentMessageCount) {
    context += `## Conversation Summary (${totalMessages - recentMessages.length} earlier messages)\n`;
    context += summary + "\n\n";
  }

  if (recentMessages.length > 0) {
    context += `## Recent Messages (${recentMessages.length})\n`;
    context += recentMessages.map(m => 
      `${m.role === "user" ? "User" : "ZEKE"}: ${m.content.substring(0, 500)}${m.content.length > 500 ? "..." : ""}`
    ).join("\n\n");
  }

  return context;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
