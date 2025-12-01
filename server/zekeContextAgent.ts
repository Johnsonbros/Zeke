/**
 * ZEKE Context Agent - Wake Word Detection and Command Execution
 * 
 * This background processor scans lifelogs for "Hey ZEKE" wake word commands
 * and automatically executes them as Nate's digital twin.
 * 
 * Features:
 * - Periodic scanning of recent lifelogs
 * - Wake word detection with pattern matching
 * - AI-powered command parsing
 * - Automatic action execution (SMS, tasks, reminders, etc.)
 * - Deduplication to prevent repeat actions
 * - Execution logging and history
 */

import * as cron from "node-cron";
import { getRecentLifelogs, checkLimitlessConnection } from "./limitless";
import { detectCommandsInLifelogs, isActionableCommand, type DetectedCommand } from "./wakeWordDetector";
import { parseCommand, generateFriendlyMessage, validateAction, type ParsedAction } from "./commandParser";
import { executeTool } from "./tools";
import {
  createWakeWordCommand,
  getContextAgentSettings,
  updateContextAgentSettings,
  updateWakeWordCommandStatus,
  updateWakeWordCommandAction,
  wakeWordCommandExists,
  updateLastScanTime,
  getRecentWakeWordCommands,
  getPendingWakeWordCommands,
  getContact,
} from "./db";
import { createTask, createGroceryItem, createReminder } from "./db";
import { scheduleReminderExecution } from "./capabilities/reminders";
import { executeCalendarTool } from "./capabilities/calendar";
import { executeSearchTool } from "./capabilities/search";
import type { WakeWordCommand, ContextAgentSettings } from "@shared/schema";
import { MASTER_ADMIN_PHONE } from "@shared/schema";

// Singleton state
let isProcessing = false;
let scheduledTask: cron.ScheduledTask | null = null;
let sendSmsCallback: ((phone: string, message: string, source?: string) => Promise<void>) | null = null;

export interface ProcessingResult {
  scanned: number;
  detected: number;
  parsed: number;
  executed: number;
  failed: number;
  skipped: number;
  errors: string[];
}

/**
 * Set the SMS callback function for sending messages
 */
export function setContextAgentSmsCallback(callback: (phone: string, message: string, source?: string) => Promise<void>): void {
  sendSmsCallback = callback;
  console.log("[ContextAgent] SMS callback configured");
}

/**
 * Main processing function - scans lifelogs and processes wake word commands
 */
