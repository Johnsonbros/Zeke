import * as cron from "node-cron";
import {
  getEnabledAutomations,
  getAutomation,
  updateAutomationRunTimestamps,
  getContactByPhone,
  getOverdueTasks,
  getTasksDueToday,
  getTasksDueTomorrow,
} from "./db";
import type { Automation, Contact } from "@shared/schema";
import { isMasterAdmin, MASTER_ADMIN_PHONE, getContactFullName } from "@shared/schema";
import { sendDailyCheckIn } from "./dailyCheckIn";
import { generateTaskFollowUp } from "./capabilities/workflows";
import { generateMorningWeatherReport, formatMorningWeatherReportForSms } from "./weather";

const scheduledTasks: Map<string, cron.ScheduledTask> = new Map();

let sendSmsCallback: ((phone: string, message: string) => Promise<void>) | null = null;
let getMorningBriefingCallback: (() => Promise<string>) | null = null;

export function setAutomationSmsCallback(
  callback: (phone: string, message: string) => Promise<void>
): void {
  sendSmsCallback = callback;
}

export function setMorningBriefingCallback(
  callback: () => Promise<string>
): void {
  getMorningBriefingCallback = callback;
}

function calculateNextRun(cronExpression: string): string | null {
  try {
    if (!cron.validate(cronExpression)) {
      return null;
    }
    
    const now = new Date();
    const parts = cronExpression.split(" ");
    
    if (parts.length < 5) return null;
    
    const minute = parts[0] === "*" ? now.getMinutes() : parseInt(parts[0], 10);
    const hour = parts[1] === "*" ? now.getHours() : parseInt(parts[1], 10);
    
    const nextRun = new Date(now);
    nextRun.setMinutes(minute);
    nextRun.setSeconds(0);
    nextRun.setMilliseconds(0);
    
    if (parts[1] !== "*") {
      nextRun.setHours(hour);
    }
    
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
    
    return nextRun.toISOString();
  } catch {
    return null;
  }
}

async function getMorningBriefing(): Promise<string> {
  if (getMorningBriefingCallback) {
    return getMorningBriefingCallback();
  }
  
  const { executeTool } = await import("./tools");
  const result = await executeTool("get_morning_briefing", {});
  const parsed = JSON.parse(result);
  
  if (parsed.success && parsed.briefing) {
    return parsed.briefing;
  }
  
  throw new Error(parsed.error || "Failed to generate morning briefing");
}

interface RecipientAuthorization {
  authorized: boolean;
  isMasterAdmin: boolean;
  contact: Contact | null;
  reason: string;
}

function normalizePhoneNumber(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^1/, "");
}

function verifyRecipientAuthorization(
  recipientPhone: string,
  automationType: string
): RecipientAuthorization {
  const normalizedPhone = normalizePhoneNumber(recipientPhone);
  const normalizedMasterAdmin = normalizePhoneNumber(MASTER_ADMIN_PHONE);
  
  if (normalizedPhone === normalizedMasterAdmin) {
    return {
      authorized: true,
      isMasterAdmin: true,
      contact: null,
      reason: "Master admin always authorized",
    };
  }
  
  const contact = getContactByPhone(recipientPhone) || getContactByPhone(normalizedPhone);
  
  if (!contact) {
    return {
      authorized: false,
      isMasterAdmin: false,
      contact: null,
      reason: `Phone number ${recipientPhone} not found in contacts`,
    };
  }
  
  switch (automationType) {
    case "morning_briefing":
      if (contact.canSetReminders && contact.canAccessPersonalInfo) {
        return {
          authorized: true,
          isMasterAdmin: false,
          contact,
          reason: "Contact has canSetReminders and canAccessPersonalInfo permissions",
        };
      }
      return {
        authorized: false,
        isMasterAdmin: false,
        contact,
        reason: `Contact ${getContactFullName(contact)} lacks required permissions (canSetReminders: ${contact.canSetReminders}, canAccessPersonalInfo: ${contact.canAccessPersonalInfo})`,
      };
    
    case "scheduled_sms":
      if (contact.canSetReminders) {
        return {
          authorized: true,
          isMasterAdmin: false,
          contact,
          reason: "Contact has canSetReminders permission",
        };
      }
      return {
        authorized: false,
        isMasterAdmin: false,
        contact,
        reason: `Contact ${getContactFullName(contact)} lacks canSetReminders permission`,
      };
    
    case "weather_report":
      if (contact.canSetReminders) {
        return {
          authorized: true,
          isMasterAdmin: false,
          contact,
          reason: "Contact authorized for weather reports",
        };
      }
      return {
        authorized: false,
        isMasterAdmin: false,
        contact,
        reason: `Contact ${getContactFullName(contact)} lacks canSetReminders permission`,
      };
    
    default:
      return {
        authorized: false,
        isMasterAdmin: false,
        contact,
        reason: `Unknown automation type: ${automationType}`,
      };
  }
}

