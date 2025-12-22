import { ObjectStorageService } from "../replit_integrations/object_storage";
import { createHash } from "crypto";
import { v4 as uuidv4 } from "uuid";
import Database from "better-sqlite3";

const objectStorage = new ObjectStorageService();

const db = new Database("zeke.db");

export const imageCategories = [
  "selfie",
  "people_photo",
  "screenshot",
  "document",
  "receipt",
  "business_card",
  "location",
  "meme",
  "casual",
  "unknown",
] as const;

export type ImageCategory = typeof imageCategories[number];

export interface StoredImage {
  id: string;
  objectPath: string;
  originalUrl: string | null;
  contentType: string;
  size: number;
  hash: string;
  relevanceScore: number;
  category: ImageCategory;
  senderPhone: string | null;
  senderName: string | null;
  conversationId: string | null;
  messageText: string | null;
  detectedPeople: number | null;
  detectedObjects: string | null;
  extractedText: string | null;
  isMemoryWorthy: boolean;
  linkedMemoryId: string | null;
  linkedContactId: string | null;
  createdAt: string;
  expiresAt: string | null;
}

export interface ImageMetadata {
  senderPhone?: string;
  senderName?: string;
  conversationId?: string;
  messageText?: string;
  detectedPeople?: number;
  detectedObjects?: string[];
  extractedText?: string;
  isMemoryWorthy?: boolean;
  linkedMemoryId?: string;
  linkedContactId?: string;
}

const RETENTION_DAYS: Record<ImageCategory, number> = {
  selfie: -1,
  people_photo: -1,
  screenshot: 7,
  document: 30,
  receipt: 90,
  business_card: 30,
  location: -1,
  meme: 1,
  casual: 3,
  unknown: 7,
};

const RELEVANCE_THRESHOLD = 6;

interface StoredImageRow {
  id: string;
  object_path: string;
  original_url: string | null;
  content_type: string;
  size: number;
  hash: string;
  relevance_score: number;
  category: string;
  sender_phone: string | null;
  sender_name: string | null;
  conversation_id: string | null;
  message_text: string | null;
  detected_people: number | null;
  detected_objects: string | null;
  extracted_text: string | null;
  is_memory_worthy: number;
  linked_memory_id: string | null;
  linked_contact_id: string | null;
  created_at: string;
  expires_at: string | null;
}

