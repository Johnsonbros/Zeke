/**
 * Grocery Auto-Clear Job Tests
 *
 * Tests the scheduled background job that automatically clears
 * old purchased grocery items based on configured time threshold.
 *
 * Run with: npx vitest server/__tests__/jobs/groceryAutoClear.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the database functions before importing the job
vi.mock("../../db", () => ({
  getGroceryAutoClearHours: vi.fn(),
  clearOldPurchasedGroceryItems: vi.fn(),
}));

// Mock node-cron
vi.mock("node-cron", () => ({
  schedule: vi.fn((_, callback) => ({
    stop: vi.fn(),
  })),
}));

import {
  initializeGroceryAutoClear,
  stopGroceryAutoClear,
} from "../../jobs/groceryAutoClear";
import { getGroceryAutoClearHours, clearOldPurchasedGroceryItems } from "../../db";
import * as cron from "node-cron";

describe("Grocery Auto-Clear Job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopGroceryAutoClear();
  });

  describe("initializeGroceryAutoClear", () => {
    it("should schedule a cron job that runs hourly", () => {
      initializeGroceryAutoClear();

      expect(cron.schedule).toHaveBeenCalledWith(
        "0 * * * *",
        expect.any(Function)
      );
    });

    it("should stop existing schedule before starting new one", () => {
      const mockStop = vi.fn();
      vi.mocked(cron.schedule).mockReturnValueOnce({
        stop: mockStop,
      } as unknown as cron.ScheduledTask);

      // First initialization
      initializeGroceryAutoClear();

      // Second initialization should stop the first one
      initializeGroceryAutoClear();

      expect(mockStop).toHaveBeenCalled();
    });

    it("should run auto-clear immediately on initialization", async () => {
      vi.mocked(getGroceryAutoClearHours).mockResolvedValue(24);
      vi.mocked(clearOldPurchasedGroceryItems).mockResolvedValue(5);

      initializeGroceryAutoClear();

      // Allow async operations to complete
      await vi.waitFor(() => {
        expect(getGroceryAutoClearHours).toHaveBeenCalled();
      });
    });
  });

  describe("stopGroceryAutoClear", () => {
    it("should stop the scheduled task if one exists", () => {
      const mockStop = vi.fn();
      vi.mocked(cron.schedule).mockReturnValue({
        stop: mockStop,
      } as unknown as cron.ScheduledTask);

      initializeGroceryAutoClear();
      stopGroceryAutoClear();

      expect(mockStop).toHaveBeenCalled();
    });

    it("should not throw if no task exists", () => {
      expect(() => stopGroceryAutoClear()).not.toThrow();
    });
  });

  describe("runAutoClear (behavior)", () => {
    it("should skip clearing when autoClearHours is 0 (disabled)", async () => {
      vi.mocked(getGroceryAutoClearHours).mockResolvedValue(0);

      initializeGroceryAutoClear();

      await vi.waitFor(() => {
        expect(getGroceryAutoClearHours).toHaveBeenCalled();
      });

      expect(clearOldPurchasedGroceryItems).not.toHaveBeenCalled();
    });

    it("should skip clearing when autoClearHours is negative", async () => {
      vi.mocked(getGroceryAutoClearHours).mockResolvedValue(-1);

      initializeGroceryAutoClear();

      await vi.waitFor(() => {
        expect(getGroceryAutoClearHours).toHaveBeenCalled();
      });

      expect(clearOldPurchasedGroceryItems).not.toHaveBeenCalled();
    });

    it("should clear items when autoClearHours is positive", async () => {
      vi.mocked(getGroceryAutoClearHours).mockResolvedValue(48);
      vi.mocked(clearOldPurchasedGroceryItems).mockResolvedValue(3);

      initializeGroceryAutoClear();

      await vi.waitFor(() => {
        expect(clearOldPurchasedGroceryItems).toHaveBeenCalledWith(48);
      });
    });

    it("should handle database errors gracefully", async () => {
      vi.mocked(getGroceryAutoClearHours).mockRejectedValue(
        new Error("Database connection error")
      );

      // Should not throw even when database fails
      expect(() => initializeGroceryAutoClear()).not.toThrow();
    });
  });
});
