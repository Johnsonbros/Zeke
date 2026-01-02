import { z } from "zod";

const isoDateTimeString = z
  .string()
  .describe("ISO 8601 timestamp string used for serialized dates");

const optionalNullableString = z.string().nullable().optional();
const optionalNullableNumber = z.number().int().nullable().optional();

export const taskPriorityValues = ["low", "medium", "high"] as const;
export const taskCategoryValues = ["work", "personal", "family"] as const;

export const reminderTypeValues = ["single", "sequence"] as const;

export const memoryNoteTypes = ["summary", "note", "preference", "fact"] as const;
export const memoryScopes = ["transient", "session", "long_term"] as const;

export const accessLevelValues = [
  "admin",
  "family",
  "friend",
  "business",
  "restricted",
  "unknown",
] as const;

export const messageRoleValues = ["user", "assistant"] as const;

export const conversationSourceValues = ["web", "sms", "voice", "app"] as const;

export const taskModelSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  priority: z.enum(taskPriorityValues),
  dueDate: optionalNullableString,
  category: z.enum(taskCategoryValues),
  completed: z.boolean(),
  placeId: optionalNullableString,
  parentTaskId: optionalNullableString,
  createdAt: isoDateTimeString,
  updatedAt: isoDateTimeString,
});

export type TaskModel = z.infer<typeof taskModelSchema>;

export const reminderModelSchema = z.object({
  id: z.string(),
  message: z.string(),
  recipientPhone: optionalNullableString,
  conversationId: optionalNullableString,
  scheduledFor: isoDateTimeString,
  createdAt: isoDateTimeString,
  completed: z.boolean(),
  placeId: optionalNullableString,
  parentReminderId: optionalNullableString,
  sequencePosition: optionalNullableNumber,
  sequenceTotal: optionalNullableNumber,
  type: z.enum(reminderTypeValues).default("single"),
});

export type ReminderModel = z.infer<typeof reminderModelSchema>;

export const memoryNoteModelSchema = z.object({
  id: z.string(),
  type: z.enum(memoryNoteTypes),
  content: z.string(),
  context: z.string(),
  embedding: optionalNullableString,
  isSuperseded: z.boolean(),
  supersededBy: optionalNullableString,
  placeId: optionalNullableString,
  contactId: optionalNullableString,
  sourceType: z.enum(["conversation", "lifelog", "manual", "observation"]),
  sourceId: optionalNullableString,
  scope: z.enum(memoryScopes),
  expiresAt: optionalNullableString,
  confidenceScore: z.string(),
  lastConfirmedAt: optionalNullableString,
  confirmationCount: z.number().int(),
  usageCount: z.number().int(),
  lastUsedAt: optionalNullableString,
  accessCount: z.number().int(),
  lastAccessedAt: optionalNullableString,
  heatScore: z.string(),
  isActive: z.boolean(),
  createdAt: isoDateTimeString,
  updatedAt: isoDateTimeString,
});

export type MemoryNoteModel = z.infer<typeof memoryNoteModelSchema>;

export const contactModelSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  middleName: optionalNullableString,
  phoneNumber: z.string(),
  email: optionalNullableString,
  aiAssistantPhone: optionalNullableString,
  imageUrl: optionalNullableString,
  accessLevel: z.enum(accessLevelValues),
  relationship: optionalNullableString,
  notes: optionalNullableString,
  canAccessPersonalInfo: z.boolean(),
  canAccessCalendar: z.boolean(),
  canAccessTasks: z.boolean(),
  canAccessGrocery: z.boolean(),
  canSetReminders: z.boolean(),
  birthday: optionalNullableString,
  occupation: optionalNullableString,
  organization: optionalNullableString,
  lastInteractionAt: optionalNullableString,
  interactionCount: z.number().int(),
  metadata: optionalNullableString,
  isAutoCreated: z.boolean(),
  createdAt: isoDateTimeString,
  updatedAt: isoDateTimeString,
});

export type ContactModel = z.infer<typeof contactModelSchema>;

export const conversationModelSchema = z.object({
  id: z.string(),
  title: z.string(),
  phoneNumber: optionalNullableString,
  source: z.enum(conversationSourceValues),
  mode: z.enum(["chat", "getting_to_know"]),
  summary: optionalNullableString,
  summarizedMessageCount: z.number().int().optional(),
  lastSummarizedAt: optionalNullableString,
  createdAt: isoDateTimeString,
  updatedAt: isoDateTimeString,
});

export type ConversationModel = z.infer<typeof conversationModelSchema>;

export const calendarEventModelSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  start: isoDateTimeString,
  end: isoDateTimeString,
  location: optionalNullableString,
  isAllDay: z.boolean(),
  googleCalendarId: optionalNullableString,
  createdAt: isoDateTimeString,
  updatedAt: isoDateTimeString,
});

export type CalendarEventModel = z.infer<typeof calendarEventModelSchema>;

export const messageModelSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: z.enum(messageRoleValues),
  content: z.string(),
  source: z.enum(conversationSourceValues),
  createdAt: isoDateTimeString,
});

export type MessageModel = z.infer<typeof messageModelSchema>;

export function serializeTask(task: unknown): TaskModel {
  const taskData = (typeof task === "object" && task !== null ? task : {}) as Partial<TaskModel>;

  return taskModelSchema.parse({
    description: "",
    ...taskData,
    dueDate: taskData.dueDate ?? null,
    placeId: taskData.placeId ?? null,
    parentTaskId: taskData.parentTaskId ?? null,
  });
}

export function serializeTasks(tasks: unknown[]): TaskModel[] {
  return tasks.map(serializeTask);
}

export function serializeReminder(reminder: unknown): ReminderModel {
  const reminderData = (typeof reminder === "object" && reminder !== null ? reminder : {}) as Partial<ReminderModel>;

  return reminderModelSchema.parse({
    type: "single",
    ...reminderData,
    recipientPhone: reminderData.recipientPhone ?? null,
    conversationId: reminderData.conversationId ?? null,
    placeId: reminderData.placeId ?? null,
    parentReminderId: reminderData.parentReminderId ?? null,
    sequencePosition: reminderData.sequencePosition ?? null,
    sequenceTotal: reminderData.sequenceTotal ?? null,
  });
}

export function serializeReminders(reminders: unknown[]): ReminderModel[] {
  return reminders.map(serializeReminder);
}

export function serializeMemoryNote(note: unknown): MemoryNoteModel {
  return memoryNoteModelSchema.parse(note);
}

export function serializeContact(contact: unknown): ContactModel {
  return contactModelSchema.parse(contact);
}

export function serializeConversation(conversation: unknown): ConversationModel {
  return conversationModelSchema.parse(conversation);
}

export function serializeMessage(message: unknown): MessageModel {
  return messageModelSchema.parse(message);
}
