import type { Express } from "express";
import { createServer, type Server } from "http";
import { 
  createConversation, 
  getConversation, 
  getAllConversations,
  deleteConversation,
  createMessage,
  getMessagesByConversation,
  findOrCreateSmsConversation,
  getAllMemoryNotes,
  createMemoryNote,
  deleteMemoryNote,
  getAllPreferences,
  setPreference,
  createGroceryItem,
  getAllGroceryItems,
  getGroceryItem,
  updateGroceryItem,
  toggleGroceryItemPurchased,
  deleteGroceryItem,
  clearPurchasedGroceryItems,
  createTask,
  getAllTasks,
  getTask,
  updateTask,
  toggleTaskCompleted,
  deleteTask,
  clearCompletedTasks,
  getTasksDueToday,
  getOverdueTasks,
  getAllContacts,
  getContact,
  getContactByPhone,
  createContact,
  updateContact,
  deleteContact,
  getOrCreateContactForPhone,
  getConversationsByPhone,
  getMessageCountForPhone,
  isMasterAdmin,
  getAllReminders,
  getReminder,
  updateReminder,
  deleteReminder,
  getAllAutomations,
  getAutomation,
  createAutomation,
  updateAutomation,
  deleteAutomation,
  getAllProfileSections,
  getProfileSection,
  upsertProfileSection,
  deleteProfileSection,
  getFullProfile,
  createTwilioMessage,
  getAllTwilioMessages,
  getTwilioMessagesByPhone,
  getTwilioMessageStats,
  getTwilioConversationPhones,
  updateTwilioMessageStatus,
  updateTwilioMessageError,
  normalizePhoneNumber
} from "./db";
import type { TwilioMessageSource } from "@shared/schema";
import { generateContextualQuestion } from "./gettingToKnow";
import { chat } from "./agent";
import { setSendSmsCallback, restorePendingReminders } from "./tools";
import { setDailyCheckInSmsCallback, initializeDailyCheckIn } from "./dailyCheckIn";
import { 
  initializeAutomations, 
  setAutomationSmsCallback, 
  scheduleAutomation, 
  stopAutomation,
  runAutomationNow 
} from "./automations";
import { chatRequestSchema, insertMemoryNoteSchema, insertPreferenceSchema, insertGroceryItemSchema, updateGroceryItemSchema, insertTaskSchema, updateTaskSchema, insertContactSchema, updateContactSchema, insertAutomationSchema, type Automation, type InsertAutomation } from "@shared/schema";
import twilio from "twilio";
import { z } from "zod";
import { listCalendarEvents, getTodaysEvents, getUpcomingEvents, createCalendarEvent, deleteCalendarEvent, updateCalendarEvent, listCalendars, type CalendarEvent, type CalendarInfo } from "./googleCalendar";

// Initialize Twilio client for outbound SMS
function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  
  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials not configured");
  }
  
  return twilio(accountSid, authToken);
}

// Format phone number for Twilio - handles various input formats
function formatPhoneNumber(phone: string): string {
  const digits = phone.trim().replace(/\D/g, ""); // Remove all non-digits
  // If it's 11 digits starting with 1, it already has US country code
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  } else if (digits.length === 10) {
    // 10 digit US number, add +1
    return `+1${digits}`;
  } else {
    // Other formats, just add + if needed
    return phone.trim().startsWith("+") ? phone.trim() : `+${digits}`;
  }
}

// Helper to log Twilio SMS messages
function logTwilioMessage(params: {
  direction: "inbound" | "outbound";
  source: TwilioMessageSource;
  fromNumber: string;
  toNumber: string;
  body: string;
  twilioSid?: string;
  status?: "queued" | "sending" | "sent" | "delivered" | "failed" | "received";
  conversationId?: string;
  errorCode?: string;
  errorMessage?: string;
}) {
  try {
    const contact = getContactByPhone(
      params.direction === "inbound" ? params.fromNumber : params.toNumber
    );
    
    createTwilioMessage({
      twilioSid: params.twilioSid || null,
      direction: params.direction,
      status: params.status || (params.direction === "inbound" ? "received" : "sent"),
      source: params.source,
      fromNumber: params.fromNumber,
      toNumber: params.toNumber,
      body: params.body,
      contactId: contact?.id || null,
      contactName: contact?.name || null,
      conversationId: params.conversationId || null,
      errorCode: params.errorCode || null,
      errorMessage: params.errorMessage || null,
    });
    
    console.log(`[TWILIO LOG] ${params.direction} ${params.source}: ${params.direction === "inbound" ? params.fromNumber : params.toNumber} - ${params.body.substring(0, 50)}...`);
  } catch (error) {
    console.error("[TWILIO LOG] Failed to log message:", error);
  }
}

// Schema for outbound SMS
const sendSmsSchema = z.object({
  to: z.string().min(10, "Phone number required"),
  message: z.string().min(1, "Message required"),
});

// Schema for updating reminders
const updateReminderSchema = z.object({
  message: z.string().min(1).optional(),
  scheduledFor: z.string().optional(),
  recipientPhone: z.string().optional(),
});