export async function executeAutomation(automation: Automation): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  const timestamp = new Date().toISOString();
  console.log(`[AUDIT] [${timestamp}] Automation execution started: ${automation.name} (${automation.id}) - Type: ${automation.type}`);
  
  const startTime = Date.now();
  
  try {
    switch (automation.type) {
      case "morning_briefing": {
        if (!automation.recipientPhone) {
          console.log(`[AUDIT] [${timestamp}] Automation ${automation.id} failed: No recipient phone configured`);
          return {
            success: false,
            message: "No recipient phone number configured",
            error: "Missing recipientPhone",
          };
        }
        
        const authCheck = verifyRecipientAuthorization(automation.recipientPhone, automation.type);
        console.log(`[AUDIT] [${timestamp}] Permission check for ${automation.recipientPhone}: authorized=${authCheck.authorized}, reason="${authCheck.reason}"`);
        
        if (!authCheck.authorized) {
          console.log(`[AUDIT] [${timestamp}] ACCESS DENIED: Automation ${automation.id} blocked. Recipient ${automation.recipientPhone} not authorized for morning_briefing. Reason: ${authCheck.reason}`);
          return {
            success: false,
            message: `Access denied: ${authCheck.reason}`,
            error: "ACCESS_DENIED",
          };
        }
        
        if (!sendSmsCallback) {
          console.log(`[AUDIT] [${timestamp}] Automation ${automation.id} failed: SMS callback not configured`);
          return {
            success: false,
            message: "SMS callback not configured",
            error: "SMS not available",
          };
        }
        
        const briefing = await getMorningBriefing();
        await sendSmsCallback(automation.recipientPhone, briefing);
        
        console.log(`[AUDIT] [${timestamp}] Morning briefing sent successfully to ${automation.recipientPhone} (authorized: ${authCheck.isMasterAdmin ? "master_admin" : authCheck.contact ? getContactFullName(authCheck.contact) : "contact"})`);
        return {
          success: true,
          message: `Morning briefing sent to ${automation.recipientPhone}`,
        };
      }
      
      case "scheduled_sms": {
        if (!automation.recipientPhone) {
          console.log(`[AUDIT] [${timestamp}] Automation ${automation.id} failed: No recipient phone configured`);
          return {
            success: false,
            message: "No recipient phone number configured",
            error: "Missing recipientPhone",
          };
        }
        
        if (!automation.message) {
          console.log(`[AUDIT] [${timestamp}] Automation ${automation.id} failed: No message content configured`);
          return {
            success: false,
            message: "No message content configured",
            error: "Missing message",
          };
        }
        
        const authCheck = verifyRecipientAuthorization(automation.recipientPhone, automation.type);
        console.log(`[AUDIT] [${timestamp}] Permission check for ${automation.recipientPhone}: authorized=${authCheck.authorized}, reason="${authCheck.reason}"`);
        
        if (!authCheck.authorized) {
          console.log(`[AUDIT] [${timestamp}] ACCESS DENIED: Automation ${automation.id} blocked. Recipient ${automation.recipientPhone} not authorized for scheduled_sms. Reason: ${authCheck.reason}`);
          return {
            success: false,
            message: `Access denied: ${authCheck.reason}`,
            error: "ACCESS_DENIED",
          };
        }
        
        if (!sendSmsCallback) {
          console.log(`[AUDIT] [${timestamp}] Automation ${automation.id} failed: SMS callback not configured`);
          return {
            success: false,
            message: "SMS callback not configured",
            error: "SMS not available",
          };
        }
        
        await sendSmsCallback(automation.recipientPhone, automation.message);
        
        console.log(`[AUDIT] [${timestamp}] Scheduled SMS sent successfully to ${automation.recipientPhone} (authorized: ${authCheck.isMasterAdmin ? "master_admin" : authCheck.contact ? getContactFullName(authCheck.contact) : "contact"})`);
        return {
          success: true,
          message: `SMS sent to ${automation.recipientPhone}`,
        };
      }
      
      case "daily_checkin": {
        console.log(`[AUDIT] [${timestamp}] Executing daily check-in automation ${automation.id}`);
        const sent = await sendDailyCheckIn();
        
        if (sent) {
          console.log(`[AUDIT] [${timestamp}] Daily check-in sent successfully`);
          return {
            success: true,
            message: "Daily check-in sent successfully",
          };
        } else {
          console.log(`[AUDIT] [${timestamp}] Daily check-in failed to send`);
          return {
            success: false,
            message: "Daily check-in failed to send",
            error: "sendDailyCheckIn returned false",
          };
        }
      }
      
      case "task_followup": {
        console.log(`[AUDIT] [${timestamp}] Executing task follow-up automation ${automation.id}`);
        
        const recipientPhone = automation.recipientPhone || MASTER_ADMIN_PHONE;
        
        if (!sendSmsCallback) {
          console.log(`[AUDIT] [${timestamp}] Automation ${automation.id} failed: SMS callback not configured`);
          return {
            success: false,
            message: "SMS callback not configured",
            error: "SMS not available",
          };
        }
        
        const overdue = getOverdueTasks();
        const today = getTasksDueToday();
        const tomorrow = getTasksDueTomorrow();
        
        console.log(`[AUDIT] [${timestamp}] Task follow-up: ${overdue.length} overdue, ${today.length} today, ${tomorrow.length} tomorrow`);
        
        const followUp = await generateTaskFollowUp(overdue, today, tomorrow);
        
        await sendSmsCallback(recipientPhone, followUp.smsMessage);
        
        console.log(`[AUDIT] [${timestamp}] Task follow-up sent successfully to ${recipientPhone}`);
        return {
          success: true,
          message: `Task follow-up sent to ${recipientPhone} (${overdue.length} overdue, ${today.length} today, ${tomorrow.length} tomorrow)`,
        };
      }
      
      case "weather_report": {
        if (!automation.recipientPhone) {
          console.log(`[AUDIT] [${timestamp}] Automation ${automation.id} failed: No recipient phone configured`);
          return {
            success: false,
            message: "No recipient phone number configured",
            error: "Missing recipientPhone",
          };
        }
        
        const authCheck = verifyRecipientAuthorization(automation.recipientPhone, automation.type);
        console.log(`[AUDIT] [${timestamp}] Permission check for ${automation.recipientPhone}: authorized=${authCheck.authorized}, reason="${authCheck.reason}"`);
        
        if (!authCheck.authorized) {
          console.log(`[AUDIT] [${timestamp}] ACCESS DENIED: Automation ${automation.id} blocked. Recipient ${automation.recipientPhone} not authorized for weather_report. Reason: ${authCheck.reason}`);
          return {
            success: false,
            message: `Access denied: ${authCheck.reason}`,
            error: "ACCESS_DENIED",
          };
        }
        
        if (!sendSmsCallback) {
          console.log(`[AUDIT] [${timestamp}] Automation ${automation.id} failed: SMS callback not configured`);
          return {
            success: false,
            message: "SMS callback not configured",
            error: "SMS not available",
          };
        }
        
        try {
          const settings = automation.settings ? JSON.parse(automation.settings) : {};
          const city = settings.city || "Abington";
          const state = settings.state || "MA";
          const recipientName = authCheck.isMasterAdmin 
            ? "Nate" 
            : (authCheck.contact?.firstName || undefined);
          
          console.log(`[AUDIT] [${timestamp}] Generating weather report for ${city}, ${state} for ${recipientName || "recipient"}`);
          
          const report = await generateMorningWeatherReport(city, state, recipientName);
          const smsMessage = formatMorningWeatherReportForSms(report);
          
          await sendSmsCallback(automation.recipientPhone, smsMessage);
          
          console.log(`[AUDIT] [${timestamp}] Weather report sent successfully to ${automation.recipientPhone}`);
          return {
            success: true,
            message: `Weather report for ${city}, ${state} sent to ${automation.recipientPhone}`,
          };
        } catch (weatherError: any) {
          console.error(`[AUDIT] [${timestamp}] Weather report generation failed:`, weatherError);
          return {
            success: false,
            message: `Weather report failed: ${weatherError.message}`,
            error: weatherError.message,
          };
        }
      }
      
      default:
        console.log(`[AUDIT] [${timestamp}] Unknown automation type: ${automation.type}`);
        return {
          success: false,
          message: `Unknown automation type: ${automation.type}`,
          error: "Unknown type",
        };
    }
  } catch (error: any) {
    console.error(`[AUDIT] [${timestamp}] Automation ${automation.id} error:`, error);
    return {
      success: false,
      message: `Execution failed: ${error.message}`,
      error: error.message,
    };
  } finally {
    const duration = Date.now() - startTime;
    const now = new Date().toISOString();
    const nextRun = calculateNextRun(automation.cronExpression);
    
    updateAutomationRunTimestamps(automation.id, now, nextRun);
    console.log(`[AUDIT] [${now}] Automation ${automation.id} completed in ${duration}ms. Next run: ${nextRun || "unknown"}`);
  }
}

