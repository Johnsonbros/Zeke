/**
 * Transcript Segment Combination Algorithm
 *
 * Inspired by Omi's segment merging approach, this service:
 * - Merges adjacent segments from the same speaker
 * - Respects sentence boundaries (punctuation)
 * - Reduces visual fragmentation for better readability
 * - Maintains temporal accuracy
 *
 * Example transformation:
 * Before: ["Hi, how", "are you", "doing?"]
 * After: ["Hi, how are you doing?"]
 */

export interface TranscriptSegment {
  text: string;
  speaker?: string;
  timestamp?: number;
  startTime?: number;
  endTime?: number;
  confidence?: number;
  isFinal?: boolean;
  language?: string;
}

export interface CombinerConfig {
  maxGapMs: number; // Maximum gap between segments to merge (default: 5000ms)
  respectPunctuation: boolean; // Don't merge across sentence boundaries
  minSegmentLength: number; // Minimum characters before allowing merge
  speakerBased: boolean; // Only merge same-speaker segments
}

const DEFAULT_CONFIG: CombinerConfig = {
  maxGapMs: 5000,
  respectPunctuation: true,
  minSegmentLength: 10,
  speakerBased: true,
};

class TranscriptCombiner {
  private config: CombinerConfig;

  constructor(config: Partial<CombinerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    console.log('[Transcript Combiner] Initialized with config:', this.config);
  }

  /**
   * Combine adjacent transcript segments intelligently
   */
  public combineSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
    if (segments.length === 0) {
      return [];
    }

    if (segments.length === 1) {
      return segments;
    }

    const combined: TranscriptSegment[] = [];
    let current = segments[0];

    for (let i = 1; i < segments.length; i++) {
      const next = segments[i];

      if (this.shouldMerge(current, next)) {
        current = this.mergeSegments(current, next);
      } else {
        combined.push(current);
        current = next;
      }
    }

    // Push the last segment
    combined.push(current);