// Schema for updating automations
const updateAutomationSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["morning_briefing", "scheduled_sms", "daily_checkin"]).optional(),
  cronExpression: z.string().optional(),
  enabled: z.boolean().optional(),
  recipientPhone: z.string().nullable().optional(),
  message: z.string().nullable().optional(),
  settings: z.string().nullable().optional(),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Set up SMS callback for tools (reminders and send_sms tool)
  setSendSmsCallback(async (phone: string, message: string, source?: string) => {
    const twilioFromNumber = process.env.TWILIO_PHONE_NUMBER;
    if (!twilioFromNumber) {
      console.error("TWILIO_PHONE_NUMBER not configured for reminder SMS");
      return;
    }
    
    const formattedPhone = formatPhoneNumber(phone);
    const smsSource = (source || "reminder") as TwilioMessageSource;
    
    try {
      const client = getTwilioClient();
      const result = await client.messages.create({
        body: message,
        from: twilioFromNumber,
        to: formattedPhone,
      });
      
      logTwilioMessage({
        direction: "outbound",
        source: smsSource,
        fromNumber: twilioFromNumber,
        toNumber: formattedPhone,
        body: message,
        twilioSid: result.sid,
        status: "sent",
      });
      
      console.log(`Reminder SMS sent to ${formattedPhone}`);
    } catch (error: any) {
      logTwilioMessage({
        direction: "outbound",
        source: smsSource,
        fromNumber: twilioFromNumber,
        toNumber: formattedPhone,
        body: message,
        status: "failed",
        errorCode: error.code?.toString() || "UNKNOWN",
        errorMessage: error.message || "Unknown error",
      });
      
      console.error("Failed to send reminder SMS:", error);
      throw error;
    }
  });
  
  // Restore pending reminders from database after server startup
  restorePendingReminders();
  
  // Set up daily check-in SMS callback and restore scheduled check-ins
  setDailyCheckInSmsCallback(async (phone: string, message: string) => {
    const twilioFromNumber = process.env.TWILIO_PHONE_NUMBER;
    if (!twilioFromNumber) {
      console.error("TWILIO_PHONE_NUMBER not configured for daily check-in");
      throw new Error("Twilio not configured");
    }
    
    const formattedPhone = formatPhoneNumber(phone);
    
    try {
      const client = getTwilioClient();
      const result = await client.messages.create({
        body: message,
        from: twilioFromNumber,
        to: formattedPhone,
      });
      
      logTwilioMessage({
        direction: "outbound",
        source: "daily_checkin",
        fromNumber: twilioFromNumber,
        toNumber: formattedPhone,
        body: message,
        twilioSid: result.sid,
        status: "sent",
      });
      
      console.log(`Daily check-in SMS sent to ${formattedPhone}`);
    } catch (error: any) {
      logTwilioMessage({
        direction: "outbound",
        source: "daily_checkin",
        fromNumber: twilioFromNumber,
        toNumber: formattedPhone,
        body: message,
        status: "failed",
        errorCode: error.code?.toString() || "UNKNOWN",
        errorMessage: error.message || "Unknown error",
      });
      
      console.error("Failed to send daily check-in SMS:", error);
      throw error;
    }
  });
  initializeDailyCheckIn();
  
  // Set up automation SMS callback and initialize scheduled automations
  setAutomationSmsCallback(async (phone: string, message: string) => {
    const twilioFromNumber = process.env.TWILIO_PHONE_NUMBER;
    if (!twilioFromNumber) {
      console.error("TWILIO_PHONE_NUMBER not configured for automation SMS");
      throw new Error("Twilio not configured");
    }
    
    const formattedPhone = formatPhoneNumber(phone);
    
    try {
      const client = getTwilioClient();
      const result = await client.messages.create({
        body: message,
        from: twilioFromNumber,
        to: formattedPhone,
      });
      
      logTwilioMessage({
        direction: "outbound",
        source: "automation",
        fromNumber: twilioFromNumber,
        toNumber: formattedPhone,
        body: message,
        twilioSid: result.sid,
        status: "sent",
      });
      
      console.log(`Automation SMS sent to ${formattedPhone}`);
    } catch (error: any) {
      logTwilioMessage({
        direction: "outbound",
        source: "automation",
        fromNumber: twilioFromNumber,
        toNumber: formattedPhone,
        body: message,
        status: "failed",
        errorCode: error.code?.toString() || "UNKNOWN",
        errorMessage: error.message || "Unknown error",
      });
      
      console.error("Failed to send automation SMS:", error);
      throw error;
    }
  });
  initializeAutomations();
  
  // Chat endpoint - sends message and gets AI response
  app.post("/api/chat", async (req, res) => {
    try {
      const parsed = chatRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body" });
      }
      
      const { message, conversationId, source } = parsed.data;
      let conversation;
      let isNewConversation = false;
      
      if (conversationId) {
        conversation = getConversation(conversationId);
        if (!conversation) {
          return res.status(404).json({ message: "Conversation not found" });
        }
      } else {
        conversation = createConversation({ source });
        isNewConversation = true;
      }
      
      // Store user message
      createMessage({
        conversationId: conversation.id,
        role: "user",
        content: message,
        source,
      });
      
      // Get AI response (pass phone number if this is an SMS conversation)
      const aiResponse = await chat(conversation.id, message, isNewConversation, conversation.phoneNumber || undefined);
      
      // Store assistant message
      const assistantMessage = createMessage({
        conversationId: conversation.id,
        role: "assistant",
        content: aiResponse,
        source,
      });
      
      // If this is an SMS conversation, also send the AI response via SMS
      if (conversation.source === "sms" && conversation.phoneNumber) {
        const twilioFromNumber = process.env.TWILIO_PHONE_NUMBER;
        if (twilioFromNumber) {
          try {
            const client = getTwilioClient();
            const formattedPhone = formatPhoneNumber(conversation.phoneNumber);
            await client.messages.create({
              body: aiResponse,
              from: twilioFromNumber,
              to: formattedPhone,
            });
            console.log(`SMS reply sent to ${formattedPhone} from web chat`);
          } catch (smsError: any) {
            console.error("Failed to send SMS reply:", smsError);
            // Don't fail the request, just log the error
          }
        } else {
          console.warn("TWILIO_PHONE_NUMBER not configured - SMS reply not sent");
        }
      }
      
      // Get updated conversation (for new title if generated)
      const updatedConversation = getConversation(conversation.id);
      
      res.json({
        message: assistantMessage,
        conversation: updatedConversation,
      });
    } catch (error: any) {
      console.error("Chat error:", error);
      res.status(500).json({ message: error.message || "Failed to process chat" });
    }
  });
  
  // Create a Getting To Know You conversation (resets each time, generates contextual questions)
  app.post("/api/conversations/getting-to-know", async (_req, res) => {
    try {
      const conversation = createConversation({ 
        source: "web",
        title: "Getting To Know You",
        mode: "getting_to_know"
      });
      
      // Generate a contextual question based on existing memories
      const firstQuestion = await generateContextualQuestion();
      
      const assistantMessage = createMessage({
        conversationId: conversation.id,
        role: "assistant",
        content: firstQuestion,
        source: "web",
      });
      
      res.json({
        conversation,
        message: assistantMessage,
      });
    } catch (error: any) {
      console.error("Create getting to know conversation error:", error);
      res.status(500).json({ message: "Failed to create conversation" });
    }
  });
  
  // Get all conversations
  app.get("/api/conversations", async (_req, res) => {
    try {
      const conversations = getAllConversations();
      res.json(conversations);
    } catch (error: any) {
      console.error("Get conversations error:", error);
      res.status(500).json({ message: "Failed to get conversations" });
    }
  });
  
  // Get single conversation with messages
  app.get("/api/conversations/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const conversation = getConversation(id);
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      const messages = getMessagesByConversation(id);
      
      res.json({ conversation, messages });
    } catch (error: any) {
      console.error("Get conversation error:", error);
      res.status(500).json({ message: "Failed to get conversation" });
    }
  });
  
  // Delete conversation
  app.delete("/api/conversations/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const conversation = getConversation(id);
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      deleteConversation(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete conversation error:", error);
      res.status(500).json({ message: "Failed to delete conversation" });
    }
  });
  
  // Twilio SMS webhook - sends reply via API for reliability
  app.post("/api/twilio/webhook", async (req, res) => {
    try {
      // Log full request for debugging
      console.log("Twilio webhook received:", JSON.stringify(req.body));
      
      const { Body: message, From: rawFromNumber, MessageSid: messageSid } = req.body;
      
      if (!message || !rawFromNumber) {
        console.log("Missing message or phone number in webhook");
        return res.status(200).send("OK"); // Return 200 to prevent Twilio retries
      }
      
      // Format phone number consistently
      const fromNumber = formatPhoneNumber(rawFromNumber);
      const twilioFromNumber = process.env.TWILIO_PHONE_NUMBER || "";
      console.log(`SMS received from ${fromNumber}: ${message}`);
      
      // Log inbound message
      logTwilioMessage({
        direction: "inbound",
        source: "webhook",
        fromNumber: fromNumber,
        toNumber: twilioFromNumber,
        body: message,
        twilioSid: messageSid,
        status: "received",
      });
      
      // Immediately acknowledge receipt to Twilio (prevents timeout issues)
      res.status(200).send("OK");
      
      // Process message asynchronously
      try {
        // Find or create SMS conversation using formatted phone number
        const conversation = findOrCreateSmsConversation(fromNumber);
        
        // Store user message
        createMessage({
          conversationId: conversation.id,
          role: "user",
          content: message,
          source: "sms",
        });
        
        // Get AI response (pass phone number so ZEKE can send SMS reminders)
        const aiResponse = await chat(conversation.id, message, false, fromNumber);
        
        // Store assistant message
        createMessage({
          conversationId: conversation.id,
          role: "assistant",
          content: aiResponse,
          source: "sms",
        });
        
        // Send SMS reply via Twilio API
        if (twilioFromNumber) {
          try {
            const client = getTwilioClient();
            const result = await client.messages.create({
              body: aiResponse,
              from: twilioFromNumber,
              to: fromNumber,
            });
            
            // Log outbound reply
            logTwilioMessage({
              direction: "outbound",
              source: "reply",
              fromNumber: twilioFromNumber,
              toNumber: fromNumber,
              body: aiResponse,
              twilioSid: result.sid,
              status: "sent",
              conversationId: conversation.id,
            });
            
            console.log(`SMS reply sent to ${fromNumber}`);
          } catch (sendError: any) {
            logTwilioMessage({
              direction: "outbound",
              source: "reply",
              fromNumber: twilioFromNumber,
              toNumber: fromNumber,
              body: aiResponse,
              status: "failed",
              conversationId: conversation.id,
              errorCode: sendError.code?.toString() || "UNKNOWN",
              errorMessage: sendError.message || "Unknown error",
            });
            throw sendError;
          }
        } else {
          console.error("TWILIO_PHONE_NUMBER not configured for reply");
        }
      } catch (processError: any) {
        console.error("Error processing SMS:", processError);
        // Try to send error message
        try {
          if (twilioFromNumber) {
            const client = getTwilioClient();
            const errorMsg = "Sorry, I encountered an error. Please try again.";
            const result = await client.messages.create({
              body: errorMsg,
              from: twilioFromNumber,
              to: fromNumber,
            });
            
            logTwilioMessage({
              direction: "outbound",
              source: "reply",
              fromNumber: twilioFromNumber,
              toNumber: fromNumber,
              body: errorMsg,
              twilioSid: result.sid,
              status: "sent",
            });
          }
        } catch (sendError: any) {
          console.error("Failed to send error SMS:", sendError);
        }
      }
    } catch (error: any) {
      console.error("Twilio webhook error:", error);
      res.status(200).send("OK"); // Always return 200 to prevent retries
    }
  });
  
  // Get all memory notes
  app.get("/api/memory", async (_req, res) => {
    try {
      const notes = getAllMemoryNotes();
      res.json(notes);
    } catch (error: any) {
      console.error("Get memory error:", error);
      res.status(500).json({ message: "Failed to get memory notes" });
    }
  });
  
  // Create memory note
  app.post("/api/memory", async (req, res) => {
    try {
      const parsed = insertMemoryNoteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body" });
      }
      
      const note = createMemoryNote(parsed.data);
      res.json(note);
    } catch (error: any) {
      console.error("Create memory error:", error);
      res.status(500).json({ message: "Failed to create memory note" });
    }
  });
  
  // Delete memory note
  app.delete("/api/memory/:id", async (req, res) => {
    try {
      const { id } = req.params;
      deleteMemoryNote(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete memory error:", error);
      res.status(500).json({ message: "Failed to delete memory note" });
    }
  });
  
  // Get all preferences
  app.get("/api/preferences", async (_req, res) => {
    try {
      const prefs = getAllPreferences();
      res.json(prefs);
    } catch (error: any) {
      console.error("Get preferences error:", error);
      res.status(500).json({ message: "Failed to get preferences" });
    }
  });
  
  // Set preference
  app.post("/api/preferences", async (req, res) => {
    try {
      const parsed = insertPreferenceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body" });
      }
      
      const pref = setPreference(parsed.data);
      res.json(pref);
    } catch (error: any) {
      console.error("Set preference error:", error);
      res.status(500).json({ message: "Failed to set preference" });
    }
  });
  
  // Send outbound SMS
  // SECURITY NOTE: This is a privileged admin-only endpoint accessible from the web interface.
  // The web interface is trusted with admin permissions by design.
  app.post("/api/sms/send", async (req, res) => {
    try {
      const parsed = sendSmsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body" });
      }
      
      const { to, message } = parsed.data;
      const fromNumber = process.env.TWILIO_PHONE_NUMBER;
      
      if (!fromNumber) {
        return res.status(500).json({ message: "Twilio phone number not configured" });
      }
      
      // Log privileged operation for security audit
      console.log(`PRIVILEGED: Direct SMS send requested via web interface to ${to}`);
      
      const client = getTwilioClient();
      
      // Format phone number
      const formattedTo = formatPhoneNumber(to);
      
      try {
        const result = await client.messages.create({
          body: message,
          from: fromNumber,
          to: formattedTo,
        });
        
        logTwilioMessage({
          direction: "outbound",
          source: "web_ui",
          fromNumber: fromNumber,
          toNumber: formattedTo,
          body: message,
          twilioSid: result.sid,
          status: "sent",
        });
        
        console.log(`SMS sent to ${formattedTo}: ${result.sid}`);
        
        res.json({ 
          success: true, 
          sid: result.sid,
          to: formattedTo,
        });
      } catch (sendError: any) {
        logTwilioMessage({
          direction: "outbound",
          source: "web_ui",
          fromNumber: fromNumber,
          toNumber: formattedTo,
          body: message,
          status: "failed",
          errorCode: sendError.code?.toString() || "UNKNOWN",
          errorMessage: sendError.message || "Unknown error",
        });
        
        throw sendError;
      }
    } catch (error: any) {
      console.error("Send SMS error:", error);
      res.status(500).json({ message: error.message || "Failed to send SMS" });
    }
  });
  
  // === GROCERY LIST API ROUTES ===
  
  // Get all grocery items
  app.get("/api/grocery", async (_req, res) => {
    try {
      const items = getAllGroceryItems();
      res.json(items);
    } catch (error: any) {
      console.error("Get grocery items error:", error);
      res.status(500).json({ message: "Failed to get grocery items" });
    }
  });
  
  // Create grocery item
  app.post("/api/grocery", async (req, res) => {
    try {
      const parsed = insertGroceryItemSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
      }
      
      const item = createGroceryItem(parsed.data);
      res.json(item);
    } catch (error: any) {
      console.error("Create grocery item error:", error);
      res.status(500).json({ message: "Failed to create grocery item" });
    }
  });
  
  // Update grocery item
  app.patch("/api/grocery/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const existing = getGroceryItem(id);
      
      if (!existing) {
        return res.status(404).json({ message: "Grocery item not found" });
      }
      
      const parsed = updateGroceryItemSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
      }
      
      const item = updateGroceryItem(id, parsed.data);
      res.json(item);
    } catch (error: any) {
      console.error("Update grocery item error:", error);
      res.status(500).json({ message: "Failed to update grocery item" });
    }
  });
  
  // Toggle grocery item purchased status
  app.post("/api/grocery/:id/toggle", async (req, res) => {
    try {
      const { id } = req.params;
      const item = toggleGroceryItemPurchased(id);
      
      if (!item) {
        return res.status(404).json({ message: "Grocery item not found" });
      }
      
      res.json(item);
    } catch (error: any) {
      console.error("Toggle grocery item error:", error);
      res.status(500).json({ message: "Failed to toggle grocery item" });
    }
  });
  
  // Delete grocery item
  app.delete("/api/grocery/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const existing = getGroceryItem(id);
      
      if (!existing) {
        return res.status(404).json({ message: "Grocery item not found" });
      }
      
      deleteGroceryItem(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete grocery item error:", error);
      res.status(500).json({ message: "Failed to delete grocery item" });
    }
  });
  
  // Clear all purchased items
  app.post("/api/grocery/clear-purchased", async (_req, res) => {
    try {
      const count = clearPurchasedGroceryItems();
      res.json({ success: true, deleted: count });
    } catch (error: any) {
      console.error("Clear purchased items error:", error);
      res.status(500).json({ message: "Failed to clear purchased items" });
    }
  });
  
  // === TASKS API ROUTES ===
  
  // Get all tasks
  app.get("/api/tasks", async (req, res) => {
    try {
      const includeCompleted = req.query.includeCompleted === "true";
      const category = req.query.category as string | undefined;
      const dueToday = req.query.dueToday === "true";
      const overdue = req.query.overdue === "true";
      
      let tasks;
      if (dueToday) {
        tasks = getTasksDueToday();
      } else if (overdue) {
        tasks = getOverdueTasks();
      } else {
        tasks = getAllTasks(includeCompleted);
        if (category) {
          tasks = tasks.filter(t => t.category === category);
        }
      }
      
      res.json(tasks);
    } catch (error: any) {
      console.error("Get tasks error:", error);
      res.status(500).json({ message: "Failed to get tasks" });
    }
  });
  
  // Create task
  app.post("/api/tasks", async (req, res) => {
    try {
      const parsed = insertTaskSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
      }
      
      const task = createTask(parsed.data);
      res.json(task);
    } catch (error: any) {
      console.error("Create task error:", error);
      res.status(500).json({ message: "Failed to create task" });
    }
  });
  
  // Get single task
  app.get("/api/tasks/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const task = getTask(id);
      
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      res.json(task);
    } catch (error: any) {
      console.error("Get task error:", error);
      res.status(500).json({ message: "Failed to get task" });
    }
  });
  
  // Update task
  app.patch("/api/tasks/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const existing = getTask(id);
      
      if (!existing) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      const parsed = updateTaskSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
      }
      
      const task = updateTask(id, parsed.data);
      res.json(task);
    } catch (error: any) {
      console.error("Update task error:", error);
      res.status(500).json({ message: "Failed to update task" });
    }
  });
  
  // Toggle task completed status
  app.post("/api/tasks/:id/toggle", async (req, res) => {
    try {
      const { id } = req.params;
      const task = toggleTaskCompleted(id);
      
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      res.json(task);
    } catch (error: any) {
      console.error("Toggle task error:", error);
      res.status(500).json({ message: "Failed to toggle task" });
    }
  });
  
  // Delete task
  app.delete("/api/tasks/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const existing = getTask(id);
      
      if (!existing) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      deleteTask(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete task error:", error);
      res.status(500).json({ message: "Failed to delete task" });
    }
  });
  
  // Clear all completed tasks
  app.post("/api/tasks/clear-completed", async (_req, res) => {
    try {
      const count = clearCompletedTasks();
      res.json({ success: true, deleted: count });
    } catch (error: any) {
      console.error("Clear completed tasks error:", error);
      res.status(500).json({ message: "Failed to clear completed tasks" });
    }
  });
  
  // ==================== CONTACTS API ====================
  
  // Get all contacts
  app.get("/api/contacts", async (_req, res) => {
    try {
      const contacts = getAllContacts();
      // Enhance with message counts
      const contactsWithStats = contacts.map(contact => ({
        ...contact,
        messageCount: getMessageCountForPhone(contact.phoneNumber),
        conversations: getConversationsByPhone(contact.phoneNumber),
      }));
      res.json(contactsWithStats);
    } catch (error: any) {
      console.error("Get contacts error:", error);
      res.status(500).json({ message: "Failed to get contacts" });
    }
  });
  
  // Get single contact by ID
  app.get("/api/contacts/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const contact = getContact(id);
      
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      
      // Enhance with conversations and message count
      const enhanced = {
        ...contact,
        messageCount: getMessageCountForPhone(contact.phoneNumber),
        conversations: getConversationsByPhone(contact.phoneNumber),
      };
      
      res.json(enhanced);
    } catch (error: any) {
      console.error("Get contact error:", error);
      res.status(500).json({ message: "Failed to get contact" });
    }
  });
  
  // Get contact by phone number
  app.get("/api/contacts/phone/:phone", async (req, res) => {
    try {
      const { phone } = req.params;
      const contact = getContactByPhone(phone);
      
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      
      // Enhance with conversations and message count
      const enhanced = {
        ...contact,
        messageCount: getMessageCountForPhone(contact.phoneNumber),
        conversations: getConversationsByPhone(contact.phoneNumber),
      };
      
      res.json(enhanced);
    } catch (error: any) {
      console.error("Get contact by phone error:", error);
      res.status(500).json({ message: "Failed to get contact" });
    }
  });
  
  // Create new contact
  app.post("/api/contacts", async (req, res) => {
    try {
      const parsed = insertContactSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
      }
      
      // Check if phone number already exists
      const existing = getContactByPhone(parsed.data.phoneNumber);
      if (existing) {
        return res.status(409).json({ message: "Contact with this phone number already exists" });
      }
      
      const contact = createContact(parsed.data);
      res.json(contact);
    } catch (error: any) {
      console.error("Create contact error:", error);
      res.status(500).json({ message: "Failed to create contact" });
    }
  });
  
  // Update contact
  app.patch("/api/contacts/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const existing = getContact(id);
      
      if (!existing) {
        return res.status(404).json({ message: "Contact not found" });
      }
      
      const parsed = updateContactSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
      }
      
      // If updating phone number, check for duplicates
      if (parsed.data.phoneNumber) {
        const phoneConflict = getContactByPhone(parsed.data.phoneNumber);
        if (phoneConflict && phoneConflict.id !== id) {
          return res.status(409).json({ message: "Another contact with this phone number already exists" });
        }
      }
      
      const contact = updateContact(id, parsed.data);
      res.json(contact);
    } catch (error: any) {
      console.error("Update contact error:", error);
      res.status(500).json({ message: "Failed to update contact" });
    }
  });
  
  // Delete contact
  app.delete("/api/contacts/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const existing = getContact(id);
      
      if (!existing) {
        return res.status(404).json({ message: "Contact not found" });
      }
      
      // Prevent deleting master admin
      if (isMasterAdmin(existing.phoneNumber)) {
        return res.status(403).json({ message: "Cannot delete master admin contact" });
      }
      
      deleteContact(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete contact error:", error);
      res.status(500).json({ message: "Failed to delete contact" });
    }
  });
  
  // Get conversations for a contact
  app.get("/api/contacts/:id/conversations", async (req, res) => {
    try {
      const { id } = req.params;
      const contact = getContact(id);
      
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      
      const conversations = getConversationsByPhone(contact.phoneNumber);
      res.json(conversations);
    } catch (error: any) {
      console.error("Get contact conversations error:", error);
      res.status(500).json({ message: "Failed to get conversations" });
    }
  });
  
  // ==================== REMINDERS API ====================
  
  // Get all reminders (both pending and completed)
  app.get("/api/reminders", async (_req, res) => {
    try {
      const reminders = getAllReminders();
      res.json(reminders);
    } catch (error: any) {
      console.error("Get reminders error:", error);
      res.status(500).json({ message: "Failed to get reminders" });
    }
  });
  
  // Update reminder
  app.patch("/api/reminders/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const existing = getReminder(id);
      
      if (!existing) {
        return res.status(404).json({ message: "Reminder not found" });
      }
      
      const parsed = updateReminderSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
      }
      
      const reminder = updateReminder(id, parsed.data);
      res.json(reminder);
    } catch (error: any) {
      console.error("Update reminder error:", error);
      res.status(500).json({ message: "Failed to update reminder" });
    }
  });
  
  // Delete reminder
  app.delete("/api/reminders/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const existing = getReminder(id);
      
      if (!existing) {
        return res.status(404).json({ message: "Reminder not found" });
      }
      
      deleteReminder(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete reminder error:", error);
      res.status(500).json({ message: "Failed to delete reminder" });
    }
  });
  
  // ==================== AUTOMATIONS API ====================
  // SECURITY NOTE: Web UI automation endpoints are trusted with admin permissions by design.
  // All operations are logged for security audit trail.
  
  // Get all automations
  app.get("/api/automations", async (_req, res) => {
    try {
      const automations = getAllAutomations();
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Listed ${automations.length} automations`);
      res.json(automations);
    } catch (error: any) {
      console.error("Get automations error:", error);
      res.status(500).json({ message: "Failed to get automations" });
    }
  });
  
  // Create automation
  app.post("/api/automations", async (req, res) => {
    try {
      const parsed = insertAutomationSchema.safeParse(req.body);
      if (!parsed.success) {
        console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Failed to create automation - invalid request body`);
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
      }
      
      const automation = createAutomation(parsed.data);
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Created automation "${automation.name}" (${automation.id}) - Type: ${automation.type}, Enabled: ${automation.enabled}, Recipient: ${automation.recipientPhone || "N/A"}`);
      
      // Schedule the new automation if enabled
      if (automation.enabled) {
        scheduleAutomation(automation);
      }
      
      res.json(automation);
    } catch (error: any) {
      console.error("Create automation error:", error);
      res.status(500).json({ message: "Failed to create automation" });
    }
  });
  
  // Update automation
  app.patch("/api/automations/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const existing = getAutomation(id);
      
      if (!existing) {
        console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Failed to update automation ${id} - not found`);
        return res.status(404).json({ message: "Automation not found" });
      }
      
      const parsed = updateAutomationSchema.safeParse(req.body);
      if (!parsed.success) {
        console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Failed to update automation ${id} - invalid request body`);
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
      }
      
      const automation = updateAutomation(id, parsed.data);
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Updated automation "${existing.name}" (${id}) - Changes: ${JSON.stringify(parsed.data)}`);
      
      // Reschedule the automation (handles enable/disable and cron changes)
      if (automation) {
        scheduleAutomation(automation);
      }
      
      res.json(automation);
    } catch (error: any) {
      console.error("Update automation error:", error);
      res.status(500).json({ message: "Failed to update automation" });
    }
  });
  
  // Delete automation
  app.delete("/api/automations/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const existing = getAutomation(id);
      
      if (!existing) {
        console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Failed to delete automation ${id} - not found`);
        return res.status(404).json({ message: "Automation not found" });
      }
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Deleting automation "${existing.name}" (${id}) - Type: ${existing.type}, Recipient: ${existing.recipientPhone || "N/A"}`);
      
      // Stop the scheduled task before deleting
      stopAutomation(id);
      
      deleteAutomation(id);
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Automation ${id} deleted successfully`);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete automation error:", error);
      res.status(500).json({ message: "Failed to delete automation" });
    }
  });
  
  // Toggle automation enabled/disabled status
  app.post("/api/automations/:id/toggle", async (req, res) => {
    try {
      const { id } = req.params;
      const existing = getAutomation(id);
      
      if (!existing) {
        console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Failed to toggle automation ${id} - not found`);
        return res.status(404).json({ message: "Automation not found" });
      }
      
      const newState = !existing.enabled;
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Toggling automation "${existing.name}" (${id}) - ${existing.enabled ? "DISABLING" : "ENABLING"}`);
      
      const automation = updateAutomation(id, { enabled: newState });
      
      // Update the schedule based on new enabled state
      if (automation) {
        scheduleAutomation(automation);
        console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Automation ${id} is now ${newState ? "ENABLED" : "DISABLED"}`);
      }
      
      res.json(automation);
    } catch (error: any) {
      console.error("Toggle automation error:", error);
      res.status(500).json({ message: "Failed to toggle automation" });
    }
  });
  
  // Manually trigger an automation (for testing)
  app.post("/api/automations/:id/run", async (req, res) => {
    try {
      const { id } = req.params;
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Manual trigger requested for automation ${id}`);
      
      const result = await runAutomationNow(id);
      
      if (!result.automation) {
        console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Manual trigger failed - automation ${id} not found`);
        return res.status(404).json({ message: "Automation not found" });
      }
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Manual trigger completed for "${result.automation.name}" (${id}) - Success: ${result.success}, Message: ${result.message}`);
      res.json(result);
    } catch (error: any) {
      console.error("Run automation error:", error);
      res.status(500).json({ message: "Failed to run automation" });
    }
  });
  
  // ============================================
  // Profile Endpoints
  // ============================================
  
  // Get all profile sections
  app.get("/api/profile", async (req, res) => {
    try {
      const sections = getAllProfileSections();
      const profile: Record<string, unknown> = {};
      
      // Helper to convert snake_case to camelCase
      const toCamelCase = (str: string) => str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      
      for (const section of sections) {
        try {
          // Convert section key from snake_case (basic_info) to camelCase (basicInfo)
          const camelKey = toCamelCase(section.section);
          profile[camelKey] = JSON.parse(section.data);
        } catch {
          const camelKey = toCamelCase(section.section);
          profile[camelKey] = section.data;
        }
      }
      
      res.json(profile);
    } catch (error: any) {
      console.error("Get profile error:", error);
      res.status(500).json({ message: "Failed to get profile" });
    }
  });
  
  // Get a specific profile section
  app.get("/api/profile/:section", async (req, res) => {
    try {
      const { section } = req.params;
      const profileSection = getProfileSection(section);
      
      if (!profileSection) {
        return res.json({ section, data: {} });
      }
      
      try {
        res.json({ section, data: JSON.parse(profileSection.data), updatedAt: profileSection.updatedAt });
      } catch {
        res.json({ section, data: profileSection.data, updatedAt: profileSection.updatedAt });
      }
    } catch (error: any) {
      console.error("Get profile section error:", error);
      res.status(500).json({ message: "Failed to get profile section" });
    }
  });
  
  // Update a profile section
  app.put("/api/profile/:section", async (req, res) => {
    try {
      const { section } = req.params;
      const { data } = req.body;
      
      if (data === undefined) {
        return res.status(400).json({ message: "Data is required" });
      }
      
      const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
      const result = upsertProfileSection(section, dataStr);
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Updated profile section "${section}"`);
      
      res.json({ 
        section: result.section, 
        data: typeof data === 'string' ? data : data,
        updatedAt: result.updatedAt 
      });
    } catch (error: any) {
      console.error("Update profile section error:", error);
      res.status(500).json({ message: "Failed to update profile section" });
    }
  });
  
  // Delete a profile section
  app.delete("/api/profile/:section", async (req, res) => {
    try {
      const { section } = req.params;
      const success = deleteProfileSection(section);
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Deleted profile section "${section}" - Success: ${success}`);
      
      res.json({ success });
    } catch (error: any) {
      console.error("Delete profile section error:", error);
      res.status(500).json({ message: "Failed to delete profile section" });
    }
  });
  
  // === TWILIO MESSAGE LOG API ROUTES ===
  
  // Get all Twilio messages (with optional limit)
  app.get("/api/twilio/messages", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const messages = getAllTwilioMessages(limit);
      res.json(messages);
    } catch (error: any) {
      console.error("Get twilio messages error:", error);
      res.status(500).json({ message: "Failed to get Twilio messages" });
    }
  });
  
  // Get Twilio messages by phone number
  app.get("/api/twilio/messages/phone/:phone", async (req, res) => {
    try {
      const { phone } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const messages = getTwilioMessagesByPhone(phone, limit);
      res.json(messages);
    } catch (error: any) {
      console.error("Get twilio messages by phone error:", error);
      res.status(500).json({ message: "Failed to get Twilio messages" });
    }
  });
  
  // Get Twilio message stats
  app.get("/api/twilio/stats", async (_req, res) => {
    try {
      const stats = getTwilioMessageStats();
      res.json(stats);
    } catch (error: any) {
      console.error("Get twilio stats error:", error);
      res.status(500).json({ message: "Failed to get Twilio stats" });
    }
  });
  
  // Get unique conversation phone numbers (for sidebar)
  app.get("/api/twilio/conversations", async (_req, res) => {
    try {
      const conversations = getTwilioConversationPhones();
      res.json(conversations);
    } catch (error: any) {
      console.error("Get twilio conversations error:", error);
      res.status(500).json({ message: "Failed to get Twilio conversations" });
    }
  });
  
  // ==================== CALENDAR API ====================
  
  // Get list of all calendars (for toggle UI)
  app.get("/api/calendar/list", async (_req, res) => {
    try {
      const calendars = await listCalendars();
      res.json(calendars);
    } catch (error: any) {
      console.error("Calendar list error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch calendars" });
    }
  });
  
  // Get calendar events with optional date range and calendar filtering
  app.get("/api/calendar/events", async (req, res) => {
    try {
      const { start, end, days, calendars } = req.query;
      let events: CalendarEvent[];
      
      const calendarIds = calendars 
        ? (calendars as string).split(',').filter(Boolean) 
        : undefined;
      
      if (start && end) {
        events = await listCalendarEvents(new Date(start as string), new Date(end as string), 100, calendarIds);
      } else if (days) {
        events = await getUpcomingEvents(parseInt(days as string));
      } else {
        events = await getUpcomingEvents(7);
      }
      
      res.json(events);
    } catch (error: any) {
      console.error("Calendar fetch error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch calendar events" });
    }
  });
  
  // Get today's events
  app.get("/api/calendar/today", async (req, res) => {
    try {
      const events = await getTodaysEvents();
      res.json(events);
    } catch (error: any) {
      console.error("Calendar today fetch error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch today's events" });
    }
  });
  
  // Create a new calendar event
  app.post("/api/calendar/events", async (req, res) => {
    try {
      const { summary, startTime, endTime, description, location, allDay } = req.body;
      const event = await createCalendarEvent(
        summary,
        new Date(startTime),
        new Date(endTime),
        description,
        location,
        allDay
      );
      res.json(event);
    } catch (error: any) {
      console.error("Calendar create error:", error);
      res.status(500).json({ error: error.message || "Failed to create calendar event" });
    }
  });
  
  // Delete a calendar event
  app.delete("/api/calendar/events/:id", async (req, res) => {
    try {
      await deleteCalendarEvent(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Calendar delete error:", error);
      res.status(500).json({ error: error.message || "Failed to delete calendar event" });
    }
  });

  // Update a calendar event
  app.put("/api/calendar/events/:id", async (req, res) => {
    try {
      const { summary, startTime, endTime, description, location } = req.body;
      const updates: {
        summary?: string;
        description?: string;
        location?: string;
        startTime?: Date;
        endTime?: Date;
      } = {};
      
      if (summary) updates.summary = summary;
      if (description !== undefined) updates.description = description;
      if (location !== undefined) updates.location = location;
      if (startTime) updates.startTime = new Date(startTime);
      if (endTime) updates.endTime = new Date(endTime);
      
      const event = await updateCalendarEvent(req.params.id, updates);
      res.json(event);
    } catch (error: any) {
      console.error("Calendar update error:", error);
      res.status(500).json({ error: error.message || "Failed to update calendar event" });
    }
  });
  
  return httpServer;
}

// Helper function to escape XML special characters
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
