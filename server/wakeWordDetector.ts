/**
 * Wake Word Detector for ZEKE
 * 
 * Detects "Hey ZEKE" wake word patterns in lifelog transcripts
 * and extracts the command that follows.
 */

import type { Lifelog, ContentNode } from "./limitless";

export interface DetectedCommand {
  lifelogId: string;
  lifelogTitle: string;
  timestamp: string;
  wakeWord: string;
  rawCommand: string;
  speakerName: string | null;
  speakerIdentifier: string | null;
  context: string;
  fullTranscript: string;
}

// Wake word patterns - case insensitive matching
const WAKE_WORD_PATTERNS = [
  /\bhey\s+zeke\b/i,
  /\bhi\s+zeke\b/i,
  /\byo\s+zeke\b/i,
  /\bokay\s+zeke\b/i,
  /\bok\s+zeke\b/i,
  /\bzeke\s*,?\s+can\s+you\b/i,
  /\bzeke\s*,?\s+please\b/i,
  /\bzeke\s*,?\s+I\s+need\s+you\s+to\b/i,
  /\bzeke\s*,?\s+tell\b/i,
  /\bzeke\s*,?\s+text\b/i,
  /\bzeke\s*,?\s+message\b/i,
  /\bzeke\s*,?\s+remind\b/i,
  /\bzeke\s*,?\s+add\b/i,
  /\bzeke\s*,?\s+set\b/i,
  /\bzeke\s*,?\s+what\b/i,
  /\bzeke\s*,?\s+how\b/i,
  /\bzeke\s*,?\s+give\s+me\b/i,
  /\bzeke\s*,?\s+get\b/i,
  /\bzeke\s*,?\s+check\b/i,
];

// Master pattern to find any wake word
const MASTER_WAKE_PATTERN = /\b(?:hey|hi|yo|okay|ok)\s+zeke\b|\bzeke\s*,?\s*(?:can\s+you|please|I\s+need\s+you\s+to|tell|text|message|remind|add|set|what|how|give\s+me|get|check)\b/i;

/**
 * Detect wake word commands in a single piece of text
 */
export function detectWakeWordInText(text: string): { found: boolean; wakeWord: string; command: string } | null {
  const match = text.match(MASTER_WAKE_PATTERN);
  
  if (!match) {
    return null;
  }
  
  const wakeWordStart = match.index!;
  const wakeWord = match[0];
  
  // Extract the command after the wake word
  const afterWakeWord = text.slice(wakeWordStart + wakeWord.length).trim();
  
  // Handle cases like "Hey ZEKE, tell Carolina to hurry up"
  // Remove leading comma, period, or other punctuation
  const cleanedCommand = afterWakeWord.replace(/^[,.\s]+/, '').trim();
  
  // Also look for sentence boundaries to extract a complete command
  // Stop at the next sentence if there's one
  const commandMatch = cleanedCommand.match(/^[^.!?]*[.!?]?/);
  const command = commandMatch ? commandMatch[0].trim() : cleanedCommand;
  
  if (!command || command.length < 3) {
    return null;
  }
  
  return {
    found: true,
    wakeWord: wakeWord.trim(),
    command: command,
  };
}

/**
 * Extract text from a ContentNode and its children recursively
 */
function extractNodeText(node: ContentNode): { text: string; speaker: string | null; identifier: string | null; timestamp: string | null }[] {
  const results: { text: string; speaker: string | null; identifier: string | null; timestamp: string | null }[] = [];
  
  if (node.content) {
    results.push({
      text: node.content,
      speaker: node.speakerName || null,
      identifier: node.speakerIdentifier || null,
      timestamp: node.startTime || null,
    });
  }
  
  if (node.children) {
    for (const child of node.children) {
      results.push(...extractNodeText(child));
    }
  }
  
  return results;
}

/**
 * Detect all wake word commands in a lifelog entry
 */
export function detectCommandsInLifelog(lifelog: Lifelog): DetectedCommand[] {
  const commands: DetectedCommand[] = [];
  
  // Check markdown content first
  if (lifelog.markdown) {
    const detection = detectWakeWordInText(lifelog.markdown);
    if (detection) {
      commands.push({
        lifelogId: lifelog.id,
        lifelogTitle: lifelog.title,
        timestamp: lifelog.startTime,
        wakeWord: detection.wakeWord,
        rawCommand: detection.command,
        speakerName: null,
        speakerIdentifier: null,
        context: lifelog.title,
        fullTranscript: lifelog.markdown.substring(0, 500),
      });
    }
  }
  
  // Check content nodes for more granular detection
  if (lifelog.contents && lifelog.contents.length > 0) {
    for (const content of lifelog.contents) {
      const textParts = extractNodeText(content);
      
      for (const part of textParts) {
        const detection = detectWakeWordInText(part.text);
        if (detection) {
          // Build context from surrounding parts
          const partIndex = textParts.indexOf(part);
          const contextParts = textParts
            .slice(Math.max(0, partIndex - 2), Math.min(textParts.length, partIndex + 3))
            .map(p => p.text)
            .join(' ');
          
          commands.push({
            lifelogId: lifelog.id,
            lifelogTitle: lifelog.title,
            timestamp: part.timestamp || lifelog.startTime,
            wakeWord: detection.wakeWord,
            rawCommand: detection.command,
            speakerName: part.speaker,
            speakerIdentifier: part.identifier,
            context: contextParts.substring(0, 500),
            fullTranscript: textParts.map(p => p.text).join(' ').substring(0, 1000),
          });
        }
      }
    }
  }
  
  // Deduplicate commands by raw command content within the same lifelog
  const seen = new Set<string>();
  return commands.filter(cmd => {
    const key = `${cmd.lifelogId}:${cmd.rawCommand.toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Detect commands across multiple lifelogs
 */
export function detectCommandsInLifelogs(lifelogs: Lifelog[]): DetectedCommand[] {
  const allCommands: DetectedCommand[] = [];
  
  for (const lifelog of lifelogs) {
    const commands = detectCommandsInLifelog(lifelog);
    allCommands.push(...commands);
  }
  
  return allCommands;
}

/**
 * Check if a command looks like it's directed at ZEKE (not just mentioning ZEKE)
 */
export function isActionableCommand(command: string): boolean {
  const actionIndicators = [
    /^tell\b/i,
    /^text\b/i,
    /^message\b/i,
    /^send\b/i,
    /^remind\b/i,
    /^add\b/i,
    /^set\b/i,
    /^create\b/i,
    /^schedule\b/i,
    /^call\b/i,
    /^notify\b/i,
    /^let\b.*\bknow\b/i,
    /^ask\b/i,
    /^check\b/i,
    /^find\b/i,
    /^look\s+up\b/i,
    /^what\b.*\b(is|are|time|weather)\b/i,
    /^what's\b/i,
    /^who\b/i,
    /^where\b/i,
    /^when\b/i,
    /^can\s+you\b/i,
    /^please\b/i,
    /^I\s+need\s+you\s+to\b/i,
    /^how\b.*\b(is|are|the|weather|outside)\b/i,
    /^how's\b/i,
    /^get\s+(me|the)\b/i,
    /^give\s+me\b/i,
    /^is\s+it\b.*\b(going|gonna|raining|sunny|cold|hot|warm)\b/i,
    /\bweather\b/i,
    /\bforecast\b/i,
    /\bbriefing\b/i,
    /\bschedule\b/i,
    /\btime\s+is\s+it\b/i,
  ];
  
  return actionIndicators.some(pattern => pattern.test(command.trim()));
}
