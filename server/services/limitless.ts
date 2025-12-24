import { db } from "../db";
import { preferences } from "@shared/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

const LIMITLESS_API_BASE = "https://api.limitless.ai/v1";

export interface LimitlessConfig {
  apiKey: string;
  syncEnabled?: boolean;
}

export interface Lifelog {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  duration: number;
  markdown?: string;
  contents?: LifelogContent[];
  heading1s?: LifelogHeading[];
  heading2s?: LifelogHeading[];
}

export interface LifelogContent {
  type: "heading1" | "heading2" | "blockquote" | "bullet";
  content: string;
  startTime?: string;
  endTime?: string;
  startOffsetMs?: number;
  endOffsetMs?: number;
  speakerName?: string;
  speakerIdentifier?: string;
  children?: LifelogContent[];
}

export interface LifelogHeading {
  startTime: string;
  endTime: string;
  startOffsetMs: number;
  endOffsetMs: number;
  content: string;
}

export interface ListLifelogsParams {
  timezone?: string;
  date?: string;
  start?: string;
  end?: string;
  cursor?: string;
  direction?: "asc" | "desc";
  limit?: number;
  includeMarkdown?: boolean;
  includeHeadings?: boolean;
}

export interface ListLifelogsResponse {
  data: {
    lifelogs: Lifelog[];
  };
  meta?: {
    lifelogs?: {
      nextCursor?: string;
    };
  };
}

export interface LifelogDetailResponse {
  data: {
    lifelog: Lifelog;
  };
}

class LimitlessAPIClient {
  private apiKey: string | null = null;
  private configLoaded = false;

  async loadConfig(): Promise<boolean> {
    if (this.configLoaded) return this.apiKey !== null;

    const apiKey = process.env.LIMITLESS_API_KEY;
    if (apiKey) {
      this.apiKey = apiKey;
      this.configLoaded = true;
      console.log("[Limitless] API key configured from environment");
      return true;
    }

    try {
      const stored = await db
        .select()
        .from(preferences)
        .where(eq(preferences.key, "limitless_config"))
        .limit(1);

      if (stored.length > 0 && stored[0].value) {
        try {
          const config = JSON.parse(stored[0].value) as LimitlessConfig;
          if (config.apiKey) {
            this.apiKey = config.apiKey;
            this.configLoaded = true;
            console.log("[Limitless] API key loaded from database");
            return true;
          }
        } catch (parseError) {
          console.error("[Limitless] Failed to parse stored config:", parseError);
        }
      }
    } catch (error) {
      console.error("[Limitless] Failed to load config:", error);
    }

    this.configLoaded = true;
    return false;
  }

  async saveConfig(config: LimitlessConfig): Promise<void> {
    try {
      const now = new Date().toISOString();
      const configJson = JSON.stringify(config);
      
      await db
        .insert(preferences)
        .values({
          id: uuidv4(),
          key: "limitless_config",
          value: configJson,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: preferences.key,
          set: { value: configJson, updatedAt: now },
        });

      this.apiKey = config.apiKey;
      console.log("[Limitless] Config saved to database");
    } catch (error) {
      console.error("[Limitless] Failed to save config:", error);
      throw error;
    }
  }

  isConfigured(): boolean {
    return this.apiKey !== null;
  }

  private getHeaders(): Record<string, string> {
    if (!this.apiKey) {
      throw new Error("Limitless API key not configured");
    }
    return {
      "X-API-Key": this.apiKey,
      "Content-Type": "application/json",
    };
  }

  async listLifelogs(params?: ListLifelogsParams): Promise<ListLifelogsResponse> {
    await this.loadConfig();
    if (!this.isConfigured()) {
      throw new Error("Limitless API key not configured");
    }

    const queryParams = new URLSearchParams();
    if (params?.timezone) queryParams.set("timezone", params.timezone);
    if (params?.date) queryParams.set("date", params.date);
    if (params?.start) queryParams.set("start", params.start);
    if (params?.end) queryParams.set("end", params.end);
    if (params?.cursor) queryParams.set("cursor", params.cursor);
    if (params?.direction) queryParams.set("direction", params.direction);
    if (params?.limit) queryParams.set("limit", params.limit.toString());
    if (params?.includeMarkdown) queryParams.set("includeMarkdown", "true");
    if (params?.includeHeadings) queryParams.set("includeHeadings", "true");

    const url = `${LIMITLESS_API_BASE}/lifelogs${queryParams.toString() ? "?" + queryParams.toString() : ""}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Limitless API error (${response.status}): ${errorText}`);
      }

      return response.json() as Promise<ListLifelogsResponse>;
    } catch (error) {
      console.error("[Limitless] listLifelogs error:", error);
      throw error;
    }
  }

  async getLifelog(lifelogId: string, includeMarkdown = true, includeHeadings = true): Promise<LifelogDetailResponse> {
    await this.loadConfig();
    if (!this.isConfigured()) {
      throw new Error("Limitless API key not configured");
    }

    const queryParams = new URLSearchParams();
    if (includeMarkdown) queryParams.set("includeMarkdown", "true");
    if (includeHeadings) queryParams.set("includeHeadings", "true");

    const url = `${LIMITLESS_API_BASE}/lifelogs/${lifelogId}?${queryParams.toString()}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Limitless API error (${response.status}): ${errorText}`);
      }

      return response.json() as Promise<LifelogDetailResponse>;
    } catch (error) {
      console.error("[Limitless] getLifelog error:", error);
      throw error;
    }
  }

  async downloadAudio(lifelogId: string): Promise<Buffer> {
    await this.loadConfig();
    if (!this.isConfigured()) {
      throw new Error("Limitless API key not configured");
    }

    const url = `${LIMITLESS_API_BASE}/lifelogs/${lifelogId}/audio`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Limitless API error (${response.status}): ${errorText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error("[Limitless] downloadAudio error:", error);
      throw error;
    }
  }

  async testConnection(): Promise<{ success: boolean; error?: string; lifelogCount?: number }> {
    try {
      await this.loadConfig();
      if (!this.isConfigured()) {
        return { success: false, error: "API key not configured" };
      }

      const response = await this.listLifelogs({ limit: 1 });
      return {
        success: true,
        lifelogCount: response.data.lifelogs.length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }
}

export const limitlessClient = new LimitlessAPIClient();

export async function getLimitlessStatus(): Promise<{
  configured: boolean;
  connected: boolean;
  error?: string;
}> {
  await limitlessClient.loadConfig();
  if (!limitlessClient.isConfigured()) {
    return { configured: false, connected: false };
  }

  const test = await limitlessClient.testConnection();
  return {
    configured: true,
    connected: test.success,
    error: test.error,
  };
}
