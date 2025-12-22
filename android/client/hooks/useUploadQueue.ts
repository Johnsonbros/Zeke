import { useEffect, useState, useCallback } from "react";
import { UploadQueueProcessor } from "@/lib/upload-queue";

interface QueueStats {
  pending: number;
  syncing: number;
  synced: number;
  failed: number;
  totalSize: number;
}

interface UploadProgress {
  recordingId: string;
  status: string;
  attempt?: number;
  maxAttempts?: number;
}

/**
 * Hook for monitoring and interacting with the upload queue
 */
export function useUploadQueue() {
  const [stats, setStats] = useState<QueueStats>({
    pending: 0,
    syncing: 0,
    synced: 0,
    failed: 0,
    totalSize: 0,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastProgress, setLastProgress] = useState<UploadProgress | null>(null);

  useEffect(() => {
    // Subscribe to upload events
    const unsubscribe = UploadQueueProcessor.onEvent((event) => {
      if (
        event.type === "progress" ||
        event.type === "success" ||
        event.type === "failed" ||
        event.type === "retrying"
      ) {
        setLastProgress({
          recordingId: event.recordingId,
          status: event.status || "",
          attempt: event.attempt,
          maxAttempts: event.maxAttempts,
        });
      }

      if (event.type === "started") {
        setIsProcessing(true);
      }

      if (event.type === "completed") {
        setIsProcessing(false);
      }
    });

    // Update stats periodically
    const statsInterval = setInterval(async () => {
      const newStats = await UploadQueueProcessor.getQueueStats();
      setStats(newStats);
    }, 500);

    return () => {
      unsubscribe();
      clearInterval(statsInterval);
    };
  }, []);

  const retryFailed = useCallback(
    async (recordingId: string) => {
      await UploadQueueProcessor.retryRecording(recordingId);
    },
    []
  );

  return {
    stats,
    isProcessing,
    lastProgress,
    retryFailed,
  };
}