export async function processContextCommands(hours?: number): Promise<ProcessingResult> {
  if (isProcessing) {
    console.log("[ContextAgent] Already processing, skipping...");
    return {
      scanned: 0,
      detected: 0,
      parsed: 0,
      executed: 0,
      failed: 0,
      skipped: 0,
      errors: ["Already processing"],
    };
  }
  
  isProcessing = true;
  const startTime = Date.now();
  const result: ProcessingResult = {
    scanned: 0,
    detected: 0,
    parsed: 0,
    executed: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };
  
  try {
    const settings = getContextAgentSettings();
    if (!settings?.enabled) {
      console.log("[ContextAgent] Context agent is disabled");
      return result;
    }
    
    const lookbackHours = hours ?? settings.lookbackHours;
    console.log(`[ContextAgent] Starting scan for last ${lookbackHours} hours of lifelogs...`);
    
    // Check Limitless connection
    const connection = await checkLimitlessConnection();
    if (!connection.connected) {
      console.log("[ContextAgent] Limitless not connected:", connection.error);
      result.errors.push(`Limitless connection failed: ${connection.error}`);
      return result;
    }
    
    // Fetch recent lifelogs
    const lifelogs = await getRecentLifelogs(lookbackHours, 100);
    result.scanned = lifelogs.length;
    
    if (lifelogs.length === 0) {
      console.log("[ContextAgent] No lifelogs found in the specified time range");
      updateLastScanTime();
      return result;
    }
    
    console.log(`[ContextAgent] Scanning ${lifelogs.length} lifelogs for wake word commands...`);
    
    // Detect wake word commands
    const detectedCommands = detectCommandsInLifelogs(lifelogs);
    
    for (const detected of detectedCommands) {
      // Check if actionable
      if (!isActionableCommand(detected.rawCommand)) {
        console.log(`[ContextAgent] Skipping non-actionable command: "${detected.rawCommand}"`);
        result.skipped++;
        continue;
      }
      
      // Check for duplicates
      if (wakeWordCommandExists(detected.lifelogId, detected.rawCommand)) {
        console.log(`[ContextAgent] Skipping duplicate command: "${detected.rawCommand}"`);
        result.skipped++;
        continue;
      }
      
      result.detected++;
      
      // Store the detected command
      const storedCommand = createWakeWordCommand({
        lifelogId: detected.lifelogId,
        lifelogTitle: detected.lifelogTitle,
        wakeWord: detected.wakeWord,
        rawCommand: detected.rawCommand,
        speakerName: detected.speakerName,
        timestamp: detected.timestamp,
        context: detected.context,
        status: "detected",
      });
      
      console.log(`[ContextAgent] Detected command: "${detected.rawCommand}" from "${detected.lifelogTitle}"`);
      
      // Parse the command
      try {
        const parseResult = await parseCommand(detected);
        
        if (!parseResult.success || !parseResult.action) {
          updateWakeWordCommandStatus(storedCommand.id, "failed", parseResult.error || "Failed to parse command");
          result.failed++;
          result.errors.push(`Parse failed for "${detected.rawCommand}": ${parseResult.error}`);
          continue;
        }
        
        const action = parseResult.action;
        result.parsed++;
        
        // Update command with parsed action
        updateWakeWordCommandAction(
          storedCommand.id,
          action.actionType,
          JSON.stringify(action),
          action.targetContact?.id,
          action.confidence
        );
        
        console.log(`[ContextAgent] Parsed as ${action.actionType} with ${(action.confidence * 100).toFixed(0)}% confidence`);
        
        // Validate the action
        const validation = validateAction(action);
        if (!validation.valid) {
          updateWakeWordCommandStatus(storedCommand.id, "skipped", validation.reason);
          result.skipped++;
          console.log(`[ContextAgent] Skipping invalid action: ${validation.reason}`);
          continue;
        }
        
        // Check if auto-execute is enabled
        if (!settings.autoExecute) {
          updateWakeWordCommandStatus(storedCommand.id, "pending_approval", "Awaiting manual approval");
          console.log(`[ContextAgent] Command queued for manual approval`);
          continue;
        }
        
        // Check if SMS requires approval
        if (action.actionType === "send_message" && settings.requireApprovalForSms) {
          updateWakeWordCommandStatus(storedCommand.id, "pending_approval", "SMS requires manual approval");
          console.log(`[ContextAgent] SMS command queued for approval`);
          continue;
        }
        
        // Execute the action
        const executeResult = await executeAction(action, detected);
        
        if (executeResult.success) {
          updateWakeWordCommandStatus(storedCommand.id, "completed", executeResult.message);
          result.executed++;
          console.log(`[ContextAgent] Successfully executed: ${executeResult.message}`);
          
          // Notify Nate if configured
          if (settings.notifyOnExecution && sendSmsCallback) {
            try {
              const notificationMessage = `ZEKE executed: "${detected.rawCommand}"\n\nResult: ${executeResult.message}`;
              await sendSmsCallback(`+1${MASTER_ADMIN_PHONE}`, notificationMessage, "context_agent");
            } catch (e) {
              console.error("[ContextAgent] Failed to send notification:", e);
            }
          }
        } else {
          updateWakeWordCommandStatus(storedCommand.id, "failed", executeResult.message);
          result.failed++;
          result.errors.push(`Execution failed for "${detected.rawCommand}": ${executeResult.message}`);
        }
        
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        updateWakeWordCommandStatus(storedCommand.id, "failed", errorMsg);
        result.failed++;
        result.errors.push(`Error processing "${detected.rawCommand}": ${errorMsg}`);
      }
    }
    
    updateLastScanTime();
    
    const elapsed = Date.now() - startTime;
    console.log(
      `[ContextAgent] Scan completed in ${elapsed}ms: ` +
      `${result.scanned} scanned, ${result.detected} detected, ` +
      `${result.parsed} parsed, ${result.executed} executed, ` +
      `${result.failed} failed, ${result.skipped} skipped`
    );
    
    return result;
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("[ContextAgent] Processing error:", error);
    result.errors.push(`Processing error: ${errorMsg}`);
    return result;
  } finally {
    isProcessing = false;
  }
}

/**
 * Execute a parsed action
 */
