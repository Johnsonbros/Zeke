import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface LimitlessLifelog {
  id: string;
  title: string;
  markdown: string;
  contents: LimitlessContent[];
  startTime: string;
  endTime: string;
}

export interface LimitlessContent {
  type: "heading1" | "heading2" | "heading3" | "blockquote" | "bullet";
  content: string;
  startTime?: string;
  endTime?: string;
  startOffsetMs?: number;
  endOffsetMs?: number;
  children?: LimitlessContent[];
  speakerName?: string;
  speakerIdentifier?: "user" | "other";
}

export interface LimitlessListResponse {
  lifelogs: LimitlessLifelog[];
  nextCursor?: string;
}

export interface LimitlessSyncResult {
  syncedCount: number;
  newLifelogs: LimitlessLifelog[];
  errors: string[];
}

export interface ParsedTranscript {
  fullText: string;
  segments: TranscriptSegment[];
  speakers: Map<string, string>;
  duration: number;
}

export interface TranscriptSegment {
  speaker: string;
  speakerIdentifier: "user" | "other";
  text: string;
  startTime: number;
  endTime: number;
}

class LimitlessApiService {
  private apiKey: string | null = null;
  private baseUrl = "https://api.limitless.ai/v1";
  private lastSyncTime: Date | null = null;

  constructor() {
    this.apiKey = process.env.LIMITLESS_API_KEY || null;
  }

  public isConfigured(): boolean {
    return !!this.apiKey;
  }

  public setApiKey(key: string): void {
    this.apiKey = key;
    console.log("[Limitless API] API key configured");
  }

  public async testConnection(): Promise<{ success: boolean; error?: string }> {
    if (!this.apiKey) {
      return { success: false, error: "API key not configured" };
    }

    try {
      const response = await fetch(`${this.baseUrl}/lifelogs?limit=1`, {
        method: "GET",
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        console.log("[Limitless API] Connection test successful");
        return { success: true };
      }

      const errorText = await response.text();
      console.error("[Limitless API] Connection test failed:", response.status, errorText);
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    } catch (error) {
      console.error("[Limitless API] Connection test error:", error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  public async fetchLifelogs(options: {
    limit?: number;
    cursor?: string;
    startTime?: string;
    endTime?: string;
    timezone?: string;
    includeMarkdown?: boolean;
    includeHeadings?: boolean;
    direction?: "asc" | "desc";
  } = {}): Promise<LimitlessListResponse> {
    if (!this.apiKey) {
      throw new Error("Limitless API key not configured");
    }

    const params = new URLSearchParams();
    if (options.limit) params.append("limit", options.limit.toString());
    if (options.cursor) params.append("cursor", options.cursor);
    if (options.startTime) params.append("start", options.startTime);
    if (options.endTime) params.append("end", options.endTime);
    if (options.timezone) params.append("timezone", options.timezone);
    if (options.includeMarkdown !== undefined) params.append("includeMarkdown", options.includeMarkdown.toString());
    if (options.includeHeadings !== undefined) params.append("includeHeadings", options.includeHeadings.toString());
    if (options.direction) params.append("direction", options.direction);

    const url = `${this.baseUrl}/lifelogs?${params.toString()}`;
    console.log("[Limitless API] Fetching lifelogs:", url);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-Key": this.apiKey,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Limitless API] Fetch error:", response.status, errorText);
      throw new Error(`Limitless API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log("[Limitless API] Fetched", data.lifelogs?.length || 0, "lifelogs");
    
    return {
      lifelogs: data.lifelogs || [],
      nextCursor: data.nextCursor,
    };
  }

  public async fetchLifelog(id: string): Promise<LimitlessLifelog | null> {
    if (!this.apiKey) {
      throw new Error("Limitless API key not configured");
    }

    const url = `${this.baseUrl}/lifelogs/${id}`;
    console.log("[Limitless API] Fetching lifelog:", id);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-Key": this.apiKey,
        "Content-Type": "application/json",
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Limitless API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  public async fetchRecentLifelogs(hours: number = 24): Promise<LimitlessLifelog[]> {
    const endTime = new Date().toISOString();
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const result = await this.fetchLifelogs({
      startTime,
      endTime,
      includeMarkdown: true,
      includeHeadings: true,
      direction: "desc",
      limit: 100,
    });

    return result.lifelogs;
  }

  public async syncNewLifelogs(): Promise<LimitlessSyncResult> {
    const result: LimitlessSyncResult = {
      syncedCount: 0,
      newLifelogs: [],
      errors: [],
    };

    try {
      const startTime = this.lastSyncTime 
        ? this.lastSyncTime.toISOString() 
        : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const response = await this.fetchLifelogs({
        startTime,
        includeMarkdown: true,
        includeHeadings: true,
        direction: "asc",
        limit: 50,
      });

      result.newLifelogs = response.lifelogs;
      result.syncedCount = response.lifelogs.length;
      this.lastSyncTime = new Date();

      console.log("[Limitless API] Synced", result.syncedCount, "new lifelogs");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown sync error";
      result.errors.push(errorMsg);
      console.error("[Limitless API] Sync error:", errorMsg);
    }

    return result;
  }

  public parseLifelogToTranscript(lifelog: LimitlessLifelog): ParsedTranscript {
    const segments: TranscriptSegment[] = [];
    const speakers = new Map<string, string>();
    let fullText = "";

    const processContent = (content: LimitlessContent, depth = 0) => {
      if (content.type === "blockquote" && content.speakerName) {
        const speakerId = content.speakerIdentifier || "other";
        speakers.set(content.speakerName, speakerId);

        const startTime = content.startOffsetMs || 0;
        const endTime = content.endOffsetMs || startTime + 1000;

        segments.push({
          speaker: content.speakerName,
          speakerIdentifier: speakerId,
          text: content.content,
          startTime: startTime / 1000,
          endTime: endTime / 1000,
        });

        fullText += `${content.speakerName}: ${content.content}\n`;
      } else if (content.type === "bullet" && content.children) {
        for (const child of content.children) {
          processContent(child, depth + 1);
        }
      }
    };

    for (const content of lifelog.contents || []) {
      processContent(content);
    }

    const duration = segments.length > 0 
      ? Math.max(...segments.map(s => s.endTime)) 
      : 0;

    return {
      fullText: fullText.trim() || lifelog.markdown || "",
      segments,
      speakers,
      duration,
    };
  }

  public async analyzeLifelog(lifelog: LimitlessLifelog): Promise<{
    title: string;
    summary: string;
    actionItems: string[];
    topics: string[];
    sentiment: string;
  }> {
    const parsed = this.parseLifelogToTranscript(lifelog);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Analyze this conversation transcript and provide a structured analysis.`,
        },
        {
          role: "user",
          content: `Analyze this conversation:

${parsed.fullText}

Provide a JSON response with:
{
  "title": "short descriptive title (max 10 words)",
  "summary": "2-3 sentence summary",
  "actionItems": ["list of action items mentioned"],
  "topics": ["main topics discussed"],
  "sentiment": "overall sentiment (positive/negative/neutral)"
}`,
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 500,
    });

    const content = response.choices[0]?.message?.content || "{}";
    try {
      return JSON.parse(content);
    } catch {
      return {
        title: lifelog.title || "Untitled",
        summary: "",
        actionItems: [],
        topics: [],
        sentiment: "neutral",
      };
    }
  }
}

export const limitlessApiService = new LimitlessApiService();