export function scheduleAutomation(automation: Automation): void {
  stopAutomation(automation.id);
  
  if (!automation.enabled) {
    console.log(`[Automations] Automation ${automation.name} (${automation.id}) is disabled, not scheduling`);
    return;
  }
  
  if (!cron.validate(automation.cronExpression)) {
    console.error(`[Automations] Invalid cron expression for ${automation.name}: ${automation.cronExpression}`);
    return;
  }
  
  const task = cron.schedule(
    automation.cronExpression,
    async () => {
      const currentAutomation = getAutomation(automation.id);
      if (!currentAutomation) {
        console.log(`[Automations] Automation ${automation.id} no longer exists, stopping schedule`);
        stopAutomation(automation.id);
        return;
      }
      
      if (!currentAutomation.enabled) {
        console.log(`[Automations] Automation ${currentAutomation.name} is now disabled, skipping execution`);
        return;
      }
      
      await executeAutomation(currentAutomation);
    },
    {
      timezone: "America/New_York",
    }
  );
  
  scheduledTasks.set(automation.id, task);
  
  const nextRun = calculateNextRun(automation.cronExpression);
  if (nextRun && !automation.nextRun) {
    updateAutomationRunTimestamps(automation.id, automation.lastRun || "", nextRun);
  }
  
  console.log(`[Automations] Scheduled: ${automation.name} (${automation.id}) - Cron: ${automation.cronExpression} - Next run: ${nextRun || "unknown"}`);
}

