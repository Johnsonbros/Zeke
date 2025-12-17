/**
 * Stub utilities for mocking integrations during eval runs.
 */

import { vi } from 'vitest';

export interface StubConfig {
  openai?: {
    response: string;
    toolCalls?: Array<{
      name: string;
      arguments: Record<string, unknown>;
    }>;
    latencyMs?: number;
    tokenUsage?: {
      promptTokens: number;
      completionTokens: number;
    };
  };
  calendar?: {
    events?: Array<{
      id: string;
      title: string;
      start: string;
      end: string;
    }>;
    createSuccess?: boolean;
  };
  sms?: {
    sendSuccess?: boolean;
    messageId?: string;
  };
}

export class IntegrationStubs {
  private config: StubConfig;
  private callLog: Array<{
    integration: string;
    method: string;
    args: unknown;
    timestamp: number;
  }> = [];

  constructor(config: StubConfig = {}) {
    this.config = config;
  }

  getCallLog() {
    return this.callLog;
  }

  clearCallLog() {
    this.callLog = [];
  }

  private log(integration: string, method: string, args: unknown) {
    this.callLog.push({
      integration,
      method,
      args,
      timestamp: Date.now(),
    });
  }

  createOpenAIStub() {
    const self = this;
    return {
      chat: {
        completions: {
          create: vi.fn().mockImplementation(async (params: unknown) => {
            self.log('openai', 'chat.completions.create', params);
            
            const latency = self.config.openai?.latencyMs ?? 100;
            await new Promise(resolve => setTimeout(resolve, latency));

            const toolCalls = self.config.openai?.toolCalls?.map((tc, i) => ({
              id: `call_${i}`,
              type: 'function',
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.arguments),
              },
            }));

            return {
              id: 'chatcmpl-stub',
              choices: [{
                message: {
                  role: 'assistant',
                  content: self.config.openai?.response ?? 'Stubbed response',
                  tool_calls: toolCalls,
                },
                finish_reason: toolCalls ? 'tool_calls' : 'stop',
              }],
              usage: {
                prompt_tokens: self.config.openai?.tokenUsage?.promptTokens ?? 100,
                completion_tokens: self.config.openai?.tokenUsage?.completionTokens ?? 50,
                total_tokens: 150,
              },
            };
          }),
        },
      },
    };
  }

  createCalendarStub() {
    const self = this;
    return {
      getEvents: vi.fn().mockImplementation(async (params: unknown) => {
        self.log('calendar', 'getEvents', params);
        await new Promise(resolve => setTimeout(resolve, 50));
        return {
          success: true,
          events: self.config.calendar?.events ?? [],
        };
      }),
      createEvent: vi.fn().mockImplementation(async (params: unknown) => {
        self.log('calendar', 'createEvent', params);
        await new Promise(resolve => setTimeout(resolve, 50));
        return {
          success: self.config.calendar?.createSuccess ?? true,
          eventId: 'evt_stub_123',
        };
      }),
    };
  }

  createSmsStub() {
    const self = this;
    return {
      send: vi.fn().mockImplementation(async (params: unknown) => {
        self.log('sms', 'send', params);
        await new Promise(resolve => setTimeout(resolve, 30));
        return {
          success: self.config.sms?.sendSuccess ?? true,
          messageId: self.config.sms?.messageId ?? 'msg_stub_456',
        };
      }),
    };
  }
}

export function createDefaultStubs(): IntegrationStubs {
  return new IntegrationStubs({
    openai: {
      response: 'I can help you with that.',
      latencyMs: 100,
      tokenUsage: {
        promptTokens: 500,
        completionTokens: 150,
      },
    },
    calendar: {
      events: [
        {
          id: 'evt_1',
          title: 'Morning Standup',
          start: '2024-12-17T09:00:00',
          end: '2024-12-17T09:30:00',
        },
      ],
      createSuccess: true,
    },
    sms: {
      sendSuccess: true,
      messageId: 'msg_12345',
    },
  });
}
