import type OpenAI from "openai";
import type { ToolPermissions } from "../tools";
import {
  createAutomation,
  getAllAutomations,
  deleteAutomation,
  getAllContacts,
  getContactByPhone,
  updateAutomation,
} from "../db";
import { scheduleAutomation, stopAutomation } from "../automations";
import { getContactFullName } from "@shared/schema";
import type { InsertAutomation, Contact, Automation } from "@shared/schema";

export const automationToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "create_weather_automation",
      description: "Create a scheduled weather report automation that sends weather updates via SMS at a specified time. Use this when the user wants to set up automatic daily weather reports for themselves or others.",
      parameters: {
        type: "object",
        properties: {
          recipient_names: {
            type: "array",
            items: { type: "string" },
            description: "Array of recipient names to look up in contacts (e.g., ['Nate', 'Sarah']). Will find matching contacts by first or last name.",
          },
          city: {
            type: "string",
            description: "The city for weather reports (e.g., 'Boston', 'Abington').",
          },
          state: {
            type: "string",
            description: "The state abbreviation for weather reports (e.g., 'MA', 'CA').",
          },
          time: {
            type: "string",
            description: "Time to send the weather report in HH:MM format (24-hour) or 'H:MM AM/PM' format (e.g., '06:00' or '6:00 AM').",
          },
          cron_expression: {
            type: "string",
            description: "Optional cron expression for custom scheduling. If provided, overrides the time parameter. Format: 'minute hour day month dayOfWeek' (e.g., '0 6 * * *' for 6am daily).",
          },
        },
        required: ["recipient_names", "city", "state"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_automations",
      description: "List all existing automations. Shows their names, types, schedules, and current status (enabled/disabled).",
      parameters: {
        type: "object",
        properties: {
          type_filter: {
            type: "string",
            enum: ["morning_briefing", "scheduled_sms", "daily_checkin", "task_followup", "weather_report"],
            description: "Optional filter to show only automations of a specific type.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_automation",
      description: "Delete an automation by ID or name match. Use this when the user wants to remove or cancel a scheduled automation.",
      parameters: {
        type: "object",
        properties: {
          automation_id: {
            type: "string",
            description: "The exact ID of the automation to delete.",
          },
          name_match: {
            type: "string",
            description: "A partial name to match against automation names (case-insensitive). If multiple match, returns an error listing the matches.",
          },
        },
        required: [],
      },
    },
  },
];

export const automationToolPermissions: Record<string, (permissions: ToolPermissions) => boolean> = {
  create_weather_automation: (p) => p.isAdmin,
  list_automations: (p) => p.isAdmin,
  delete_automation: (p) => p.isAdmin,
};

function parseTimeToHoursMinutes(timeStr: string): { hours: number; minutes: number } | undefined {
  const time24Match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (time24Match) {
    const hours = parseInt(time24Match[1], 10);
    const minutes = parseInt(time24Match[2], 10);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return { hours, minutes };
    }
    return undefined;
  }

  const time12Match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)$/i);
  if (time12Match) {
    let hours = parseInt(time12Match[1], 10);
    const minutes = parseInt(time12Match[2], 10);
    const period = time12Match[3].toUpperCase();

    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
      return undefined;
    }

    if (period === "PM" && hours !== 12) {
      hours += 12;
    } else if (period === "AM" && hours === 12) {
      hours = 0;
    }

    return { hours, minutes };
  }

  return undefined;
}

function timeToCronExpression(timeStr: string): string | undefined {
  const parsed = parseTimeToHoursMinutes(timeStr);
  if (!parsed) {
    return undefined;
  }
  return `${parsed.minutes} ${parsed.hours} * * *`;
}

function formatPhoneNumber(phone: string): string {
  let formatted = phone.replace(/[^0-9+]/g, "");
  if (formatted.length === 10) {
    formatted = "+1" + formatted;
  } else if (!formatted.startsWith("+")) {
    formatted = "+" + formatted;
  }
  return formatted;
}

function findContactByName(name: string, contacts: Contact[]): Contact | null {
  const searchLower = name.toLowerCase().trim();
  
  for (const contact of contacts) {
    if (contact.firstName.toLowerCase() === searchLower) {
      return contact;
    }
    if (contact.lastName.toLowerCase() === searchLower) {
      return contact;
    }
  }
  
  for (const contact of contacts) {
    const fullName = getContactFullName(contact).toLowerCase();
    if (fullName === searchLower) {
      return contact;
    }
  }
  
  for (const contact of contacts) {
    if (contact.firstName.toLowerCase().includes(searchLower) ||
        contact.lastName.toLowerCase().includes(searchLower)) {
      return contact;
    }
  }
  
  for (const contact of contacts) {
    const fullName = getContactFullName(contact).toLowerCase();
    if (fullName.includes(searchLower)) {
      return contact;
    }
  }
  
  return null;
}

