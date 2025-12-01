import type OpenAI from "openai";
import type { ToolPermissions } from "../tools";
import type { Reminder } from "@shared/schema";
import { 
  createReminder as dbCreateReminder,
  getReminder,
  getPendingReminders,
  updateReminderCompleted,
  deleteReminder as dbDeleteReminder,
  getConversation,
  getContactByPhone,
  getReminderSequence
} from "../db";
import { isMasterAdmin } from "@shared/schema";
import { createReminderSequenceData } from "./workflows";

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
  {
    type: "function",
    function: {
      name: "set_reminder_sequence",
      description: "Set a sequence of reminders for an event at multiple time intervals before it happens. Use this when someone wants to be reminded at multiple times before an event (e.g., '1 week before, 1 day before, and 1 hour before').",
      parameters: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "The event or reminder message (e.g., 'Mom's birthday party')",
          },
          event_time: {
            type: "string",
            description: "ISO 8601 timestamp for when the event occurs (e.g., '2024-01-15T14:30:00')",
          },
          intervals: {
            type: "array",
            items: { type: "string" },
            description: "Array of time intervals before the event to send reminders (e.g., ['1 week', '1 day', '1 hour', '30 minutes']). Supported units: minutes, hours, days, weeks.",
          },
          recipient_phone: {
            type: "string",
            description: "Optional phone number to send SMS reminders to. If not provided, reminders go to the current conversation.",
          },
        },
        required: ["message", "event_time", "intervals"],
      },
    },
  },
];

export const reminderToolPermissions: Record<string, (permissions: ToolPermissions) => boolean> = {
  set_reminder: (p) => p.canSetReminders,
  list_reminders: (p) => p.canSetReminders,
  cancel_reminder: (p) => p.canSetReminders,
  set_reminder_sequence: (p) => p.canSetReminders,
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

interface SetReminderSequenceArgs {
  message: string;
  event_time: string;
  intervals: string[];
  recipient_phone?: string;
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
    
    case "set_reminder_sequence": {
      const { message, event_time, intervals, recipient_phone } = args as SetReminderSequenceArgs;
      
      const eventTime = new Date(event_time);
      if (isNaN(eventTime.getTime())) {
        return JSON.stringify({ 
          success: false, 
          error: "Invalid event_time format. Use ISO 8601 format (e.g., '2024-12-25T14:00:00')" 
        });
      }

      const sequenceResult = createReminderSequenceData(eventTime, message, intervals);
      
      if (!sequenceResult.success) {
        return JSON.stringify({
          success: false,
          error: sequenceResult.error,
        });
      }

      const createdReminders: Reminder[] = [];
      const total = sequenceResult.items.length;
      let parentReminderId: string | null = null;

      for (const item of sequenceResult.items) {
        const reminder = dbCreateReminder({
          message: item.message,
          recipientPhone: recipient_phone || null,
          conversationId: conversationId || null,
          scheduledFor: item.scheduledFor.toISOString(),
          completed: false,
          parentReminderId: parentReminderId,
          sequencePosition: item.sequencePosition,
          sequenceTotal: total,
        });

        if (!parentReminderId) {
          parentReminderId = reminder.id;
        }

        const delay = item.scheduledFor.getTime() - Date.now();
        if (delay > 0) {
          const timeoutId = setTimeout(() => executeReminder(reminder.id), delay);
          activeTimeouts.set(reminder.id, timeoutId);
        }

        createdReminders.push(reminder);
      }

      const reminderSummary = createdReminders.map(r => ({
        id: r.id,
        message: r.message,
        scheduled_for: new Date(r.scheduledFor).toLocaleString("en-US", { 
          timeZone: "America/New_York",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          weekday: "short",
          month: "short",
          day: "numeric"
        }),
        sequence_position: r.sequencePosition,
      }));

      const eventTimeStr = eventTime.toLocaleString("en-US", { 
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        weekday: "short",
        month: "short",
        day: "numeric"
      });

      const target = recipient_phone ? `to ${recipient_phone}` : "in this conversation";
      
      return JSON.stringify({
        success: true,
        parent_reminder_id: parentReminderId,
        event_time: eventTime.toISOString(),
        event_time_formatted: eventTimeStr,
        reminders_created: createdReminders.length,
        reminders: reminderSummary,
        message: `Created ${createdReminders.length} reminder(s) for "${message}" ${target}. Event is at ${eventTimeStr}.`,
      });
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
  "set_reminder_sequence",
];

/**
 * Schedule a reminder created externally (e.g., from pendant context agent)
 * This properly sets up the timeout and SMS delivery
 */
export function scheduleReminderExecution(reminderId: string, scheduledFor: Date): void {
  const delay = scheduledFor.getTime() - Date.now();
  
  if (delay > 0) {
    const timeoutId = setTimeout(() => executeReminder(reminderId), delay);
    activeTimeouts.set(reminderId, timeoutId);
    console.log(`Scheduled reminder ${reminderId} for ${scheduledFor.toLocaleString("en-US", { timeZone: "America/New_York" })}`);
  } else {
    // Already past due, execute immediately
    console.log(`Reminder ${reminderId} is past due, executing immediately`);
    executeReminder(reminderId);
  }
}
