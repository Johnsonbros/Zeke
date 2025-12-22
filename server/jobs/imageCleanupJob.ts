import cron from "node-cron";
import { 
  getExpiredImages, 
  deleteStoredImage, 
  getAllStoredImages,
  type StoredImage 
} from "../services/imageStorageService";
import { ObjectStorageService } from "../replit_integrations/object_storage";

const objectStorage = new ObjectStorageService();

let isCleanupRunning = false;
let cleanupJob: cron.ScheduledTask | null = null;
let isJobStarted = false;

export async function cleanupExpiredImages(): Promise<{
  checked: number;
  deleted: number;
  errors: number;
}> {
  if (isCleanupRunning) {
    console.log("[ImageCleanup] Cleanup already in progress, skipping");
    return { checked: 0, deleted: 0, errors: 0 };
  }

  isCleanupRunning = true;
  const stats = { checked: 0, deleted: 0, errors: 0 };

  try {
    const expiredImages = getExpiredImages();
    stats.checked = expiredImages.length;

    console.log(`[ImageCleanup] Found ${expiredImages.length} expired images to clean up`);

    for (const image of expiredImages) {
      try {
        try {
          const objectFile = await objectStorage.getObjectEntityFile(image.objectPath);
          await objectFile.delete();
        } catch (storageError: any) {
          if (!storageError.message?.includes("not found") && storageError.code !== 404) {
            throw storageError;
          }
        }
        
        deleteStoredImage(image.id);
        stats.deleted++;
        
        console.log(`[ImageCleanup] Deleted: ${image.objectPath} (category: ${image.category})`);
      } catch (error: any) {
        console.error(`[ImageCleanup] Failed to delete ${image.objectPath}:`, error.message);
        stats.errors++;
      }
    }

    console.log(`[ImageCleanup] Complete: ${stats.deleted} deleted, ${stats.errors} errors`);
  } catch (error: any) {
    console.error("[ImageCleanup] Job failed:", error);
  } finally {
    isCleanupRunning = false;
  }

  return stats;
}

export function getImageStorageStats(): {
  totalImages: number;
  totalSize: number;
  byCategory: Record<string, { count: number; size: number }>;
  expiringSoon: number;
} {
  const images = getAllStoredImages();
  const now = new Date();
  const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const byCategory: Record<string, { count: number; size: number }> = {};
  let totalSize = 0;
  let expiringSoon = 0;

  for (const image of images) {
    totalSize += image.size;

    if (!byCategory[image.category]) {
      byCategory[image.category] = { count: 0, size: 0 };
    }
    byCategory[image.category].count++;
    byCategory[image.category].size += image.size;

    if (image.expiresAt) {
      const expiresAt = new Date(image.expiresAt);
      if (expiresAt <= oneDayFromNow) {
        expiringSoon++;
      }
    }
  }

  return {
    totalImages: images.length,
    totalSize,
    byCategory,
    expiringSoon,
  };
}

export function startImageCleanupJob(): void {
  if (isJobStarted) {
    console.log("[ImageCleanup] Job already started, skipping duplicate start");
    return;
  }

  if (cleanupJob) {
    cleanupJob.stop();
    cleanupJob = null;
  }

  cleanupJob = cron.schedule("0 3 * * *", async () => {
    console.log("[ImageCleanup] Running daily cleanup at 3 AM");
    await cleanupExpiredImages();
  });

  isJobStarted = true;
  console.log("[ImageCleanup] Daily cleanup job scheduled for 3 AM");
}

export function stopImageCleanupJob(): void {
  if (cleanupJob) {
    cleanupJob.stop();
    cleanupJob = null;
    isJobStarted = false;
    console.log("[ImageCleanup] Job stopped");
  }
}

export function isCleanupJobRunning(): boolean {
  return isJobStarted;
}
