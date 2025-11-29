import type OpenAI from "openai";
import type { ToolPermissions } from "../tools";
import { 
  createReminder as dbCreateReminder,
  getReminder,
  getPendingReminders,
  updateReminderCompleted,
  deleteReminder as dbDeleteReminder,
  getConversation,
  getContactByPhone
} from "../db";
import { isMasterAdmin } from "@shared/schema";

const activeTimeouts: Map<string, NodeJS.Timeout> = new Map();

let sendSmsCallbackRef: ((phone: string, message: string, source?: string) => Promise<void>) | null = null;
let notifyUserCallbackRef: ((conversationId: string, message: string) => Promise<void>) | null = null;

export function setReminderSendSmsCallback(callback: (phone: string, message: string, source?: string) => Promise<void>) {
  sendSmsCallbackRef = callback;
}

export function setReminderNotifyUserCallback(callback: (conversationId: string, message: string) => Promise<void>) {
  notifyUserCallbackRef = callback;
}

export const reminderToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "set_reminder",
      description: "Set a reminder to send a message at a specific time. Can remind the user via the current conversation or send an SMS to another phone number.",
      parameters: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "The reminder message to send",
          },
          delay_minutes: {
            type: "number",
            description: "Number of minutes from now to send the reminder. Use this OR scheduled_time, not both.",
          },
          scheduled_time: {
            type: "string",
            description: "ISO 8601 timestamp for when to send the reminder (e.g., '2024-01-15T14:30:00'). Use this OR delay_minutes, not both.",
          },
          recipient_phone: {
            type: "string",
            description: "Optional phone number to send SMS to. If not provided, reminder goes to the current conversation.",
          },
        },
        required: ["message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_reminders",
      description: "List all pending reminders",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_reminder",
      description: "Cancel a pending reminder by its ID",
      parameters: {
        type: "object",
        properties: {
          reminder_id: {
            type: "string",
            description: "The ID of the reminder to cancel",
          },
        },
        required: ["reminder_id"],
      },
    },
  },
];

export const reminderToolPermissions: Record<string, (permissions: ToolPermissions) => boolean> = {
  set_reminder: (p) => p.canSetReminders,
  list_reminders: (p) => p.canSetReminders,
  cancel_reminder: (p) => p.canSetReminders,
};

async function executeReminder(reminderId: string) {
  const reminder = getReminder(reminderId);
  if (!reminder) {
    console.log(`Reminder ${reminderId} not found in database, may have been cancelled`);
    activeTimeouts.delete(reminderId);
    return;
  }
  
  if (reminder.completed) {
    console.log(`Reminder ${reminderId} already completed, skipping`);
    activeTimeouts.delete(reminderId);
    return;
  }
  
  console.log(`Executing reminder: ${reminder.id} - "${reminder.message}"`);
  
  try {
    if (reminder.recipientPhone && sendSmsCallbackRef) {
      let isAuthorized = false;
      let creatorInfo = "unknown";
      
      if (reminder.conversationId) {
        const conversation = getConversation(reminder.conversationId);
        if (conversation) {
          if (conversation.source === "web") {
            isAuthorized = true;
            creatorInfo = "web interface (admin)";
          } else if (conversation.phoneNumber) {
            if (isMasterAdmin(conversation.phoneNumber)) {
              isAuthorized = true;
              creatorInfo = `master admin (${conversation.phoneNumber})`;
            } else {
              const contact = getContactByPhone(conversation.phoneNumber);
              if (contact && (contact.accessLevel === 'admin' || contact.canSetReminders)) {
                isAuthorized = true;
                creatorInfo = `${contact.name} (${contact.accessLevel})`;
              } else {
                creatorInfo = conversation.phoneNumber;
              }
            }
          }
        }
      } else {
        isAuthorized = true;
        creatorInfo = "system (no conversation context)";
      }
      
      if (!isAuthorized) {
        console.log(`ACCESS DENIED: Reminder ${reminderId} SMS blocked - created by unauthorized user: ${creatorInfo}`);
        updateReminderCompleted(reminderId, true);
        activeTimeouts.delete(reminderId);
        return;
      }
      
      console.log(`Authorization verified for reminder SMS - creator: ${creatorInfo}`);
      await sendSmsCallbackRef(reminder.recipientPhone, reminder.message);
      console.log(`Reminder SMS sent to ${reminder.recipientPhone}`);
    } else if (reminder.conversationId && notifyUserCallbackRef) {
      await notifyUserCallbackRef(reminder.conversationId, `Reminder: ${reminder.message}`);
      console.log(`Reminder notification sent to conversation ${reminder.conversationId}`);
    } else {
      console.log(`Reminder fired but no delivery method: ${reminder.message}`);
    }
    
    updateReminderCompleted(reminderId, true);
    activeTimeouts.delete(reminderId);
  } catch (error) {
    console.error("Failed to execute reminder:", error);
  }
}

