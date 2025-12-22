import { createMemoryWithEmbedding } from "./semanticMemory";
import { getContactByPhone, getContactFullName, type Contact } from "./db";

interface PendingMemory {
  memoryContent: string;
  imageId?: string;
  senderPhone: string;
  senderName?: string;
  timestamp: number;
  expiresAt: number;
  context?: string;
  matchedContactNames?: string[];
}

const pendingMemories: Map<string, PendingMemory> = new Map();

const PENDING_MEMORY_EXPIRY_MS = 10 * 60 * 1000;

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function setPendingMemory(
  phoneNumber: string,
  memoryContent: string,
  options: {
    imageId?: string;
    senderName?: string;
    context?: string;
    matchedContactNames?: string[];
  } = {}
): void {
  const normalizedPhone = normalizePhone(phoneNumber);
  const now = Date.now();
  const expiresAt = now + PENDING_MEMORY_EXPIRY_MS;

  pendingMemories.set(normalizedPhone, {
    memoryContent,
    imageId: options.imageId,
    senderPhone: phoneNumber,
    senderName: options.senderName,
    timestamp: now,
    expiresAt,
    context: options.context,
    matchedContactNames: options.matchedContactNames,
  });

  console.log(`[PendingMemory] Set pending memory for ${normalizedPhone}: "${memoryContent.substring(0, 50)}..."`);
}

export function getPendingMemory(phoneNumber: string): PendingMemory | null {
  const normalizedPhone = normalizePhone(phoneNumber);
  const pending = pendingMemories.get(normalizedPhone);

  if (!pending) {
    return null;
  }

  const now = Date.now();
  if (now > pending.expiresAt) {
    pendingMemories.delete(normalizedPhone);
    console.log(`[PendingMemory] Expired pending memory for ${normalizedPhone}`);
    return null;
  }

  return pending;
}

export function clearPendingMemory(phoneNumber: string): void {
  const normalizedPhone = normalizePhone(phoneNumber);
  pendingMemories.delete(normalizedPhone);
  console.log(`[PendingMemory] Cleared pending memory for ${normalizedPhone}`);
}

export function hasPendingMemory(phoneNumber: string): boolean {
  return getPendingMemory(phoneNumber) !== null;
}

export async function confirmPendingMemory(phoneNumber: string): Promise<string | null> {
  const pending = getPendingMemory(phoneNumber);

  if (!pending) {
    return null;
  }

  try {
    const contact = getContactByPhone(pending.senderPhone);
    
    const result = await createMemoryWithEmbedding({
      type: "note",
      content: pending.memoryContent,
      context: pending.context || `From photo shared via SMS`,
      sourceType: "observation",
      contactId: contact?.id,
    });

    clearPendingMemory(phoneNumber);

    if (result.wasCreated) {
      console.log(`[PendingMemory] Confirmed and saved: "${pending.memoryContent.substring(0, 50)}..."`);
      return pending.memoryContent;
    } else if (result.isDuplicate) {
      console.log(`[PendingMemory] Duplicate detected, skipped: "${pending.memoryContent.substring(0, 50)}..."`);
      return pending.memoryContent;
    }

    return pending.memoryContent;
  } catch (error: any) {
    console.error(`[PendingMemory] Failed to save: ${error.message}`);
    clearPendingMemory(phoneNumber);
    return null;
  }
}

export function rejectPendingMemory(phoneNumber: string): boolean {
  const pending = getPendingMemory(phoneNumber);

  if (!pending) {
    return false;
  }

  clearPendingMemory(phoneNumber);
  console.log(`[PendingMemory] Rejected by user: "${pending.memoryContent.substring(0, 50)}..."`);
  return true;
}

export function cleanupExpiredPendingMemories(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [phone, pending] of pendingMemories.entries()) {
    if (now > pending.expiresAt) {
      pendingMemories.delete(phone);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[PendingMemory] Cleaned up ${cleaned} expired pending memories`);
  }

  return cleaned;
}

export function generateMemoryConfirmationMessage(memoryContent: string): string {
  const truncated = memoryContent.length > 100 
    ? memoryContent.substring(0, 100) + "..." 
    : memoryContent;
  
  return `Save this memory?\n"${truncated}"\n\nReply Y to save, N to skip.`;
}
