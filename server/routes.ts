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
  deleteAutomation
} from "./db";
import { generateContextualQuestion } from "./gettingToKnow";
import { chat } from "./agent";
import { setSendSmsCallback, restorePendingReminders } from "./tools";
import { setDailyCheckInSmsCallback, initializeDailyCheckIn } from "./dailyCheckIn";
import { chatRequestSchema, insertMemoryNoteSchema, insertPreferenceSchema, insertGroceryItemSchema, updateGroceryItemSchema, insertTaskSchema, updateTaskSchema, insertContactSchema, updateContactSchema, insertAutomationSchema, type Automation, type InsertAutomation } from "@shared/schema";
import twilio from "twilio";
import { z } from "zod";

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
  
  // Set up SMS callback for tools (reminders)
  setSendSmsCallback(async (phone: string, message: string) => {
    const twilioFromNumber = process.env.TWILIO_PHONE_NUMBER;
    if (!twilioFromNumber) {
      console.error("TWILIO_PHONE_NUMBER not configured for reminder SMS");
      return;
    }
    
    try {
      const client = getTwilioClient();
      const formattedPhone = formatPhoneNumber(phone);
      await client.messages.create({
        body: message,
        from: twilioFromNumber,
        to: formattedPhone,
      });
      console.log(`Reminder SMS sent to ${formattedPhone}`);
    } catch (error) {
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
    
    try {
      const client = getTwilioClient();
      const formattedPhone = formatPhoneNumber(phone);
      await client.messages.create({
        body: message,
        from: twilioFromNumber,
        to: formattedPhone,
      });
      console.log(`Daily check-in SMS sent to ${formattedPhone}`);
    } catch (error) {
      console.error("Failed to send daily check-in SMS:", error);
      throw error;
    }
  });
  initializeDailyCheckIn();
  
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
      
      const { Body: message, From: rawFromNumber } = req.body;
      
      if (!message || !rawFromNumber) {
        console.log("Missing message or phone number in webhook");
        return res.status(200).send("OK"); // Return 200 to prevent Twilio retries
      }
      
      // Format phone number consistently
      const fromNumber = formatPhoneNumber(rawFromNumber);
      console.log(`SMS received from ${fromNumber}: ${message}`);
      
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
        const twilioFromNumber = process.env.TWILIO_PHONE_NUMBER;
        if (twilioFromNumber) {
          const client = getTwilioClient();
          await client.messages.create({
            body: aiResponse,
            from: twilioFromNumber,
            to: fromNumber,
          });
          console.log(`SMS reply sent to ${fromNumber}`);
        } else {
          console.error("TWILIO_PHONE_NUMBER not configured for reply");
        }
      } catch (processError: any) {
        console.error("Error processing SMS:", processError);
        // Try to send error message
        try {
          const twilioFromNumber = process.env.TWILIO_PHONE_NUMBER;
          if (twilioFromNumber) {
            const client = getTwilioClient();
            await client.messages.create({
              body: "Sorry, I encountered an error. Please try again.",
              from: twilioFromNumber,
              to: fromNumber,
            });
          }
        } catch (sendError) {
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
      
      const result = await client.messages.create({
        body: message,
        from: fromNumber,
        to: formattedTo,
      });
      
      console.log(`SMS sent to ${formattedTo}: ${result.sid}`);
      
      res.json({ 
        success: true, 
        sid: result.sid,
        to: formattedTo,
      });
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
  
  // Get all automations
  app.get("/api/automations", async (_req, res) => {
    try {
      const automations = getAllAutomations();
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
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
      }
      
      const automation = createAutomation(parsed.data);
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
        return res.status(404).json({ message: "Automation not found" });
      }
      
      const parsed = updateAutomationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
      }
      
      const automation = updateAutomation(id, parsed.data);
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
        return res.status(404).json({ message: "Automation not found" });
      }
      
      deleteAutomation(id);
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
        return res.status(404).json({ message: "Automation not found" });
      }
      
      const automation = updateAutomation(id, { enabled: !existing.enabled });
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
      const existing = getAutomation(id);
      
      if (!existing) {
        return res.status(404).json({ message: "Automation not found" });
      }
      
      // Log the manual trigger (actual execution will be implemented in task 6)
      console.log(`Manual trigger requested for automation: ${existing.name} (${existing.id}) - Type: ${existing.type}`);
      
      res.json({ 
        success: true, 
        message: `Automation "${existing.name}" triggered manually`,
        automation: existing
      });
    } catch (error: any) {
      console.error("Run automation error:", error);
      res.status(500).json({ message: "Failed to run automation" });
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
