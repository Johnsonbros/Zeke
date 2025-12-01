import * as cron from "node-cron";
import { summarizeAllPendingConversations } from "../conversationSummarizer";

let scheduledTask: cron.ScheduledTask | null = null;

export function initializeConversationSummarizer(): void {
  scheduledTask = cron.schedule("0 * * * *", async () => {
    console.log("[ConversationSummarizer] Running hourly summarization job...");
    try {
      const count = await summarizeAllPendingConversations();
      if (count > 0) {
        console.log(`[ConversationSummarizer] Summarized ${count} conversation(s)`);
      }
    } catch (error) {
      console.error("[ConversationSummarizer] Error in hourly job:", error);
    }
  });
  
  console.log("[ConversationSummarizer] Hourly summarization job initialized");
}

export function stopConversationSummarizer(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log("[ConversationSummarizer] Summarization job stopped");
  }
}