interface ExecuteOptions {
  conversationId?: string;
}

export async function executeAutomationTool(
  toolName: string,
  args: Record<string, unknown>,
  options: ExecuteOptions
): Promise<string | null> {
  switch (toolName) {
    case "create_weather_automation": {
      const { recipient_names, city, state, time, cron_expression } = args as {
        recipient_names: string[];
        city: string;
        state: string;
        time?: string;
        cron_expression?: string;
      };

      if (!recipient_names || recipient_names.length === 0) {
        return JSON.stringify({
          success: false,
          error: "At least one recipient name is required.",
        });
      }

      let cronExpr = cron_expression;
      if (!cronExpr && time) {
        cronExpr = timeToCronExpression(time);
        if (!cronExpr) {
          return JSON.stringify({
            success: false,
            error: `Invalid time format: "${time}". Use HH:MM (24-hour) or H:MM AM/PM format.`,
          });
        }
      }

      if (!cronExpr) {
        cronExpr = "0 6 * * *";
      }

      const contacts = getAllContacts();
      const resolvedRecipients: { name: string; phone: string; contact: Contact }[] = [];
      const notFoundNames: string[] = [];

      for (const name of recipient_names) {
        const contact = findContactByName(name, contacts);
        if (contact) {
          resolvedRecipients.push({
            name: getContactFullName(contact),
            phone: formatPhoneNumber(contact.phoneNumber),
            contact,
          });
        } else {
          notFoundNames.push(name);
        }
      }

      if (notFoundNames.length > 0) {
        const availableContacts = contacts.slice(0, 10).map(c => getContactFullName(c));
        return JSON.stringify({
          success: false,
          error: `Could not find contacts: ${notFoundNames.join(", ")}`,
          not_found: notFoundNames,
          available_contacts: availableContacts,
          hint: "Try using the exact first or last name from the contacts list.",
        });
      }

      if (resolvedRecipients.length === 0) {
        return JSON.stringify({
          success: false,
          error: "No valid recipients found.",
        });
      }

      const createdAutomations: Automation[] = [];
      const updatedAutomations: Automation[] = [];
      const errors: string[] = [];

      const existingAutomations = getAllAutomations();

      for (const recipient of resolvedRecipients) {
        try {
          const automationName = `Morning Weather - ${recipient.contact.firstName}`;
          
          const existingForRecipient = existingAutomations.filter(
            a => a.type === "weather_report" && a.recipientPhone === recipient.phone
          );

          if (existingForRecipient.length > 0) {
            const toKeep = existingForRecipient[0];
            
            for (let i = 1; i < existingForRecipient.length; i++) {
              const duplicate = existingForRecipient[i];
              stopAutomation(duplicate.id);
              deleteAutomation(duplicate.id);
            }
            
            const updated = updateAutomation(toKeep.id, {
              name: automationName,
              cronExpression: cronExpr,
              settings: JSON.stringify({ city, state }),
              enabled: true,
            });
            if (updated) {
              stopAutomation(updated.id);
              scheduleAutomation(updated);
              updatedAutomations.push(updated);
            }
          } else {
            const automationData: InsertAutomation = {
              name: automationName,
              type: "weather_report",
              cronExpression: cronExpr,
              enabled: true,
              recipientPhone: recipient.phone,
              message: undefined,
              settings: JSON.stringify({ city, state }),
            };

            const automation = createAutomation(automationData);
            scheduleAutomation(automation);
            createdAutomations.push(automation);
          }
        } catch (error: any) {
          errors.push(`Failed to create/update automation for ${recipient.name}: ${error.message}`);
        }
      }

      if (createdAutomations.length === 0 && updatedAutomations.length === 0) {
        return JSON.stringify({
          success: false,
          error: "Failed to create or update any automations.",
          errors,
        });
      }

      const cronParts = cronExpr.split(" ");
      const hour = parseInt(cronParts[1], 10);
      const minute = parseInt(cronParts[0], 10);
      const displayTime = new Date(2000, 0, 1, hour, minute).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });

      const allAutomations = [...createdAutomations, ...updatedAutomations];
      const createdCount = createdAutomations.length;
      const updatedCount = updatedAutomations.length;
      
      let actionMessage = "";
      if (createdCount > 0 && updatedCount > 0) {
        actionMessage = `Created ${createdCount} and updated ${updatedCount} weather automation(s)`;
      } else if (updatedCount > 0) {
        actionMessage = `Updated ${updatedCount} existing weather automation(s)`;
      } else {
        actionMessage = `Created ${createdCount} weather automation(s)`;
      }

      return JSON.stringify({
        success: true,
        message: `${actionMessage} for ${city}, ${state}`,
        automations: allAutomations.map(a => ({
          id: a.id,
          name: a.name,
          recipientPhone: a.recipientPhone,
          schedule: displayTime,
          cronExpression: a.cronExpression,
        })),
        created: createdCount,
        updated: updatedCount,
        recipients: resolvedRecipients.map(r => r.name),
        schedule: displayTime,
        location: `${city}, ${state}`,
        errors: errors.length > 0 ? errors : undefined,
      });
    }

    case "list_automations": {
      const { type_filter } = args as { type_filter?: string };

      try {
        let automations = getAllAutomations();

        if (type_filter) {
          automations = automations.filter(a => a.type === type_filter);
        }

        if (automations.length === 0) {
          const filterMsg = type_filter ? ` of type "${type_filter}"` : "";
          return JSON.stringify({
            success: true,
            message: `No automations found${filterMsg}.`,
            automations: [],
            count: 0,
          });
        }

        const automationList = automations.map(a => {
          let schedule = a.cronExpression;
          try {
            const parts = a.cronExpression.split(" ");
            if (parts.length >= 2 && parts[0] !== "*" && parts[1] !== "*") {
              const hour = parseInt(parts[1], 10);
              const minute = parseInt(parts[0], 10);
              schedule = new Date(2000, 0, 1, hour, minute).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              });
            }
          } catch {}

          return {
            id: a.id,
            name: a.name,
            type: a.type,
            enabled: a.enabled,
            schedule,
            cronExpression: a.cronExpression,
            recipientPhone: a.recipientPhone,
            lastRun: a.lastRun,
            nextRun: a.nextRun,
          };
        });

        const filterMsg = type_filter ? ` of type "${type_filter}"` : "";
        return JSON.stringify({
          success: true,
          message: `Found ${automations.length} automation(s)${filterMsg}.`,
          automations: automationList,
          count: automations.length,
        });
      } catch (error: any) {
        console.error("Failed to list automations:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to list automations",
        });
      }
    }

    case "delete_automation": {
      const { automation_id, name_match } = args as {
        automation_id?: string;
        name_match?: string;
      };

      if (!automation_id && !name_match) {
        return JSON.stringify({
          success: false,
          error: "Either automation_id or name_match is required.",
        });
      }

      try {
        const automations = getAllAutomations();
        let toDelete: Automation | undefined;

        if (automation_id) {
          toDelete = automations.find(a => a.id === automation_id);
          if (!toDelete) {
            return JSON.stringify({
              success: false,
              error: `No automation found with ID: ${automation_id}`,
            });
          }
        } else if (name_match) {
          const searchLower = name_match.toLowerCase();
          const matches = automations.filter(a => 
            a.name.toLowerCase().includes(searchLower)
          );

          if (matches.length === 0) {
            return JSON.stringify({
              success: false,
              error: `No automations found matching "${name_match}"`,
              available: automations.map(a => ({ id: a.id, name: a.name })),
            });
          }

          if (matches.length > 1) {
            return JSON.stringify({
              success: false,
              error: `Multiple automations match "${name_match}". Please be more specific or use the automation_id.`,
              matches: matches.map(a => ({ id: a.id, name: a.name, type: a.type })),
            });
          }

          toDelete = matches[0];
        }

        if (!toDelete) {
          return JSON.stringify({
            success: false,
            error: "Could not determine which automation to delete.",
          });
        }

        stopAutomation(toDelete.id);

        const deleted = deleteAutomation(toDelete.id);

        if (deleted) {
          return JSON.stringify({
            success: true,
            message: `Deleted automation: "${toDelete.name}"`,
            deleted: {
              id: toDelete.id,
              name: toDelete.name,
              type: toDelete.type,
            },
          });
        } else {
          return JSON.stringify({
            success: false,
            error: `Failed to delete automation: "${toDelete.name}"`,
          });
        }
      } catch (error: any) {
        console.error("Failed to delete automation:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to delete automation",
        });
      }
    }

    default:
      return null;
  }
}

export const automationToolNames = [
  "create_weather_automation",
  "list_automations",
  "delete_automation",
];