async function executeAction(
  action: ParsedAction, 
  detected: DetectedCommand
): Promise<{ success: boolean; message: string }> {
  try {
    switch (action.actionType) {
      case "send_message": {
        if (!action.targetContact || !action.targetContact.phoneNumber) {
          return { success: false, message: "No valid phone number for target contact" };
        }
        
        if (!sendSmsCallback) {
          return { success: false, message: "SMS not configured" };
        }
        
        // Generate a friendly message
        const friendlyMessage = await generateFriendlyMessage(
          action.targetPerson || action.targetContact.name,
          action.originalCommand,
          detected.context
        );
        
        await sendSmsCallback(action.targetContact.phoneNumber, friendlyMessage, "context_agent");
        
        return { 
          success: true, 
          message: `Sent message to ${action.targetContact.name}: "${friendlyMessage}"` 
        };
      }
      
      case "add_task": {
        if (!action.taskDetails?.title) {
          return { success: false, message: "No task title specified" };
        }
        
        const task = createTask({
          title: action.taskDetails.title,
          description: action.taskDetails.title,
          priority: action.taskDetails.priority || "medium",
          category: action.taskDetails.category || "personal",
          dueDate: action.taskDetails.dueDate || null,
        });
        
        return { 
          success: true, 
          message: `Created task: "${task.title}"` 
        };
      }
      
      case "add_grocery_item": {
        if (!action.groceryItem?.name) {
          return { success: false, message: "No grocery item specified" };
        }
        
        const item = createGroceryItem({
          name: action.groceryItem.name,
          quantity: action.groceryItem.quantity || "1",
          category: action.groceryItem.category || "Other",
          addedBy: "ZEKE (voice)",
        });
        
        return { 
          success: true, 
          message: `Added to grocery list: "${item.name}"` 
        };
      }
      
      case "set_reminder": {
        const reminderMessage = action.message || action.originalCommand;
        
        // Parse reminder time (simple relative time handling)
        let scheduledFor = new Date();
        if (action.reminderTime) {
          if (action.reminderTime.includes("hour")) {
            const match = action.reminderTime.match(/(\d+)/);
            if (match) {
              scheduledFor.setHours(scheduledFor.getHours() + parseInt(match[1]));
            } else {
              scheduledFor.setHours(scheduledFor.getHours() + 1);
            }
          } else if (action.reminderTime.includes("minute") || action.reminderTime.includes("min")) {
            const match = action.reminderTime.match(/(\d+)/);
            if (match) {
              scheduledFor.setMinutes(scheduledFor.getMinutes() + parseInt(match[1]));
            } else {
              scheduledFor.setMinutes(scheduledFor.getMinutes() + 30);
            }
          } else if (action.reminderTime.includes("tomorrow")) {
            scheduledFor.setDate(scheduledFor.getDate() + 1);
            scheduledFor.setHours(9, 0, 0, 0);
          } else {
            // Try to parse as ISO date or extract number for minutes
            const numMatch = action.reminderTime.match(/(\d+)/);
            if (numMatch) {
              // If just a number, assume minutes
              scheduledFor.setMinutes(scheduledFor.getMinutes() + parseInt(numMatch[1]));
            } else {
              try {
                scheduledFor = new Date(action.reminderTime);
              } catch {
                scheduledFor.setHours(scheduledFor.getHours() + 1);
              }
            }
          }
        } else {
          // Default to 1 hour from now
          scheduledFor.setHours(scheduledFor.getHours() + 1);
        }
        
        // Create reminder in database with recipient phone for SMS delivery
        const reminder = createReminder({
          message: reminderMessage,
          scheduledFor: scheduledFor.toISOString(),
          recipientPhone: `+1${MASTER_ADMIN_PHONE}`,
          completed: false,
        });
        
        // Schedule the reminder execution using the reminder system's scheduler
        // This ensures the SMS callback is properly used when the reminder fires
        scheduleReminderExecution(reminder.id, scheduledFor);
        
        const timeStr = scheduledFor.toLocaleString("en-US", { 
          timeZone: "America/New_York",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          month: "short",
          day: "numeric"
        });
        
        return { 
          success: true, 
          message: `Set reminder for ${timeStr} via SMS: "${reminderMessage}"` 
        };
      }
      
      case "schedule_event": {
        if (!action.eventDetails?.title || !action.eventDetails?.startTime) {
          return { success: false, message: "No event title or start time specified" };
        }
        
        try {
          const result = await executeCalendarTool("create_calendar_event", {
            title: action.eventDetails.title,
            start_time: action.eventDetails.startTime,
            end_time: action.eventDetails.endTime || undefined,
            location: action.eventDetails.location || undefined,
            description: action.eventDetails.description || `Created via ZEKE voice command: "${action.originalCommand}"`,
            all_day: action.eventDetails.allDay || false,
          });
          
          if (result) {
            const parsed = JSON.parse(result);
            if (parsed.success) {
              return { 
                success: true, 
                message: parsed.message || `Created calendar event: "${action.eventDetails.title}"` 
              };
            } else {
              return { 
                success: false, 
                message: parsed.error || "Failed to create calendar event" 
              };
            }
          }
          return { success: false, message: "No response from calendar tool" };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          return { success: false, message: `Calendar error: ${errorMsg}` };
        }
      }
      
      case "search_info": {
        if (!action.searchQuery) {
          return { success: false, message: "No search query specified" };
        }
        
        try {
          // Use Perplexity search for better answers
          const result = await executeSearchTool(
            "perplexity_search", 
            { query: action.searchQuery },
            {}
          );
          
          if (result) {
            const parsed = JSON.parse(result);
            if (parsed.answer || parsed.results) {
              // Send the answer via SMS to Nate
              if (sendSmsCallback) {
                const answer = parsed.answer || (parsed.results?.[0]?.snippet || "No results found");
                const formattedAnswer = `ZEKE Search Result for "${action.searchQuery}":\n\n${answer}`;
                await sendSmsCallback(`+1${MASTER_ADMIN_PHONE}`, formattedAnswer, "context_agent");
              }
              return { 
                success: true, 
                message: `Search completed and result sent via SMS` 
              };
            } else if (parsed.error) {
              return { success: false, message: parsed.error };
            }
          }
          return { success: false, message: "No search results" };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          return { success: false, message: `Search error: ${errorMsg}` };
        }
      }
      
      default:
        return { 
          success: false, 
          message: `Unknown action type: ${action.actionType}` 
        };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    return { success: false, message: errorMsg };
  }
}

/**
 * Manually approve and execute a pending command
 */
export async function approveAndExecuteCommand(commandId: string): Promise<{ success: boolean; message: string }> {
  const command = getRecentWakeWordCommands(100).find(c => c.id === commandId);
  
  if (!command) {
    return { success: false, message: "Command not found" };
  }
  
  if (command.status !== "pending_approval" && command.status !== "parsed") {
    return { success: false, message: `Command is not pending approval (status: ${command.status})` };
  }
  
  if (!command.actionDetails) {
    return { success: false, message: "No action details available" };
  }
  
  try {
    const action = JSON.parse(command.actionDetails) as ParsedAction;
    
    // Reconstruct the detected command
    const detected: DetectedCommand = {
      lifelogId: command.lifelogId,
      lifelogTitle: command.lifelogTitle,
      timestamp: command.timestamp,
      wakeWord: command.wakeWord,
      rawCommand: command.rawCommand,
      speakerName: command.speakerName,
      speakerIdentifier: null,
      context: command.context || "",
      fullTranscript: "",
    };
    
    updateWakeWordCommandStatus(commandId, "executing");
    
    const result = await executeAction(action, detected);
    
    updateWakeWordCommandStatus(
      commandId,
      result.success ? "completed" : "failed",
      result.message
    );
    
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    updateWakeWordCommandStatus(commandId, "failed", errorMsg);
    return { success: false, message: errorMsg };
  }
}

/**
 * Start the scheduled context agent
 */
export function startContextAgent(): void {
  const settings = getContextAgentSettings();
  if (!settings) {
    console.log("[ContextAgent] No settings found, skipping startup");
    return;
  }
  
  if (!settings.enabled) {
    console.log("[ContextAgent] Context agent is disabled in settings");
    return;
  }
  
  if (scheduledTask) {
    console.log("[ContextAgent] Already running");
    return;
  }
  
  const intervalMinutes = settings.scanIntervalMinutes || 5;
  const cronExpression = `*/${intervalMinutes} * * * *`;
  
  console.log(`[ContextAgent] Starting with ${intervalMinutes}-minute scan interval`);
  
  scheduledTask = cron.schedule(cronExpression, async () => {
    console.log("[ContextAgent] Running scheduled scan...");
    await processContextCommands();
  });
  
  console.log("[ContextAgent] Background processor started");
  
  // Run initial scan after a short delay
  setTimeout(async () => {
    console.log("[ContextAgent] Running initial scan...");
    await processContextCommands();
  }, 10000);
}

/**
 * Stop the scheduled context agent
 */
export function stopContextAgent(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log("[ContextAgent] Background processor stopped");
  }
}

/**
 * Get current context agent status
 */
export function getContextAgentStatus(): {
  running: boolean;
  settings: ContextAgentSettings | null;
  isProcessing: boolean;
  recentCommands: WakeWordCommand[];
  pendingCommands: WakeWordCommand[];
} {
  return {
    running: scheduledTask !== null,
    settings: getContextAgentSettings(),
    isProcessing,
    recentCommands: getRecentWakeWordCommands(20),
    pendingCommands: getPendingWakeWordCommands(),
  };
}

/**
 * Toggle the context agent on/off
 */
export function toggleContextAgent(enabled: boolean): ContextAgentSettings | null {
  const settings = updateContextAgentSettings({ enabled });
  
  if (enabled) {
    startContextAgent();
  } else {
    stopContextAgent();
  }
  
  return settings;
}
