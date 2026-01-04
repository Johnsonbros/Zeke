/**
 * Limitless Data Import Service
 * 
 * Handles importing historical data from Limitless ZIP exports.
 * Processes LifeLog JSON files and queues them for batch processing.
 * 
 * ZIP Structure:
 * - LifeLog/ folder - JSON/MD files with transcripts
 * - Audio/ folder - Ogg Opus files (optional)
 */

import fs from "fs";
import path from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import { createReadStream } from "fs";
import { pipeline } from "stream/promises";
import { Writable } from "stream";
import { log } from "../logger";
import { db, createMemoryNote, findMemoryNoteByContent, getAllMemoryNotes } from "../db";
import { semanticMemories, type InsertMemoryNote } from "@shared/schema";
import type { Lifelog, LifelogContent } from "./limitless";

interface ImportProgress {
  id: string;
  status: "pending" | "extracting" | "processing" | "completed" | "failed";
  totalFiles: number;
  processedFiles: number;
  createdMemories: number;
  skippedDuplicates: number;
  errors: string[];
  startedAt: string;
  completedAt?: string;
  currentFile?: string;
}

interface ParsedLifelog {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  markdown?: string;
  contents?: LifelogContent[];
  speakers: string[];
}

const activeImports = new Map<string, ImportProgress>();

export function getImportProgress(importId: string): ImportProgress | null {
  return activeImports.get(importId) || null;
}

export function getAllImportProgress(): ImportProgress[] {
  return Array.from(activeImports.values());
}

export async function processLimitlessZip(
  zipPath: string,
  onProgress?: (progress: ImportProgress) => void
): Promise<ImportProgress> {
  const importId = uuidv4();
  const progress: ImportProgress = {
    id: importId,
    status: "pending",
    totalFiles: 0,
    processedFiles: 0,
    createdMemories: 0,
    skippedDuplicates: 0,
    errors: [],
    startedAt: new Date().toISOString(),
  };
  
  activeImports.set(importId, progress);
  
  try {
    progress.status = "extracting";
    onProgress?.(progress);
    
    const extractDir = path.join(os.tmpdir(), `limitless-import-${importId}`);
    fs.mkdirSync(extractDir, { recursive: true });
    
    log(`[LimitlessImport] Extracting ZIP to ${extractDir}`, "import");
    
    const unzipper = await import("unzipper");
    
    await pipeline(
      createReadStream(zipPath),
      unzipper.Extract({ path: extractDir })
    );
    
    log(`[LimitlessImport] ZIP extracted, scanning for LifeLog files`, "import");
    
    const lifelogFiles = findLifelogFiles(extractDir);
    progress.totalFiles = lifelogFiles.length;
    progress.status = "processing";
    onProgress?.(progress);
    
    log(`[LimitlessImport] Found ${lifelogFiles.length} lifelog files`, "import");
    
    for (const filePath of lifelogFiles) {
      try {
        progress.currentFile = path.basename(filePath);
        onProgress?.(progress);
        
        const lifelog = await parseLifelogFile(filePath);
        if (lifelog) {
          const created = await processLifelog(lifelog);
          if (created) {
            progress.createdMemories++;
          } else {
            progress.skippedDuplicates++;
          }
        }
        
        progress.processedFiles++;
        onProgress?.(progress);
        
      } catch (error: any) {
        const errorMsg = `Error processing ${path.basename(filePath)}: ${error.message}`;
        progress.errors.push(errorMsg);
        log(`[LimitlessImport] ${errorMsg}`, "import");
      }
    }
    
    progress.status = "completed";
    progress.completedAt = new Date().toISOString();
    progress.currentFile = undefined;
    onProgress?.(progress);
    
    try {
      fs.rmSync(extractDir, { recursive: true, force: true });
    } catch (e) {
      log(`[LimitlessImport] Failed to cleanup extract dir: ${e}`, "import");
    }
    
    log(`[LimitlessImport] Import complete: ${progress.createdMemories} memories created, ${progress.skippedDuplicates} duplicates skipped`, "import");
    
    if (progress.createdMemories > 0) {
      try {
        const today = new Date().toISOString().split("T")[0];
        await enqueueKnowledgeGraphExtraction(today, today);
        log(`[LimitlessImport] Queued knowledge graph extraction for imported memories`, "import");
      } catch (e) {
        log(`[LimitlessImport] Failed to queue batch processing: ${e}`, "import");
      }
    }
    
    return progress;
    
  } catch (error: any) {
    progress.status = "failed";
    progress.errors.push(`Import failed: ${error.message}`);
    progress.completedAt = new Date().toISOString();
    onProgress?.(progress);
    
    log(`[LimitlessImport] Import failed: ${error.message}`, "import");
    throw error;
  }
}

