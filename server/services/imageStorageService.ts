/**
 * Image Storage Service Stub
 * 
 * This is a stub that provides type compatibility.
 * The actual image storage is handled by Replit Object Storage integration.
 * This file exists to prevent import errors from mmsProcessor.ts
 */

export type ImageCategory = 
  | "selfie" 
  | "people_photo" 
  | "screenshot" 
  | "document" 
  | "receipt" 
  | "food" 
  | "place" 
  | "object" 
  | "other";

export interface StoredImage {
  id: string;
  path: string;
  category: ImageCategory;
  createdAt: string;
}

export async function processAndStoreMmsImage(
  _imageUrl: string,
  _category: ImageCategory,
  _metadata?: Record<string, any>
): Promise<StoredImage | null> {
  console.log("[ImageStorageService] Stub - image storage handled by Object Storage integration");
  return null;
}
