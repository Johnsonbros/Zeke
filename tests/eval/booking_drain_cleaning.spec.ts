/**
 * Golden flow test: Booking a drain cleaning appointment.
 * 
 * This tests the full flow from user request to confirmation SMS:
 * 1. User asks to book drain cleaning
 * 2. Agent checks calendar for availability
 * 3. Agent creates calendar event
 * 4. Agent sends SMS confirmation
 * 
 * Validates each step + p50/p95 latencies + cost.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { EvalScenario, EvalResult, EvalRunSummary } from '../../eval/golden/types';
import { EvalRunner } from '../../eval/golden/runner';
import { IntegrationStubs } from '../../eval/golden/stubs';
import { formatResultsTable, writeResultsJson } from '../../eval/golden/metrics';
import * as fs from 'fs/promises';
import * as path from 'path';

const BOOKING_DRAIN_CLEANING_SCENARIO: EvalScenario = {
  id: 'booking_drain_cleaning_001',
  name: 'Book drain cleaning appointment',
  description: 'User requests to schedule a drain cleaning service appointment',
  userMessage: 'I need to book a drain cleaning for tomorrow at 2pm',
  expectedSteps: [
    {
      name: 'Check calendar availability',
      description: 'Agent should check if the requested time slot is available',
      expectedTool: 'get_calendar_events',
      validate: (result: unknown) => {
        const call = result as { name: string; args: Record<string, unknown> };
        return call.name === 'get_calendar_events';
      },
    },
    {
      name: 'Create calendar event',
      description: 'Agent should create a calendar event for the appointment',
      expectedTool: 'create_calendar_event',
      validate: (result: unknown) => {
        const call = result as { name: string; args: Record<string, unknown> };
        return (
          call.name === 'create_calendar_event' &&
          typeof call.args.title === 'string' &&
          call.args.title.toLowerCase().includes('drain')
        );
      },
    },
    {
      name: 'Send confirmation SMS',
      description: 'Agent should send an SMS confirming the appointment',
      expectedTool: 'send_sms',
      validate: (result: unknown) => {
        const call = result as { name: string; args: Record<string, unknown> };
        return (
          call.name === 'send_sms' &&
          typeof call.args.message === 'string'
        );
      },
    },
  ],
  expectedFinalResponse: /booked|scheduled|confirmed/i,
};

function createMockExecutor(stubs: IntegrationStubs) {
  return async (message: string) => {
    const toolCalls: Array<{ name: string; args: Record<string, unknown>; latencyMs: number }> = [];
    let promptTokens = 0;
    let completionTokens = 0;

    const calendarStub = stubs.createCalendarStub();
    const smsStub = stubs.createSmsStub();

    const step1Start = Date.now();
    await calendarStub.getEvents({ date: 'tomorrow' });
    toolCalls.push({
      name: 'get_calendar_events',
      args: { date: 'tomorrow' },
      latencyMs: Date.now() - step1Start,
    });
    promptTokens += 200;
    completionTokens += 50;

    const step2Start = Date.now();
    await calendarStub.createEvent({
      title: 'Drain Cleaning Service',
      start: '2024-12-18T14:00:00',
      end: '2024-12-18T15:00:00',
    });
    toolCalls.push({
      name: 'create_calendar_event',
      args: {
        title: 'Drain Cleaning Service',
        start: '2024-12-18T14:00:00',
        end: '2024-12-18T15:00:00',
      },
      latencyMs: Date.now() - step2Start,
    });
    promptTokens += 150;
    completionTokens += 40;

    const step3Start = Date.now();
    await smsStub.send({
      to: '+15551234567',
      message: 'Your drain cleaning appointment is confirmed for tomorrow at 2pm.',
    });
    toolCalls.push({
      name: 'send_sms',
      args: {
        to: '+15551234567',
        message: 'Your drain cleaning appointment is confirmed for tomorrow at 2pm.',
      },
      latencyMs: Date.now() - step3Start,
    });
    promptTokens += 100;
    completionTokens += 30;

    return {
      response: 'I\'ve booked your drain cleaning appointment for tomorrow at 2pm and sent you a confirmation SMS.',
      toolCalls,
      tokenUsage: { promptTokens, completionTokens },
    };
  };
}

describe('Booking Drain Cleaning - Golden Flow', () => {
  let runner: EvalRunner;
  let stubs: IntegrationStubs;

  beforeEach(() => {
    stubs = new IntegrationStubs({
      calendar: {
        events: [],
        createSuccess: true,
      },
      sms: {
        sendSuccess: true,
        messageId: 'msg_confirm_123',
      },
    });
    runner = new EvalRunner(stubs);
    runner.registerScenario(BOOKING_DRAIN_CLEANING_SCENARIO);
  });

  it('should complete all steps successfully', async () => {
    const executor = createMockExecutor(stubs);
    const result = await runner.runScenario(BOOKING_DRAIN_CLEANING_SCENARIO, executor);

    expect(result.passed).toBe(true);
    expect(result.steps.length).toBe(4);
    expect(result.steps.every(s => s.passed)).toBe(true);
  });

  it('should validate calendar check step', async () => {
    const executor = createMockExecutor(stubs);
    const result = await runner.runScenario(BOOKING_DRAIN_CLEANING_SCENARIO, executor);

    const calendarStep = result.steps.find(s => s.stepName === 'Check calendar availability');
    expect(calendarStep).toBeDefined();
    expect(calendarStep?.passed).toBe(true);
    expect(calendarStep?.toolCalled).toBe('get_calendar_events');
  });

  it('should validate calendar event creation step', async () => {
    const executor = createMockExecutor(stubs);
    const result = await runner.runScenario(BOOKING_DRAIN_CLEANING_SCENARIO, executor);

    const createStep = result.steps.find(s => s.stepName === 'Create calendar event');
    expect(createStep).toBeDefined();
    expect(createStep?.passed).toBe(true);
    expect(createStep?.toolCalled).toBe('create_calendar_event');
    expect(createStep?.toolArgs?.title).toContain('Drain');
  });

  it('should validate SMS confirmation step', async () => {
    const executor = createMockExecutor(stubs);
    const result = await runner.runScenario(BOOKING_DRAIN_CLEANING_SCENARIO, executor);

    const smsStep = result.steps.find(s => s.stepName === 'Send confirmation SMS');
    expect(smsStep).toBeDefined();
    expect(smsStep?.passed).toBe(true);
    expect(smsStep?.toolCalled).toBe('send_sms');
  });

  it('should validate final response contains confirmation', async () => {
    const executor = createMockExecutor(stubs);
    const result = await runner.runScenario(BOOKING_DRAIN_CLEANING_SCENARIO, executor);

    const responseStep = result.steps.find(s => s.stepName === 'Final Response Check');
    expect(responseStep).toBeDefined();
    expect(responseStep?.passed).toBe(true);
  });

  it('should calculate p50 and p95 latencies', async () => {
    const executor = createMockExecutor(stubs);
    const result = await runner.runScenario(BOOKING_DRAIN_CLEANING_SCENARIO, executor);

    expect(result.metrics.p50LatencyMs).toBeGreaterThanOrEqual(0);
    expect(result.metrics.p95LatencyMs).toBeGreaterThanOrEqual(result.metrics.p50LatencyMs);
    expect(result.metrics.latencies.length).toBe(4);
  });

  it('should calculate token cost', async () => {
    const executor = createMockExecutor(stubs);
    const result = await runner.runScenario(BOOKING_DRAIN_CLEANING_SCENARIO, executor);

    expect(result.metrics.totalCost).toBeGreaterThan(0);
    expect(result.metrics.tokenUsage.promptTokens).toBe(450);
    expect(result.metrics.tokenUsage.completionTokens).toBe(120);
  });

  it('should run full eval and output results', async () => {
    const executor = createMockExecutor(stubs);
    const summary = await runner.runAll(executor, {
      verbose: false,
      outputJson: false,
    });

    expect(summary.totalScenarios).toBe(1);
    expect(summary.passedScenarios).toBe(1);
    expect(summary.failedScenarios).toBe(0);
    expect(summary.aggregateMetrics.p50LatencyMs).toBeGreaterThanOrEqual(0);
    expect(summary.aggregateMetrics.totalCost).toBeGreaterThan(0);
  });

  it('should generate formatted results table', async () => {
    const executor = createMockExecutor(stubs);
    const summary = await runner.runAll(executor);

    const table = formatResultsTable(summary);

    expect(table).toContain('EVAL RUN');
    expect(table).toContain('Book drain cleaning appointment');
    expect(table).toContain('PASS');
    expect(table).toContain('p50 Latency');
    expect(table).toContain('p95 Latency');
    expect(table).toContain('Total Cost');
  });

  it('should write eval-results.json', async () => {
    const executor = createMockExecutor(stubs);
    const summary = await runner.runAll(executor);

    const outputPath = 'eval/results/test-eval-results.json';
    await writeResultsJson(summary, outputPath);

    const content = await fs.readFile(outputPath, 'utf-8');
    const parsed = JSON.parse(content);

    expect(parsed.runId).toBeDefined();
    expect(parsed.totalScenarios).toBe(1);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.aggregateMetrics).toBeDefined();

    await fs.unlink(outputPath);
  });
});

describe('Booking Drain Cleaning - Failure Cases', () => {
  let runner: EvalRunner;
  let stubs: IntegrationStubs;

  beforeEach(() => {
    stubs = new IntegrationStubs();
    runner = new EvalRunner(stubs);
  });

  it('should fail when calendar step is missing', async () => {
    runner.registerScenario(BOOKING_DRAIN_CLEANING_SCENARIO);

    const badExecutor = async () => ({
      response: 'Done',
      toolCalls: [
        { name: 'send_sms', args: {}, latencyMs: 10 },
      ],
      tokenUsage: { promptTokens: 100, completionTokens: 50 },
    });

    const result = await runner.runScenario(BOOKING_DRAIN_CLEANING_SCENARIO, badExecutor);

    expect(result.passed).toBe(false);
    expect(result.steps.some(s => !s.passed)).toBe(true);
  });

  it('should fail when wrong tool is called', async () => {
    runner.registerScenario(BOOKING_DRAIN_CLEANING_SCENARIO);

    const badExecutor = async () => ({
      response: 'Done',
      toolCalls: [
        { name: 'wrong_tool', args: {}, latencyMs: 10 },
        { name: 'create_calendar_event', args: { title: 'Drain' }, latencyMs: 10 },
        { name: 'send_sms', args: { message: 'Hi' }, latencyMs: 10 },
      ],
      tokenUsage: { promptTokens: 100, completionTokens: 50 },
    });

    const result = await runner.runScenario(BOOKING_DRAIN_CLEANING_SCENARIO, badExecutor);

    expect(result.passed).toBe(false);
    const failedStep = result.steps.find(s => !s.passed);
    expect(failedStep?.error).toContain('Expected tool');
  });

  it('should fail when response does not contain confirmation', async () => {
    runner.registerScenario(BOOKING_DRAIN_CLEANING_SCENARIO);

    const badExecutor = async () => ({
      response: 'I cannot help with that.',
      toolCalls: [
        { name: 'get_calendar_events', args: {}, latencyMs: 10 },
        { name: 'create_calendar_event', args: { title: 'Drain Cleaning' }, latencyMs: 10 },
        { name: 'send_sms', args: { message: 'Test' }, latencyMs: 10 },
      ],
      tokenUsage: { promptTokens: 100, completionTokens: 50 },
    });

    const result = await runner.runScenario(BOOKING_DRAIN_CLEANING_SCENARIO, badExecutor);

    expect(result.passed).toBe(false);
    const responseStep = result.steps.find(s => s.stepName === 'Final Response Check');
    expect(responseStep?.passed).toBe(false);
  });
});