export function stopAutomation(automationId: string): void {
  const existingTask = scheduledTasks.get(automationId);
  if (existingTask) {
    existingTask.stop();
    scheduledTasks.delete(automationId);
    console.log(`[Automations] Stopped automation: ${automationId}`);
  }
}

export function initializeAutomations(): void {
  console.log("[Automations] Initializing automation scheduler...");
  
  const automations = getEnabledAutomations();
  console.log(`[Automations] Found ${automations.length} enabled automation(s)`);
  
  for (const automation of automations) {
    scheduleAutomation(automation);
  }
  
  console.log("[Automations] Initialization complete");
}

export async function runAutomationNow(automationId: string): Promise<{
  success: boolean;
  message: string;
  automation?: Automation;
  error?: string;
}> {
  const automation = getAutomation(automationId);
  
  if (!automation) {
    return {
      success: false,
      message: "Automation not found",
      error: "Not found",
    };
  }
  
  console.log(`[Automations] Manual trigger for: ${automation.name} (${automation.id})`);
  
  const result = await executeAutomation(automation);
  
  return {
    ...result,
    automation,
  };
}

export function getScheduledAutomationIds(): string[] {
  return Array.from(scheduledTasks.keys());
}

export function isAutomationScheduled(automationId: string): boolean {
  return scheduledTasks.has(automationId);
}
