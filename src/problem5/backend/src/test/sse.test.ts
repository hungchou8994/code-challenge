import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import after mocking if needed, but SseManager has NO dependencies — import directly
// We use unique IDs per test to avoid cross-test bleed with the singleton
import { sseManager } from '../lib/sse-manager.js';

// Helper: fake Express Response
const makeRes = () => ({ write: vi.fn() } as any);

describe('SseManager', () => {
  // Use unique IDs per test to avoid singleton cross-contamination
  let testId1: string;
  let testId2: string;
  let testId3: string;

  beforeEach(() => {
    // Generate unique IDs per test run to isolate singleton state
    const ts = Date.now() + Math.random().toString(36).slice(2);
    testId1 = `test-client-a-${ts}`;
    testId2 = `test-client-b-${ts}`;
    testId3 = `test-client-c-${ts}`;
  });

  afterEach(() => {
    // Clean up any clients added during this test
    sseManager.removeClient(testId1);
    sseManager.removeClient(testId2);
    sseManager.removeClient(testId3);
  });

  it('Test 1 (addClient): After addClient(id, res), broadcast() writes score-update event to that res', () => {
    const res = makeRes();
    sseManager.addClient(testId1, res);

    const rankings = [{ rank: 1, userId: 'u1', userName: 'Alice', totalScore: 100 }];
    sseManager.broadcast(rankings);

    expect(res.write).toHaveBeenCalledTimes(1);
    const written = res.write.mock.calls[0][0] as string;
    expect(written).toContain('event: score-update');
    expect(written).toContain(JSON.stringify(rankings));
  });

  it('Test 2 (removeClient): After removeClient(id), broadcast() does NOT write to that res', () => {
    const res = makeRes();
    sseManager.addClient(testId1, res);
    sseManager.removeClient(testId1);

    const rankings = [{ rank: 1, userId: 'u1', userName: 'Alice', totalScore: 100 }];
    sseManager.broadcast(rankings);

    expect(res.write).not.toHaveBeenCalled();
  });

  it('Test 3 (multiple clients): All connected res objects receive the event', () => {
    const res1 = makeRes();
    const res2 = makeRes();
    sseManager.addClient(testId1, res1);
    sseManager.addClient(testId2, res2);

    const rankings = [{ rank: 1, userId: 'u1', userName: 'Alice', totalScore: 100 }];
    sseManager.broadcast(rankings);

    expect(res1.write).toHaveBeenCalledTimes(1);
    expect(res2.write).toHaveBeenCalledTimes(1);
  });

  it('Test 4 (no clients): broadcast() resolves without throwing when no clients are connected', () => {
    // All clients removed or never added — no throw expected
    expect(() => {
      sseManager.broadcast([]);
    }).not.toThrow();
  });

  it('Test 5 (broadcast content): The data payload is JSON.stringify of the rankings array passed to broadcast()', () => {
    const res = makeRes();
    sseManager.addClient(testId1, res);

    const rankings = [
      { rank: 1, userId: 'abc', userName: 'Bob', userEmail: 'bob@test.com', userDepartment: 'Eng', totalScore: 50, tasksCompleted: 2 },
    ];
    sseManager.broadcast(rankings);

    const written = res.write.mock.calls[0][0] as string;
    const expectedPayload = `event: score-update\ndata: ${JSON.stringify(rankings)}\n\n`;
    expect(written).toBe(expectedPayload);
  });
});
