import * as cron from "node-cron";
import { getGroceryAutoClearHours, clearOldPurchasedGroceryItems } from "../db";

let scheduledTask: cron.ScheduledTask | null = null;

async function runAutoClear(): Promise<void> {
  try {
    const autoClearHours = getGroceryAutoClearHours();
    
    if (autoClearHours <= 0) {
      return;
    }
    
    const cleared = clearOldPurchasedGroceryItems(autoClearHours);
    
    if (cleared > 0) {
      console.log(`[GroceryAutoClear] Cleared ${cleared} purchased item(s) older than ${autoClearHours} hours`);
    }
  } catch (error) {
    console.error("[GroceryAutoClear] Error during auto-clear:", error);
  }
}

export function initializeGroceryAutoClear(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    console.log("[GroceryAutoClear] Stopped existing schedule");
  }
  
  scheduledTask = cron.schedule("0 * * * *", async () => {
    console.log("[GroceryAutoClear] Running hourly auto-clear check...");
    await runAutoClear();
  });
  
  console.log("[GroceryAutoClear] Hourly auto-clear job initialized");
  
  runAutoClear();
}

export function stopGroceryAutoClear(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log("[GroceryAutoClear] Stopped auto-clear job");
  }
}
