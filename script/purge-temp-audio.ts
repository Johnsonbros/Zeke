/**
 * Purge temp_audio directory before server start.
 * Run as a prestart script to clean up stale audio files.
 */

import fs from "fs";
import path from "path";

const TEMP_AUDIO_DIR = path.join(process.cwd(), "temp_audio");

function purge(): void {
  if (!fs.existsSync(TEMP_AUDIO_DIR)) {
    console.log("[purge-temp-audio] temp_audio directory does not exist, skipping.");
    return;
  }

  const files = fs.readdirSync(TEMP_AUDIO_DIR);
  let removed = 0;

  for (const file of files) {
    if (file === ".gitkeep") continue;
    
    const filePath = path.join(TEMP_AUDIO_DIR, file);
    try {
      fs.unlinkSync(filePath);
      removed++;
    } catch (err) {
      console.error(`[purge-temp-audio] Failed to remove ${file}:`, err);
    }
  }

  console.log(`[purge-temp-audio] Removed ${removed} file(s) from temp_audio/`);
}

purge();
