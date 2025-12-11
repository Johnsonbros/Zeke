import type OpenAI from "openai";
import type { ToolPermissions } from "../tools";
import { 
  configureDailyCheckIn, 
  getDailyCheckInStatus, 
  stopDailyCheckIn, 
  sendDailyCheckIn,
} from "../dailyCheckIn";
import {
  createContact,
  updateContact,
  getAllContacts,
  getContactByPhone,
} from "../db";
import type { AccessLevel } from "@shared/schema";

export const communicationToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "send_sms",
      description: "Send an SMS text message to any phone number. Use this when the user asks you to text someone, send a message to someone, or notify someone via SMS.",
      parameters: {
        type: "object",
        properties: {
          phone_number: {
            type: "string",
            description: "The phone number to send the SMS to. Include country code (e.g., '+16175551234'). If just 10 digits provided, assume +1 for US.",
          },
          message: {
            type: "string",
            description: "The text message to send.",
          },
        },
        required: ["phone_number", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "configure_daily_checkin",
      description: "Set up daily check-in texts. ZEKE will text the user once per day at the specified time with 3 multiple choice questions to better understand them. Use when user asks for daily questions, wants ZEKE to learn about them via text, or asks to set up a daily check-in.",
      parameters: {
        type: "object",
        properties: {
          phone_number: {
            type: "string",
            description: "The phone number to send daily check-in texts to. Include country code (e.g., '+16175551234').",
          },
          time: {
            type: "string",
            description: "Time to send daily check-in in 24-hour format HH:MM (e.g., '09:00' for 9am, '18:30' for 6:30pm). Defaults to 09:00 if not specified.",
          },
        },
        required: ["phone_number"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_daily_checkin_status",
      description: "Check if daily check-in is configured and get its current settings.",
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
      name: "stop_daily_checkin",
      description: "Stop the daily check-in texts.",
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
      name: "send_checkin_now",
      description: "Send a daily check-in immediately (for testing or if user wants questions right now).",
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
      name: "create_contact",
      description: "Create a new contact in ZEKE's address book. Use this when the user wants to add a new person/contact with their phone number. You can set their access level and permissions.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The contact's name (e.g., 'John Smith', 'Mom', 'Dr. Jones').",
          },
          phone_number: {
            type: "string",
            description: "The contact's phone number. Include country code (e.g., '+16175551234'). If just 10 digits provided, assume +1 for US.",
          },
          access_level: {
            type: "string",
            enum: ["admin", "family", "friend", "business", "restricted", "unknown"],
            description: "The contact's access level. 'family' gives broad access, 'friend' gives moderate access, 'business' is limited, 'restricted' is minimal. Default is 'unknown'.",
          },
          relationship: {
            type: "string",
            description: "The relationship to the user (e.g., 'wife', 'brother', 'coworker', 'doctor').",
          },
          notes: {
            type: "string",
            description: "Any notes about this contact.",
          },
        },
        required: ["name", "phone_number"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_contact",
      description: "Update an existing contact's information. Use this when the user wants to change a contact's name, access level, relationship, or permissions.",
      parameters: {
        type: "object",
        properties: {
          phone_number: {
            type: "string",
            description: "The phone number of the contact to update. Used to find the contact.",
          },
          name: {
            type: "string",
            description: "New name for the contact.",
          },
          access_level: {
            type: "string",
            enum: ["admin", "family", "friend", "business", "restricted", "unknown"],
            description: "New access level for the contact.",
          },
          relationship: {
            type: "string",
            description: "New relationship description.",
          },
          notes: {
            type: "string",
            description: "New notes about this contact.",
          },
          can_access_personal_info: {
            type: "boolean",
            description: "Whether this contact can access personal information about the user.",
          },
          can_access_calendar: {
            type: "boolean",
            description: "Whether this contact can access the user's calendar.",
          },
          can_access_tasks: {
            type: "boolean",
            description: "Whether this contact can access the user's tasks.",
          },
          can_access_grocery: {
            type: "boolean",
            description: "Whether this contact can access the grocery list.",
          },
          can_set_reminders: {
            type: "boolean",
            description: "Whether this contact can set reminders.",
          },
        },
        required: ["phone_number"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_contacts",
      description: "List all contacts in ZEKE's address book. Optionally filter by access level.",
      parameters: {
        type: "object",
        properties: {
          access_level: {
            type: "string",
            enum: ["admin", "family", "friend", "business", "restricted", "unknown"],
            description: "Optional filter to show only contacts with this access level.",
          },
        },
        required: [],
      },
    },
  },
];

export const communicationToolPermissions: Record<string, (permissions: ToolPermissions) => boolean> = {
  send_sms: (p) => p.isAdmin,
  configure_daily_checkin: (p) => p.isAdmin,
  get_daily_checkin_status: (p) => p.isAdmin,
  stop_daily_checkin: (p) => p.isAdmin,
  send_daily_checkin_now: (p) => p.isAdmin,
  create_contact: (p) => p.isAdmin,
  update_contact: (p) => p.isAdmin,
  list_contacts: (p) => p.isAdmin,
};

interface ExecuteOptions {
  conversationId?: string;
  sendSmsCallback?: ((phone: string, message: string, source?: string) => Promise<void>) | null;
}

export async function executeCommunicationTool(
  toolName: string,
  args: Record<string, unknown>,
  options: ExecuteOptions
): Promise<string | null> {
  const { sendSmsCallback } = options;

  switch (toolName) {
    case "send_sms": {
      const { phone_number, message } = args as { phone_number: string; message: string };
      
      let formattedPhone = phone_number.replace(/[^0-9+]/g, "");
      if (formattedPhone.length === 10) {
        formattedPhone = "+1" + formattedPhone;
      } else if (!formattedPhone.startsWith("+")) {
        formattedPhone = "+" + formattedPhone;
      }
      
      if (!sendSmsCallback) {
        return JSON.stringify({ 
          success: false, 
          error: "SMS sending is not configured. Twilio credentials may be missing." 
        });
      }
      
      try {
        await sendSmsCallback(formattedPhone, message, "send_sms_tool");
        return JSON.stringify({
          success: true,
          message: `SMS sent to ${formattedPhone}`,
          recipient: formattedPhone,
        });
      } catch (error: any) {
        console.error("Failed to send SMS:", error);
        return JSON.stringify({ 
          success: false, 
          error: error.message || "Failed to send SMS" 
        });
      }
    }
    
    case "configure_daily_checkin": {
      const { phone_number, time } = args as { phone_number: string; time?: string };
      
      let formattedPhone = phone_number.replace(/[^0-9+]/g, "");
      if (formattedPhone.length === 10) {
        formattedPhone = "+1" + formattedPhone;
      } else if (!formattedPhone.startsWith("+")) {
        formattedPhone = "+" + formattedPhone;
      }
      
      try {
        configureDailyCheckIn(formattedPhone, time || "09:00");
        const checkInTime = time || "09:00";
        const [h, m] = checkInTime.split(":").map(Number);
        const displayTime = new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", { 
          hour: "numeric", 
          minute: "2-digit",
          hour12: true 
        });
        
        return JSON.stringify({
          success: true,
          message: `Daily check-in configured! I'll text you at ${displayTime} each day with 3 questions to learn more about you and your family.`,
          phone: formattedPhone,
          time: checkInTime,
        });
      } catch (error: any) {
        console.error("Failed to configure daily check-in:", error);
        return JSON.stringify({ 
          success: false, 
          error: error.message || "Failed to configure daily check-in" 
        });
      }
    }
    
    case "get_daily_checkin_status": {
      try {
        const status = getDailyCheckInStatus();
        if (!status.configured) {
          return JSON.stringify({
            configured: false,
            message: "Daily check-in is not configured yet.",
          });
        }
        
        const [h, m] = (status.time || "09:00").split(":").map(Number);
        const displayTime = new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", { 
          hour: "numeric", 
          minute: "2-digit",
          hour12: true 
        });
        
        return JSON.stringify({
          configured: true,
          phone: status.phoneNumber,
          time: displayTime,
          message: `Daily check-in is active. Texting ${status.phoneNumber} at ${displayTime} each day.`,
        });
      } catch (error: any) {
        console.error("Failed to get check-in status:", error);
        return JSON.stringify({ success: false, error: "Failed to get status" });
      }
    }
    
    case "stop_daily_checkin": {
      try {
        stopDailyCheckIn();
        return JSON.stringify({
          success: true,
          message: "Daily check-in stopped. You won't receive daily questions anymore.",
        });
      } catch (error: any) {
        console.error("Failed to stop daily check-in:", error);
        return JSON.stringify({ success: false, error: "Failed to stop daily check-in" });
      }
    }
    
    case "send_checkin_now": {
      try {
        const sent = await sendDailyCheckIn();
        if (sent) {
          return JSON.stringify({
            success: true,
            message: "Check-in questions sent! Check your phone for 3 multiple choice questions.",
          });
        } else {
          const status = getDailyCheckInStatus();
          if (!status.configured) {
            return JSON.stringify({
              success: false,
              error: "Daily check-in is not configured. Please set it up first with your phone number.",
            });
          }
          return JSON.stringify({
            success: false,
            error: "Failed to send check-in. Make sure SMS is configured.",
          });
        }
      } catch (error: any) {
        console.error("Failed to send check-in now:", error);
        return JSON.stringify({ success: false, error: error.message || "Failed to send check-in" });
      }
    }
    
    case "create_contact": {
      const { name, phone_number, access_level, relationship, notes } = args as {
        name: string;
        phone_number: string;
        access_level?: AccessLevel;
        relationship?: string;
        notes?: string;
      };
      
      let formattedPhone = phone_number.replace(/[^0-9+]/g, "");
      if (formattedPhone.length === 10) {
        formattedPhone = "+1" + formattedPhone;
      } else if (!formattedPhone.startsWith("+")) {
        formattedPhone = "+" + formattedPhone;
      }
      
      try {
        const existingContact = getContactByPhone(formattedPhone);
        if (existingContact) {
          const existingName = `${existingContact.firstName} ${existingContact.lastName}`.trim();
          return JSON.stringify({
            success: false,
            error: `A contact already exists for ${formattedPhone}: ${existingName}. Use update_contact to modify it.`,
            existing_contact: {
              id: existingContact.id,
              name: existingName,
              phoneNumber: existingContact.phoneNumber,
              accessLevel: existingContact.accessLevel,
            },
          });
        }
        
        const contact = createContact({
          firstName: name,
          phoneNumber: formattedPhone,
          accessLevel: access_level || "unknown",
          relationship: relationship || "",
          notes: notes || "",
        });
        
        const contactName = `${contact.firstName} ${contact.lastName}`.trim();
        return JSON.stringify({
          success: true,
          message: `Contact "${name}" created successfully with access level "${contact.accessLevel}".`,
          contact: {
            id: contact.id,
            name: contactName,
            phoneNumber: contact.phoneNumber,
            accessLevel: contact.accessLevel,
            relationship: contact.relationship,
            canAccessPersonalInfo: contact.canAccessPersonalInfo,
            canAccessCalendar: contact.canAccessCalendar,
            canAccessTasks: contact.canAccessTasks,
            canAccessGrocery: contact.canAccessGrocery,
            canSetReminders: contact.canSetReminders,
          },
        });
      } catch (error: any) {
        console.error("Failed to create contact:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to create contact",
        });
      }
    }
    
    case "update_contact": {
      const { 
        phone_number, 
        name, 
        access_level, 
        relationship, 
        notes,
        can_access_personal_info,
        can_access_calendar,
        can_access_tasks,
        can_access_grocery,
        can_set_reminders,
      } = args as {
        phone_number: string;
        name?: string;
        access_level?: AccessLevel;
        relationship?: string;
        notes?: string;
        can_access_personal_info?: boolean;
        can_access_calendar?: boolean;
        can_access_tasks?: boolean;
        can_access_grocery?: boolean;
        can_set_reminders?: boolean;
      };
      
      let formattedPhone = phone_number.replace(/[^0-9+]/g, "");
      if (formattedPhone.length === 10) {
        formattedPhone = "+1" + formattedPhone;
      } else if (!formattedPhone.startsWith("+")) {
        formattedPhone = "+" + formattedPhone;
      }
      
      try {
        const existingContact = getContactByPhone(formattedPhone);
        if (!existingContact) {
          return JSON.stringify({
            success: false,
            error: `No contact found for phone number ${formattedPhone}. Use create_contact to add a new contact.`,
          });
        }
        
        const updateData: Record<string, unknown> = {};
        if (name !== undefined) updateData.firstName = name;
        if (access_level !== undefined) updateData.accessLevel = access_level;
        if (relationship !== undefined) updateData.relationship = relationship;
        if (notes !== undefined) updateData.notes = notes;
        if (can_access_personal_info !== undefined) updateData.canAccessPersonalInfo = can_access_personal_info;
        if (can_access_calendar !== undefined) updateData.canAccessCalendar = can_access_calendar;
        if (can_access_tasks !== undefined) updateData.canAccessTasks = can_access_tasks;
        if (can_access_grocery !== undefined) updateData.canAccessGrocery = can_access_grocery;
        if (can_set_reminders !== undefined) updateData.canSetReminders = can_set_reminders;
        
        const updated = updateContact(existingContact.id, updateData);
        if (!updated) {
          return JSON.stringify({
            success: false,
            error: "Failed to update contact.",
          });
        }
        
        const updatedName = `${updated.firstName} ${updated.lastName}`.trim();
        return JSON.stringify({
          success: true,
          message: `Contact "${updatedName}" updated successfully.`,
          contact: {
            id: updated.id,
            name: updatedName,
            phoneNumber: updated.phoneNumber,
            accessLevel: updated.accessLevel,
            relationship: updated.relationship,
            canAccessPersonalInfo: updated.canAccessPersonalInfo,
            canAccessCalendar: updated.canAccessCalendar,
            canAccessTasks: updated.canAccessTasks,
            canAccessGrocery: updated.canAccessGrocery,
            canSetReminders: updated.canSetReminders,
          },
        });
      } catch (error: any) {
        console.error("Failed to update contact:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to update contact",
        });
      }
    }
    
    case "list_contacts": {
      const { access_level } = args as { access_level?: AccessLevel };
      
      try {
        let contacts = getAllContacts();
        
        if (access_level) {
          contacts = contacts.filter(c => c.accessLevel === access_level);
        }
        
        if (contacts.length === 0) {
          const filterMsg = access_level ? ` with access level "${access_level}"` : "";
          return JSON.stringify({
            success: true,
            message: `No contacts found${filterMsg}.`,
            contacts: [],
            count: 0,
          });
        }
        
        const contactList = contacts.map(c => ({
          id: c.id,
          name: `${c.firstName} ${c.lastName}`.trim(),
          phoneNumber: c.phoneNumber,
          accessLevel: c.accessLevel,
          relationship: c.relationship,
        }));
        
        const filterMsg = access_level ? ` with access level "${access_level}"` : "";
        return JSON.stringify({
          success: true,
          message: `Found ${contacts.length} contact(s)${filterMsg}.`,
          contacts: contactList,
          count: contacts.length,
        });
      } catch (error: any) {
        console.error("Failed to list contacts:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to list contacts",
        });
      }
    }
    
    default:
      return null;
  }
}

export const communicationToolNames = [
  "send_sms",
  "configure_daily_checkin",
  "get_daily_checkin_status",
  "stop_daily_checkin",
  "send_checkin_now",
  "create_contact",
  "update_contact",
  "list_contacts",
];
