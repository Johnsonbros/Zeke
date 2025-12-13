/**
 * Async Processing Queue for ZEKE
 * 
 * Provides a robust job queue system for processing Omi memories and other
 * background tasks. Features:
 * - Concurrent worker pool with configurable size
 * - Job status tracking (pending, processing, completed, failed)
 * - Automatic retry with exponential backoff
 * - Priority queue support
 * - Dead letter queue for failed jobs
 */

import { v4 as uuidv4 } from "uuid";

export type JobStatus = "pending" | "processing" | "completed" | "failed" | "dead";
export type JobPriority = "low" | "normal" | "high" | "urgent";

export interface Job<T = unknown> {
  id: string;
  type: string;
  payload: T;
  status: JobStatus;
  priority: JobPriority;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  error: string | null;
  result: unknown | null;
}

export interface QueueConfig {
  workerCount: number;
  maxRetries: number;
  retryDelayMs: number;
  maxQueueSize: number;
  processingTimeoutMs: number;
}

type JobProcessor<T> = (payload: T) => Promise<unknown>;

const defaultConfig: QueueConfig = {
  workerCount: 3,
  maxRetries: 3,
  retryDelayMs: 1000,
  maxQueueSize: 1000,
  processingTimeoutMs: 30000,
};

class AsyncQueue {
  private jobs: Map<string, Job> = new Map();
  private pendingQueue: string[] = [];
  private processors: Map<string, JobProcessor<unknown>> = new Map();
  private activeWorkers = 0;
  private config: QueueConfig;
  private isRunning = false;
  private processingPromises: Map<string, Promise<void>> = new Map();

  private stats = {
    totalEnqueued: 0,
    totalCompleted: 0,
    totalFailed: 0,
    totalRetried: 0,
  };

  constructor(config: Partial<QueueConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  registerProcessor<T>(jobType: string, processor: JobProcessor<T>): void {
    this.processors.set(jobType, processor as JobProcessor<unknown>);
  }

  enqueue<T>(
    jobType: string,
    payload: T,
    options: { priority?: JobPriority; maxAttempts?: number } = {}
  ): Job<T> {
    if (this.pendingQueue.length >= this.config.maxQueueSize) {
      throw new Error(`Queue full: maximum ${this.config.maxQueueSize} jobs allowed`);
    }

    const job: Job<T> = {
      id: uuidv4(),
      type: jobType,
      payload,
      status: "pending",
      priority: options.priority || "normal",
      attempts: 0,
      maxAttempts: options.maxAttempts || this.config.maxRetries,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      error: null,
      result: null,
    };

    this.jobs.set(job.id, job as Job);
    this.insertByPriority(job.id, job.priority);
    this.stats.totalEnqueued++;

    console.log(`[AsyncQueue] Enqueued job ${job.id} (${jobType}) - priority: ${job.priority}`);

    if (this.isRunning) {
      this.processNext();
    }

    return job;
  }

  private insertByPriority(jobId: string, priority: JobPriority): void {
    const priorityOrder: Record<JobPriority, number> = {
      urgent: 0,
      high: 1,
      normal: 2,
      low: 3,
    };

    const jobPriorityValue = priorityOrder[priority];
    let insertIndex = this.pendingQueue.length;

    for (let i = 0; i < this.pendingQueue.length; i++) {
      const existingJob = this.jobs.get(this.pendingQueue[i]);
      if (existingJob) {
        const existingPriority = priorityOrder[existingJob.priority];
        if (jobPriorityValue < existingPriority) {
          insertIndex = i;
          break;
        }
      }
    }

    this.pendingQueue.splice(insertIndex, 0, jobId);
  }

  private async processNext(): Promise<void> {
    if (!this.isRunning) return;
    if (this.activeWorkers >= this.config.workerCount) return;
    if (this.pendingQueue.length === 0) return;

    const jobId = this.pendingQueue.shift();
    if (!jobId) return;

    const job = this.jobs.get(jobId);
    if (!job) return;

    const processor = this.processors.get(job.type);
    if (!processor) {
      job.status = "failed";
      job.error = `No processor registered for job type: ${job.type}`;
      console.error(`[AsyncQueue] ${job.error}`);
      return;
    }

    this.activeWorkers++;
    job.status = "processing";
    job.startedAt = new Date();
    job.attempts++;

    const processingPromise = this.executeJob(job, processor);
    this.processingPromises.set(jobId, processingPromise);

    processingPromise
      .finally(() => {
        this.activeWorkers--;
        this.processingPromises.delete(jobId);
        this.processNext();
      });

    this.processNext();
  }

  private async executeJob(job: Job, processor: JobProcessor<unknown>): Promise<void> {
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Job processing timeout")), this.config.processingTimeoutMs);
      });