    console.log(`[Transcript Combiner] Combined ${segments.length} segments into ${combined.length}`);
    return combined;
  }

  /**
   * Determine if two segments should be merged
   */
  private shouldMerge(segment1: TranscriptSegment, segment2: TranscriptSegment): boolean {
    // Check speaker match (if speaker-based merging enabled)
    if (this.config.speakerBased) {
      const speaker1 = segment1.speaker || 'unknown';
      const speaker2 = segment2.speaker || 'unknown';

      if (speaker1 !== speaker2) {
        return false;
      }
    }

    // Check sentence boundary (if punctuation respect enabled)
    if (this.config.respectPunctuation && this.hasSentenceBoundary(segment1.text)) {
      return false;
    }

    // Check time gap (if timestamps available)
    if (segment1.endTime !== undefined && segment2.startTime !== undefined) {
      const gap = segment2.startTime - segment1.endTime;
      if (gap > this.config.maxGapMs / 1000) { // Convert to seconds
        return false;
      }
    } else if (segment1.timestamp !== undefined && segment2.timestamp !== undefined) {
      const gap = segment2.timestamp - segment1.timestamp;
      if (gap > this.config.maxGapMs) {
        return false;
      }
    }

    // Check minimum segment length
    if (segment1.text.trim().length < this.config.minSegmentLength) {
      return true; // Merge short segments
    }

    return true;
  }

  /**
   * Check if text ends with sentence boundary punctuation
   */
  private hasSentenceBoundary(text: string): boolean {
    const trimmed = text.trim();
    return /[.!?]\s*$/.test(trimmed);
  }

  /**
   * Merge two segments into one
   */
  private mergeSegments(segment1: TranscriptSegment, segment2: TranscriptSegment): TranscriptSegment {
    const merged: TranscriptSegment = {
      text: this.mergeText(segment1.text, segment2.text),
      speaker: segment1.speaker || segment2.speaker,
      startTime: segment1.startTime,
      endTime: segment2.endTime || segment1.endTime,
      timestamp: segment1.timestamp || segment2.timestamp,
      isFinal: segment2.isFinal !== undefined ? segment2.isFinal : segment1.isFinal,
      language: segment1.language || segment2.language,
    };

    // Average confidence if both have confidence scores
    if (segment1.confidence !== undefined && segment2.confidence !== undefined) {
      merged.confidence = (segment1.confidence + segment2.confidence) / 2;
    } else {
      merged.confidence = segment1.confidence || segment2.confidence;
    }

    return merged;
  }

  /**
   * Intelligently merge text with proper spacing
   */
  private mergeText(text1: string, text2: string): string {
    const trimmed1 = text1.trim();
    const trimmed2 = text2.trim();

    // If first text ends with punctuation (but not sentence boundary), just append
    if (/[,:;-]\s*$/.test(trimmed1)) {
      return `${trimmed1} ${trimmed2}`;
    }

    // If second text starts with punctuation, no space needed
    if (/^[,:;.!?-]/.test(trimmed2)) {
      return `${trimmed1}${trimmed2}`;
    }

    // Default: add space between
    return `${trimmed1} ${trimmed2}`;
  }

  /**
   * Combine segments by speaker (groups all consecutive same-speaker segments)
   */
  public combineBySpeaker(segments: TranscriptSegment[]): TranscriptSegment[] {
    if (segments.length === 0) {
      return [];
    }

    const combined: TranscriptSegment[] = [];
    let current = segments[0];

    for (let i = 1; i < segments.length; i++) {
      const next = segments[i];
      const currentSpeaker = current.speaker || 'unknown';
      const nextSpeaker = next.speaker || 'unknown';

      if (currentSpeaker === nextSpeaker) {
        current = this.mergeSegments(current, next);
      } else {
        combined.push(current);
        current = next;
      }
    }

    combined.push(current);
    return combined;
  }

  /**
   * Split long segments at sentence boundaries for better readability
   */
  public splitLongSegments(
    segments: TranscriptSegment[],
    maxLength: number = 200
  ): TranscriptSegment[] {
    const result: TranscriptSegment[] = [];

    for (const segment of segments) {
      if (segment.text.length <= maxLength) {
        result.push(segment);
        continue;
      }

      // Split at sentence boundaries
      const sentences = this.splitIntoSentences(segment.text);
      const duration = segment.endTime && segment.startTime
        ? (segment.endTime - segment.startTime) / sentences.length
        : 0;

      let currentTime = segment.startTime || 0;

      for (let i = 0; i < sentences.length; i++) {
        result.push({
          ...segment,
          text: sentences[i],
          startTime: currentTime,
          endTime: duration > 0 ? currentTime + duration : segment.endTime,
        });

        currentTime += duration;
      }
    }

    return result;
  }

  /**
   * Split text into sentences
   */
  private splitIntoSentences(text: string): string[] {
    // Split on sentence boundaries while preserving punctuation
    const sentences = text.split(/(?<=[.!?])\s+/);
    return sentences.map(s => s.trim()).filter(s => s.length > 0);
  }

  /**
   * Remove duplicate or overlapping segments
   */
  public deduplicateSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
    if (segments.length === 0) {
      return [];
    }

    const unique: TranscriptSegment[] = [segments[0]];

    for (let i = 1; i < segments.length; i++) {
      const current = segments[i];
      const previous = unique[unique.length - 1];

      // Check for exact duplicate text
      if (current.text.trim() === previous.text.trim()) {
        // Keep the one with higher confidence
        if ((current.confidence || 0) > (previous.confidence || 0)) {
          unique[unique.length - 1] = current;
        }
        continue;
      }

      // Check for substantial overlap (>80% similar)
      const similarity = this.calculateSimilarity(current.text, previous.text);
      if (similarity > 0.8) {
        // Keep the longer/more detailed one
        if (current.text.length > previous.text.length) {
          unique[unique.length - 1] = current;
        }
        continue;
      }

      unique.push(current);
    }

    if (unique.length < segments.length) {
      console.log(`[Transcript Combiner] Removed ${segments.length - unique.length} duplicate segments`);
    }

    return unique;
  }

  /**
   * Calculate text similarity (simple Jaccard similarity on words)
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Clean up transcript segments (remove empty, trim whitespace, etc.)
   */
  public cleanSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
    return segments
      .filter(segment => segment.text.trim().length > 0)
      .map(segment => ({
        ...segment,
        text: segment.text.trim(),
      }));
  }

  /**
   * Full transcript processing pipeline
   */
  public processTranscript(segments: TranscriptSegment[]): TranscriptSegment[] {
    let processed = [...segments];

    // Step 1: Clean
    processed = this.cleanSegments(processed);

    // Step 2: Deduplicate
    processed = this.deduplicateSegments(processed);

    // Step 3: Combine adjacent segments
    processed = this.combineSegments(processed);

    // Step 4: Split long segments
    processed = this.splitLongSegments(processed);

    return processed;
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<CombinerConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[Transcript Combiner] Config updated:', this.config);
  }

  /**
   * Get current configuration
   */
  public getConfig(): CombinerConfig {
    return { ...this.config };
  }
}

// Singleton instance
export const transcriptCombiner = new TranscriptCombiner();

// Export for testing and custom instances
export { TranscriptCombiner };
