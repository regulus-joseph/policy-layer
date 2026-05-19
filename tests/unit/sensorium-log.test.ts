import { DCycleStore } from '../../src/security/sensorium-log';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const TEST_DIR = join(tmpdir(), `openclaw-dcycle-test-${process.pid}`);

describe('DCycleStore', () => {
  let store: DCycleStore;

  beforeEach(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
    store = new DCycleStore();
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {}
  });

  describe('log', () => {
    it('creates a record with cycle number starting at 1 for fresh session', async () => {
      const uid = `fresh_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const record = await store.log({
        sessionId: uid,
        agentId: 'agent1',
        signals: { success: true, successRate: 1.0, toolDetails: { total: 2, failed: 0, failedRate: 0, failedNames: [] }, cbrDetails: { hit: false, hitRate: 0, matchedCaseIds: [] }, severityDetails: { maxSeverity: 50, avgSeverity: 50, reason: 'ok', level: 'low' } },
        dPrime: 0.9,
        dPrimeStatus: 'HIGH_REJECT',
        decision: 'REJECT',
        trigger: { gate: 'input', operation: 'test' },
        windowSize: 20,
      });

      expect(record.cycleId).toBe(`${uid}:1`);
      expect(record.cycleNumber).toBe(1);
      expect(record.timestamp).toBeDefined();
    });

    it('auto-increments cycle number per session', async () => {
      const uid = `incr_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      await store.log({ sessionId: uid, agentId: 'a', signals: null as any, dPrime: null, dPrimeStatus: '', decision: 'ACCEPT' as any, trigger: {} as any, windowSize: 20 });
      await store.log({ sessionId: uid, agentId: 'a', signals: null as any, dPrime: null, dPrimeStatus: '', decision: 'ACCEPT' as any, trigger: {} as any, windowSize: 20 });
      const r3 = await store.log({ sessionId: uid, agentId: 'a', signals: null as any, dPrime: null, dPrimeStatus: '', decision: 'ACCEPT' as any, trigger: {} as any, windowSize: 20 });

      expect(r3.cycleNumber).toBe(3);
    });

    it('isolates cycle counters across sessions', async () => {
      const uidA = `isoA_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const uidB = `isoB_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      await store.log({ sessionId: uidA, agentId: 'a', signals: null as any, dPrime: null, dPrimeStatus: '', decision: 'ACCEPT' as any, trigger: {} as any, windowSize: 20 });
      await store.log({ sessionId: uidB, agentId: 'a', signals: null as any, dPrime: null, dPrimeStatus: '', decision: 'ACCEPT' as any, trigger: {} as any, windowSize: 20 });
      const r = await store.log({ sessionId: uidB, agentId: 'a', signals: null as any, dPrime: null, dPrimeStatus: '', decision: 'ACCEPT' as any, trigger: {} as any, windowSize: 20 });

      expect(r.cycleNumber).toBe(2);
    });
  });

  describe('forSession', () => {
    it('returns only records for specified session', async () => {
      const uid = `fs_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      await store.log({ sessionId: uid, agentId: 'a', signals: null as any, dPrime: null, dPrimeStatus: '', decision: 'ACCEPT' as any, trigger: {} as any, windowSize: 20 });
      await store.log({ sessionId: 'UNRELATED', agentId: 'a', signals: null as any, dPrime: null, dPrimeStatus: '', decision: 'ACCEPT' as any, trigger: {} as any, windowSize: 20 });
      await store.log({ sessionId: uid, agentId: 'a', signals: null as any, dPrime: null, dPrimeStatus: '', decision: 'ACCEPT' as any, trigger: {} as any, windowSize: 20 });

      const records = await store.forSession(uid);
      expect(records.length).toBe(2);
      for (const r of records) {
        expect(r.sessionId).toBe(uid);
      }
    });

    it('returns empty array for session with no records', async () => {
      const records = await store.forSession(`nonexistent_${Date.now()}`);
      expect(records).toEqual([]);
    });

    it('respects limit parameter', async () => {
      const uid = `lim_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      for (let i = 0; i < 5; i++) {
        await store.log({ sessionId: uid, agentId: 'a', signals: null as any, dPrime: null, dPrimeStatus: '', decision: 'ACCEPT' as any, trigger: {} as any, windowSize: 20 });
      }

      const records = await store.forSession(uid, 3);
      expect(records.length).toBeLessThanOrEqual(3);
    });
  });

  describe('recent', () => {
    it('returns last N records across all sessions', async () => {
      const uidA = `recA_${Date.now()}`;
      const uidB = `recB_${Date.now()}`;
      await store.log({ sessionId: uidA, agentId: 'a', signals: null as any, dPrime: null, dPrimeStatus: '', decision: 'ACCEPT' as any, trigger: {} as any, windowSize: 20 });
      await store.log({ sessionId: uidB, agentId: 'a', signals: null as any, dPrime: null, dPrimeStatus: '', decision: 'ACCEPT' as any, trigger: {} as any, windowSize: 20 });
      await store.log({ sessionId: uidA, agentId: 'a', signals: null as any, dPrime: null, dPrimeStatus: '', decision: 'ACCEPT' as any, trigger: {} as any, windowSize: 20 });

      const records = await store.recent(2);
      expect(records.length).toBeLessThanOrEqual(2);
    });
  });

  describe('stats', () => {
    it('counts records by decision', async () => {
      const uid = `stat_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      await store.log({ sessionId: uid, agentId: 'a', signals: null as any, dPrime: null, dPrimeStatus: '', decision: 'ACCEPT' as any, trigger: {} as any, windowSize: 20 });
      await store.log({ sessionId: uid, agentId: 'a', signals: null as any, dPrime: null, dPrimeStatus: '', decision: 'REJECT' as any, trigger: {} as any, windowSize: 20 });
      await store.log({ sessionId: uid, agentId: 'a', signals: null as any, dPrime: null, dPrimeStatus: '', decision: 'REJECT' as any, trigger: {} as any, windowSize: 20 });

      const stats = await store.stats(uid);
      expect(stats.total).toBe(3);
      expect(stats.byDecision['ACCEPT']).toBe(1);
      expect(stats.byDecision['REJECT']).toBe(2);
    });

    it('computes average dPrime', async () => {
      const uid = `avgdprime_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      await store.log({ sessionId: uid, agentId: 'a', signals: null as any, dPrime: 0.5, dPrimeStatus: '', decision: 'ACCEPT' as any, trigger: {} as any, windowSize: 20 });
      await store.log({ sessionId: uid, agentId: 'a', signals: null as any, dPrime: 0.9, dPrimeStatus: '', decision: 'ACCEPT' as any, trigger: {} as any, windowSize: 20 });

      const stats = await store.stats(uid);
      expect(stats.avgDPrime).toBeCloseTo(0.7);
    });

    it('returns null avgDPrime when no dPrime values', async () => {
      const uid = `nuldprime_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      await store.log({ sessionId: uid, agentId: 'a', signals: null as any, dPrime: null, dPrimeStatus: '', decision: 'ACCEPT' as any, trigger: {} as any, windowSize: 20 });

      const stats = await store.stats(uid);
      expect(stats.avgDPrime).toBeNull();
    });

    it('returns last10 records', async () => {
      const uid = `l10_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      for (let i = 0; i < 15; i++) {
        await store.log({ sessionId: uid, agentId: 'a', signals: null as any, dPrime: null, dPrimeStatus: '', decision: 'ACCEPT' as any, trigger: {} as any, windowSize: 20 });
      }

      const stats = await store.stats(uid);
      expect(stats.last10.length).toBeLessThanOrEqual(10);
    });
  });
});