interface SetReminderArgs {
  message: string;
  delay_minutes?: number;
  scheduled_time?: string;
  recipient_phone?: string;
}

interface CancelReminderArgs {
  reminder_id: string;
}

interface ExecuteOptions {
  conversationId?: string;
}

export async function executeReminderTool(
  toolName: string,
  args: Record<string, unknown>,
  options: ExecuteOptions
): Promise<string | null> {
  const { conversationId } = options;

  switch (toolName) {
    case "set_reminder": {
      const { message, delay_minutes, scheduled_time, recipient_phone } = args as SetReminderArgs;
      
      let scheduledFor: Date;
      
      if (delay_minutes) {
        scheduledFor = new Date(Date.now() + delay_minutes * 60 * 1000);
      } else if (scheduled_time) {
        scheduledFor = new Date(scheduled_time);
      } else {
        scheduledFor = new Date(Date.now() + 5 * 60 * 1000);
      }
      
      const reminder = dbCreateReminder({
        message,
        recipientPhone: recipient_phone || null,
        conversationId: conversationId || null,
        scheduledFor: scheduledFor.toISOString(),
        completed: false,
      });
      
      const delay = scheduledFor.getTime() - Date.now();
      if (delay > 0) {
        const timeoutId = setTimeout(() => executeReminder(reminder.id), delay);
        activeTimeouts.set(reminder.id, timeoutId);
      }
      
      const timeStr = scheduledFor.toLocaleString("en-US", { 
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        month: "short",
        day: "numeric"
      });
      
      const target = recipient_phone ? `to ${recipient_phone}` : "in this conversation";
      return JSON.stringify({
        success: true,
        reminder_id: reminder.id,
        message: `Reminder set for ${timeStr} ${target}: "${message}"`,
        scheduled_for: scheduledFor.toISOString(),
      });
    }
    
    case "list_reminders": {
      const dbReminders = getPendingReminders();
      const pendingReminders = dbReminders.map(r => ({
        id: r.id,
        message: r.message,
        scheduled_for: new Date(r.scheduledFor).toLocaleString("en-US", { timeZone: "America/New_York" }),
        recipient: r.recipientPhone || "this conversation",
      }));
      
      if (pendingReminders.length === 0) {
        return JSON.stringify({ reminders: [], message: "No pending reminders" });
      }
      
      return JSON.stringify({ reminders: pendingReminders });
    }
    
    case "cancel_reminder": {
      const { reminder_id } = args as CancelReminderArgs;
      const reminder = getReminder(reminder_id);
      
      if (!reminder) {
        return JSON.stringify({ success: false, error: "Reminder not found" });
      }
      
      const timeoutId = activeTimeouts.get(reminder_id);
      if (timeoutId) {
        clearTimeout(timeoutId);
        activeTimeouts.delete(reminder_id);
      }
      dbDeleteReminder(reminder_id);
      
      return JSON.stringify({ success: true, message: `Reminder ${reminder_id} cancelled` });
    }
    
    default:
      return null;
  }
}

export function getActiveReminders(): { id: string; message: string; scheduledFor: Date }[] {
  const pendingReminders = getPendingReminders();
  return pendingReminders.map(r => ({
    id: r.id,
    message: r.message,
    scheduledFor: new Date(r.scheduledFor),
  }));
}

export function restorePendingReminders(): number {
  const pendingReminders = getPendingReminders();
  let restoredCount = 0;
  
  for (const reminder of pendingReminders) {
    const scheduledTime = new Date(reminder.scheduledFor).getTime();
    const now = Date.now();
    const delay = scheduledTime - now;
    
    if (delay > 0) {
      const timeoutId = setTimeout(() => executeReminder(reminder.id), delay);
      activeTimeouts.set(reminder.id, timeoutId);
      restoredCount++;
      console.log(`Restored reminder ${reminder.id}: "${reminder.message}" scheduled for ${new Date(reminder.scheduledFor).toLocaleString("en-US", { timeZone: "America/New_York" })}`);
    } else {
      console.log(`Reminder ${reminder.id} is past due (scheduled for ${reminder.scheduledFor}), executing immediately`);
      executeReminder(reminder.id);
      restoredCount++;
    }
  }
  
  console.log(`Restored ${restoredCount} pending reminder(s) from database`);
  return restoredCount;
}

export const reminderToolNames = [
  "set_reminder",
  "list_reminders",
  "cancel_reminder",
];
