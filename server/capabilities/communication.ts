import type OpenAI from "openai";
import type { ToolPermissions } from "../tools";
import { 
  configureDailyCheckIn, 
  getDailyCheckInStatus, 
  stopDailyCheckIn, 
  sendDailyCheckIn,
} from "../dailyCheckIn";

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
];

export const communicationToolPermissions: Record<string, (permissions: ToolPermissions) => boolean> = {
  send_sms: (p) => p.isAdmin,
  configure_daily_checkin: (p) => p.isAdmin,
  get_daily_checkin_status: (p) => p.isAdmin,
  stop_daily_checkin: (p) => p.isAdmin,
  send_daily_checkin_now: (p) => p.isAdmin,
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
];