      const result = await Promise.race([
        processor(job.payload),
        timeoutPromise,
      ]);

      job.status = "completed";
      job.completedAt = new Date();
      job.result = result;
      this.stats.totalCompleted++;

      console.log(`[AsyncQueue] Job ${job.id} (${job.type}) completed successfully`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      job.error = errorMessage;

      if (job.attempts < job.maxAttempts) {
        job.status = "pending";
        this.stats.totalRetried++;

        const delay = this.config.retryDelayMs * Math.pow(2, job.attempts - 1);
        console.log(`[AsyncQueue] Job ${job.id} failed, retrying in ${delay}ms (attempt ${job.attempts}/${job.maxAttempts})`);

        setTimeout(() => {
          if (this.isRunning && job.status === "pending") {
            this.insertByPriority(job.id, job.priority);
            this.processNext();
          }
        }, delay);

      } else {
        job.status = "dead";
        job.completedAt = new Date();
        this.stats.totalFailed++;

        console.error(`[AsyncQueue] Job ${job.id} (${job.type}) moved to dead letter queue after ${job.attempts} attempts: ${errorMessage}`);
      }
    }
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[AsyncQueue] Started with ${this.config.workerCount} workers`);

    for (let i = 0; i < this.config.workerCount; i++) {
      this.processNext();
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.processingPromises.size > 0) {
      console.log(`[AsyncQueue] Waiting for ${this.processingPromises.size} jobs to complete...`);
      await Promise.all(this.processingPromises.values());
    }

    console.log("[AsyncQueue] Stopped");
  }

  getJob(jobId: string): Job | undefined {
    return this.jobs.get(jobId);
  }

  getJobsByStatus(status: JobStatus): Job[] {
    return Array.from(this.jobs.values()).filter(job => job.status === status);
  }

  getJobsByType(type: string): Job[] {
    return Array.from(this.jobs.values()).filter(job => job.type === type);
  }

  getStats(): {
    totalEnqueued: number;
    totalCompleted: number;
    totalFailed: number;
    totalRetried: number;
    pending: number;
    processing: number;
    activeWorkers: number;
    queueSize: number;
  } {
    return {
      ...this.stats,
      pending: this.pendingQueue.length,
      processing: this.getJobsByStatus("processing").length,
      activeWorkers: this.activeWorkers,
      queueSize: this.jobs.size,
    };
  }

  clearCompleted(): number {
    let cleared = 0;
    for (const [id, job] of this.jobs) {
      if (job.status === "completed") {
        this.jobs.delete(id);
        cleared++;
      }
    }
    return cleared;
  }

  retryDeadJobs(): number {
    let retried = 0;
    for (const job of this.jobs.values()) {
      if (job.status === "dead") {
        job.status = "pending";
        job.attempts = 0;
        job.error = null;
        this.insertByPriority(job.id, job.priority);
        retried++;
      }
    }

    if (retried > 0 && this.isRunning) {
      this.processNext();
    }

    return retried;
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

export const memoryProcessingQueue = new AsyncQueue({
  workerCount: 3,
  maxRetries: 3,
  retryDelayMs: 2000,
  maxQueueSize: 500,
  processingTimeoutMs: 60000,
});

export { AsyncQueue };