function mapRow(row: StoredImageRow): StoredImage {
  return {
    id: row.id,
    objectPath: row.object_path,
    originalUrl: row.original_url,
    contentType: row.content_type,
    size: row.size,
    hash: row.hash,
    relevanceScore: row.relevance_score,
    category: row.category as ImageCategory,
    senderPhone: row.sender_phone,
    senderName: row.sender_name,
    conversationId: row.conversation_id,
    messageText: row.message_text,
    detectedPeople: row.detected_people,
    detectedObjects: row.detected_objects,
    extractedText: row.extracted_text,
    isMemoryWorthy: row.is_memory_worthy === 1,
    linkedMemoryId: row.linked_memory_id,
    linkedContactId: row.linked_contact_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export function computeImageHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex").substring(0, 16);
}

export function classifyImage(analysisResult: {
  description?: string;
  extractedText?: string;
  personAnalysis?: { hasPeople?: boolean; peopleCount?: number };
  objects?: string[];
  contactInfo?: { phoneNumbers?: string[]; emails?: string[] };
}): ImageCategory {
  const desc = (analysisResult.description || "").toLowerCase();
  const text = analysisResult.extractedText || "";
  const hasPeople = analysisResult.personAnalysis?.hasPeople;
  const peopleCount = analysisResult.personAnalysis?.peopleCount || 0;
  const hasContactInfo = (analysisResult.contactInfo?.phoneNumbers?.length || 0) > 0 ||
                         (analysisResult.contactInfo?.emails?.length || 0) > 0;

  if (desc.includes("screenshot") || desc.includes("screen capture") || desc.includes("phone screen")) {
    return "screenshot";
  }

  if (desc.includes("receipt") || desc.includes("invoice") || text.match(/\$[\d,]+\.\d{2}/)) {
    return "receipt";
  }

  if (hasContactInfo || desc.includes("business card") || desc.includes("contact card")) {
    return "business_card";
  }

  if (desc.includes("document") || desc.includes("paper") || desc.includes("form")) {
    return "document";
  }

  if (desc.includes("selfie") || (peopleCount === 1 && desc.includes("close"))) {
    return "selfie";
  }

  if (hasPeople && peopleCount > 0) {
    return "people_photo";
  }

  if (desc.includes("meme") || desc.includes("funny") || desc.includes("comic")) {
    return "meme";
  }

  if (desc.includes("location") || desc.includes("landmark") || desc.includes("building") || desc.includes("street")) {
    return "location";
  }

  return "casual";
}

export function calculateRelevanceScore(
  category: ImageCategory,
  analysisResult: {
    personAnalysis?: { hasPeople?: boolean; peopleCount?: number };
    contactInfo?: { phoneNumbers?: string[]; emails?: string[] };
    extractedText?: string;
  }
): number {
  const categoryScores: Record<ImageCategory, number> = {
    selfie: 8,
    people_photo: 8,
    business_card: 9,
    receipt: 7,
    document: 6,
    location: 7,
    screenshot: 5,
    meme: 2,
    casual: 3,
    unknown: 4,
  };

  let score = categoryScores[category] || 5;

  if (analysisResult.personAnalysis?.hasPeople) {
    score += 1;
  }

  if ((analysisResult.contactInfo?.phoneNumbers?.length || 0) > 0) {
    score += 1;
  }

  if ((analysisResult.contactInfo?.emails?.length || 0) > 0) {
    score += 1;
  }

  if (analysisResult.extractedText && analysisResult.extractedText.length > 50) {
    score += 1;
  }

  return Math.min(score, 10);
}

export function shouldStoreImage(relevanceScore: number): boolean {
  return relevanceScore >= RELEVANCE_THRESHOLD;
}

export function getExpirationDate(category: ImageCategory): string | undefined {
  const days = RETENTION_DAYS[category];
  if (days < 0) {
    return undefined;
  }
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt.toISOString();
}

export async function storeImageToObjectStorage(
  buffer: Buffer,
  contentType: string,
  category: ImageCategory
): Promise<{ objectPath: string }> {
  const extension = contentType.split("/")[1] || "jpg";
  const filename = `${category}/${uuidv4()}.${extension}`;
  
  const uploadUrl = await objectStorage.getObjectEntityUploadURL();
  const objectPath = objectStorage.normalizeObjectEntityPath(uploadUrl);

  const response = await fetch(uploadUrl, {
    method: "PUT",
    body: buffer,
    headers: {
      "Content-Type": contentType,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to upload image to object storage: ${response.status}`);
  }

  console.log(`[ImageStorage] Stored image: ${objectPath} (${category})`);
  
  return { objectPath };
}

export function createStoredImage(data: {
  objectPath: string;
  originalUrl?: string;
  contentType: string;
  size: number;
  hash: string;
  relevanceScore: number;
  category: ImageCategory;
  metadata: ImageMetadata;
  expiresAt?: string;
}): StoredImage {
  const id = uuidv4();
  const now = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO stored_images (
      id, object_path, original_url, content_type, size, hash, relevance_score, category,
      sender_phone, sender_name, conversation_id, message_text, detected_people, 
      detected_objects, extracted_text, is_memory_worthy, linked_memory_id, 
      linked_contact_id, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.objectPath,
    data.originalUrl || null,
    data.contentType,
    data.size,
    data.hash,
    data.relevanceScore,
    data.category,
    data.metadata.senderPhone || null,
    data.metadata.senderName || null,
    data.metadata.conversationId || null,
    data.metadata.messageText || null,
    data.metadata.detectedPeople || null,
    data.metadata.detectedObjects ? JSON.stringify(data.metadata.detectedObjects) : null,
    data.metadata.extractedText || null,
    data.metadata.isMemoryWorthy ? 1 : 0,
    data.metadata.linkedMemoryId || null,
    data.metadata.linkedContactId || null,
    now,
    data.expiresAt || null
  );
  
  return {
    id,
    objectPath: data.objectPath,
    originalUrl: data.originalUrl || null,
    contentType: data.contentType,
    size: data.size,
    hash: data.hash,
    relevanceScore: data.relevanceScore,
    category: data.category,
    senderPhone: data.metadata.senderPhone || null,
    senderName: data.metadata.senderName || null,
    conversationId: data.metadata.conversationId || null,
    messageText: data.metadata.messageText || null,
    detectedPeople: data.metadata.detectedPeople || null,
    detectedObjects: data.metadata.detectedObjects ? JSON.stringify(data.metadata.detectedObjects) : null,
    extractedText: data.metadata.extractedText || null,
    isMemoryWorthy: data.metadata.isMemoryWorthy || false,
    linkedMemoryId: data.metadata.linkedMemoryId || null,
    linkedContactId: data.metadata.linkedContactId || null,
    createdAt: now,
    expiresAt: data.expiresAt || null,
  };
}

export function getStoredImage(id: string): StoredImage | undefined {
  const row = db.prepare(`SELECT * FROM stored_images WHERE id = ?`).get(id) as StoredImageRow | undefined;
  return row ? mapRow(row) : undefined;
}

export function getStoredImageByHash(hash: string): StoredImage | undefined {
  const row = db.prepare(`SELECT * FROM stored_images WHERE hash = ?`).get(hash) as StoredImageRow | undefined;
  return row ? mapRow(row) : undefined;
}

export function getAllStoredImages(): StoredImage[] {
  const rows = db.prepare(`SELECT * FROM stored_images ORDER BY created_at DESC`).all() as StoredImageRow[];
  return rows.map(mapRow);
}

export function getExpiredImages(): StoredImage[] {
  const now = new Date().toISOString();
  const rows = db.prepare(`
    SELECT * FROM stored_images 
    WHERE expires_at IS NOT NULL AND expires_at < ?
    ORDER BY expires_at ASC
  `).all(now) as StoredImageRow[];
  return rows.map(mapRow);
}

export function deleteStoredImage(id: string): boolean {
  const result = db.prepare(`DELETE FROM stored_images WHERE id = ?`).run(id);
  return result.changes > 0;
}

export function getStoredImagesByCategory(category: ImageCategory): StoredImage[] {
  const rows = db.prepare(`SELECT * FROM stored_images WHERE category = ? ORDER BY created_at DESC`).all(category) as StoredImageRow[];
  return rows.map(mapRow);
}

export function getStoredImagesByConversation(conversationId: string): StoredImage[] {
  const rows = db.prepare(`SELECT * FROM stored_images WHERE conversation_id = ? ORDER BY created_at DESC`).all(conversationId) as StoredImageRow[];
  return rows.map(mapRow);
}

export async function processAndStoreMmsImage(
  buffer: Buffer,
  contentType: string,
  originalUrl: string,
  analysisResult: {
    description?: string;
    extractedText?: string;
    personAnalysis?: { hasPeople?: boolean; peopleCount?: number };
    objects?: string[];
    contactInfo?: { phoneNumbers?: string[]; emails?: string[] };
  },
  context: {
    senderPhone?: string;
    senderName?: string;
    conversationId?: string;
    messageText?: string;
  }
): Promise<StoredImage | null> {
  const hash = computeImageHash(buffer);
  
  const existingImage = getStoredImageByHash(hash);
  if (existingImage) {
    console.log(`[ImageStorage] Duplicate image detected, skipping: ${hash}`);
    return existingImage;
  }

  const category = classifyImage(analysisResult);
  const relevanceScore = calculateRelevanceScore(category, analysisResult);

  console.log(`[ImageStorage] Classified as ${category}, relevance: ${relevanceScore}/10`);

  if (!shouldStoreImage(relevanceScore)) {
    console.log(`[ImageStorage] Skipping storage (score ${relevanceScore} < ${RELEVANCE_THRESHOLD})`);
    return null;
  }

  try {
    const { objectPath } = await storeImageToObjectStorage(buffer, contentType, category);

    const storedImage = createStoredImage({
      objectPath,
      originalUrl,
      contentType,
      size: buffer.length,
      hash,
      relevanceScore,
      category,
      metadata: {
        ...context,
        detectedPeople: analysisResult.personAnalysis?.peopleCount,
        detectedObjects: analysisResult.objects,
        extractedText: analysisResult.extractedText,
        isMemoryWorthy: relevanceScore >= 8,
      },
      expiresAt: getExpirationDate(category),
    });

    console.log(`[ImageStorage] Successfully stored image ${storedImage.id}`);

    return storedImage;
  } catch (error: any) {
    console.error(`[ImageStorage] Failed to store image:`, error);
    return null;
  }
}
