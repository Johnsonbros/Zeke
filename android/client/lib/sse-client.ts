import { getApiUrl } from "./query-client";

interface SSEEvent {
  type: "user_message" | "chunk" | "done" | "error";
  content?: string;
  message?: unknown;
  error?: string;
}

interface SSEClientOptions {
  url: string;
  body: Record<string, unknown>;
  onChunk: (content: string) => void;
  onComplete: (message: unknown) => void;
  onError: (error: string) => void;
  onUserMessage?: (message: unknown) => void;
}

export function createSSERequest(options: SSEClientOptions): { abort: () => void } {
  const { url, body, onChunk, onComplete, onError, onUserMessage } = options;
  
  const xhr = new XMLHttpRequest();
  let lastIndex = 0;
  let aborted = false;

  const parseSSEData = (text: string): SSEEvent | null => {
    if (!text.startsWith("data: ")) return null;
    try {
      return JSON.parse(text.slice(6)) as SSEEvent;
    } catch {
      return null;
    }
  };

  const processResponse = (responseText: string) => {
    const newData = responseText.slice(lastIndex);
    lastIndex = responseText.length;

    const lines = newData.split("\n\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      
      const event = parseSSEData(line.trim());
      if (!event) continue;

      switch (event.type) {
        case "user_message":
          onUserMessage?.(event.message);
          break;
        case "chunk":
          if (event.content) {
            onChunk(event.content);
          }
          break;
        case "done":
          onComplete(event.message);
          break;
        case "error":
          onError(event.error || "Unknown error");
          break;
      }
    }
  };

  const fullUrl = new URL(url, getApiUrl()).toString();

  xhr.open("POST", fullUrl, true);
  xhr.setRequestHeader("Content-Type", "application/json");

  xhr.onprogress = () => {
    if (aborted) return;
    // Check for non-2xx status codes
    if (xhr.status >= 400) {
      onError(`Request failed with status ${xhr.status}`);
      return;
    }
    processResponse(xhr.responseText);
  };

  xhr.onload = () => {
    if (aborted) return;
    // Check for non-2xx status codes on completion
    if (xhr.status >= 400) {
      onError(`Request failed with status ${xhr.status}`);
      return;
    }
    processResponse(xhr.responseText);
  };

  xhr.onerror = () => {
    if (aborted) return;
    onError("Network error");
  };

  xhr.ontimeout = () => {
    if (aborted) return;
    onError("Request timeout");
  };

  xhr.send(JSON.stringify(body));

  return {
    abort: () => {
      aborted = true;
      xhr.abort();
    },
  };
}

export async function sendStreamingMessage(
  sessionId: string,
  content: string,
  callbacks: {
    onChunk: (content: string) => void;
    onComplete: (message: unknown) => void;
    onError: (error: string) => void;
    onUserMessage?: (message: unknown) => void;
  }
): Promise<{ abort: () => void }> {
  return createSSERequest({
    url: `/api/chat/sessions/${sessionId}/messages/stream`,
    body: { content },
    ...callbacks,
  });
}