function findLifelogFiles(dir: string): string[] {
  const files: string[] = [];
  
  function scanDir(currentDir: string) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          if (entry.name.toLowerCase().includes("lifelog") || 
              entry.name.toLowerCase().includes("life_log") ||
              entry.name === "data") {
            scanDir(fullPath);
          } else {
            scanDir(fullPath);
          }
        } else if (entry.isFile()) {
          if (entry.name.endsWith(".json") && !entry.name.startsWith(".")) {
            files.push(fullPath);
          } else if (entry.name.endsWith(".md") && !entry.name.startsWith(".")) {
            files.push(fullPath);
          }
        }
      }
    } catch (e) {
      log(`[LimitlessImport] Error scanning ${currentDir}: ${e}`, "import");
    }
  }
  
  scanDir(dir);
  return files;
}

async function parseLifelogFile(filePath: string): Promise<ParsedLifelog | null> {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const ext = path.extname(filePath).toLowerCase();
    
    if (ext === ".json") {
      const data = JSON.parse(content);
      
      if (data.data?.lifelog) {
        return parseLifelogObject(data.data.lifelog);
      }
      if (data.lifelogs && Array.isArray(data.lifelogs)) {
        const firstLog = data.lifelogs[0];
        if (firstLog) {
          return parseLifelogObject(firstLog);
        }
      }
      if (data.id && (data.title || data.markdown || data.contents)) {
        return parseLifelogObject(data);
      }
      
      return null;
    }
    
    if (ext === ".md") {
      const fileName = path.basename(filePath, ".md");
      const dateMatch = fileName.match(/(\d{4}-\d{2}-\d{2})/);
      const startTime = dateMatch ? `${dateMatch[1]}T00:00:00Z` : new Date().toISOString();
      
      return {
        id: `md-${uuidv4()}`,
        title: fileName,
        startTime,
        endTime: startTime,
        markdown: content,
        speakers: extractSpeakersFromMarkdown(content),
      };
    }
    
    return null;
  } catch (error: any) {
    log(`[LimitlessImport] Failed to parse ${filePath}: ${error.message}`, "import");
    return null;
  }
}

function parseLifelogObject(data: any): ParsedLifelog {
  const speakers = new Set<string>();
  
  if (data.contents && Array.isArray(data.contents)) {
    for (const item of data.contents) {
      if (item.speakerName) {
        speakers.add(item.speakerName);
      }
    }
  }
  
  if (data.markdown) {
    const markdownSpeakers = extractSpeakersFromMarkdown(data.markdown);
    markdownSpeakers.forEach(s => speakers.add(s));
  }
  
  return {
    id: data.id || uuidv4(),
    title: data.title || "Untitled Conversation",
    startTime: data.startTime || new Date().toISOString(),
    endTime: data.endTime || data.startTime || new Date().toISOString(),
    markdown: data.markdown,
    contents: data.contents,
    speakers: Array.from(speakers),
  };
}

function extractSpeakersFromMarkdown(markdown: string): string[] {
  const speakers = new Set<string>();
  const speakerPattern = /^>\s*\*\*([^*]+)\*\*/gm;
  const altPattern = /^\[([^\]]+)\]:/gm;
  const blockquotePattern = /^>\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?):/gm;
  
  let match;
  while ((match = speakerPattern.exec(markdown)) !== null) {
    speakers.add(match[1].trim());
  }
  while ((match = altPattern.exec(markdown)) !== null) {
    speakers.add(match[1].trim());
  }
  while ((match = blockquotePattern.exec(markdown)) !== null) {
    if (!match[1].includes(" ") || match[1].split(" ").length <= 3) {
      speakers.add(match[1].trim());
    }
  }
  
  return Array.from(speakers);
}

async function processLifelog(lifelog: ParsedLifelog): Promise<boolean> {
  const contentPreview = lifelog.markdown?.substring(0, 200) || 
                         lifelog.contents?.map(c => c.content).join(" ").substring(0, 200) ||
                         lifelog.title;
  
  const existingNote = await findMemoryNoteByContent(contentPreview.substring(0, 100));
  if (existingNote) {
    return false;
  }
  
  const fullContent = lifelog.markdown || 
                      lifelog.contents?.map(c => {
                        if (c.speakerName) {
                          return `[${c.speakerName}]: ${c.content}`;
                        }
                        return c.content;
                      }).join("\n\n") ||
                      lifelog.title;
  
  const tags = ["limitless-import", "conversation"];
  if (lifelog.speakers.length > 1) {
    tags.push("multi-speaker");
  }
  lifelog.speakers.slice(0, 5).forEach(s => {
    tags.push(`speaker:${s.toLowerCase().replace(/\s+/g, "-")}`);
  });
  
  const memoryData: InsertMemoryNote = {
    id: uuidv4(),
    type: "note",
    content: fullContent.substring(0, 10000),
    context: JSON.stringify({
      lifelogId: lifelog.id,
      speakers: lifelog.speakers,
      startTime: lifelog.startTime,
      endTime: lifelog.endTime,
      importedAt: new Date().toISOString(),
      source: "limitless_import",
    }),
    tags: tags.join(","),
    createdAt: lifelog.startTime,
  };
  
  const created = await createMemoryNote(memoryData);
  return created !== null;
}

export async function processLimitlessDirectory(
  dirPath: string,
  onProgress?: (progress: ImportProgress) => void
): Promise<ImportProgress> {
  const importId = uuidv4();
  const progress: ImportProgress = {
    id: importId,
    status: "processing",
    totalFiles: 0,
    processedFiles: 0,
    createdMemories: 0,
    skippedDuplicates: 0,
    errors: [],
    startedAt: new Date().toISOString(),
  };
  
  activeImports.set(importId, progress);
  
  try {
    const lifelogFiles = findLifelogFiles(dirPath);
    progress.totalFiles = lifelogFiles.length;
    onProgress?.(progress);
    
    log(`[LimitlessImport] Found ${lifelogFiles.length} lifelog files in directory`, "import");
    
    for (const filePath of lifelogFiles) {
      try {
        progress.currentFile = path.basename(filePath);
        onProgress?.(progress);
        
        const lifelog = await parseLifelogFile(filePath);
        if (lifelog) {
          const created = await processLifelog(lifelog);
          if (created) {
            progress.createdMemories++;
          } else {
            progress.skippedDuplicates++;
          }
        }
        
        progress.processedFiles++;
        onProgress?.(progress);
        
      } catch (error: any) {
        const errorMsg = `Error processing ${path.basename(filePath)}: ${error.message}`;
        progress.errors.push(errorMsg);
        log(`[LimitlessImport] ${errorMsg}`, "import");
      }
    }
    
    progress.status = "completed";
    progress.completedAt = new Date().toISOString();
    progress.currentFile = undefined;
    onProgress?.(progress);
    
    if (progress.createdMemories > 0) {
      try {
        const today = new Date().toISOString().split("T")[0];
        await enqueueKnowledgeGraphExtraction(today, today);
      } catch (e) {
        log(`[LimitlessImport] Failed to queue batch processing: ${e}`, "import");
      }
    }
    
    return progress;
    
  } catch (error: any) {
    progress.status = "failed";
    progress.errors.push(`Import failed: ${error.message}`);
    progress.completedAt = new Date().toISOString();
    onProgress?.(progress);
    throw error;
  }
}

export function clearCompletedImports(): number {
  let cleared = 0;
  for (const [id, progress] of activeImports) {
    if (progress.status === "completed" || progress.status === "failed") {
      activeImports.delete(id);
      cleared++;
    }
  }
  return cleared;
}
