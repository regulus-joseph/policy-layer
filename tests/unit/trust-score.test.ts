import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeSuccessRate,
  computeToolFailureRate,
  computeCriticalHitRate,
  computeAverageSeverity,
  computeTrustScore,
  computeDPrime,
  getMetrics,
  resetSessionMetrics,
  addCycle,
  DEFAULT_WEIGHTS,
  DEFAULT_SEVERITY_RULES,
} from '../../src/index';

// We test the exported functions that live in index.ts
// Note: computeCbrHitRate and the old computeDPrime are tested in sensorium-index.test.ts

describe('computeAverageSeverity — inverted trust model', () => {
  // Old behavior: severity 1000 → magnitude 1.0 (bad = high trust, WRONG)
  // New behavior: severity 1000 → magnitude 0.0 (bad = low trust, CORRECT)
  //              severity 50 → magnitude 0.95 (ok = high trust, CORRECT)

  it('returns null when no cycles', () => {
    const m = makeMetrics();
    expect(computeAverageSeverity(m)).toBeNull();
  });

  it('high severity (1000) → low trust (near 0)', () => {
    const m = makeMetrics();
    addCycle(m, { success: false, severity: 1000, totalTools: 1, failedTools: 1, cbrHit: false });
    const result = computeAverageSeverity(m);
    expect(result).toBeCloseTo(0.0, 1);
  });

  it('low severity (50) → high trust (near 1)', () => {
    const m = makeMetrics();
    addCycle(m, { success: true, severity: 50, totalTools: 1, failedTools: 0, cbrHit: false });
    const result = computeAverageSeverity(m);
    expect(result).toBeCloseTo(0.95, 1);
  });

  it('medium severity (300) → moderate trust', () => {
    const m = makeMetrics();
    addCycle(m, { success: false, severity: 300, totalTools: 1, failedTools: 1, cbrHit: false });
    const result = computeAverageSeverity(m);
    expect(result).toBeCloseTo(0.7, 1);
  });

  it('averages severity across window', () => {
    const m = makeMetrics();
    addCycle(m, { success: false, severity: 50, totalTools: 1, failedTools: 0, cbrHit: false });
    addCycle(m, { success: false, severity: 1000, totalTools: 1, failedTools: 1, cbrHit: false });
    // avg severity = (50+1000)/2 = 525 → trust = 1 - 0.525 = 0.475
    const result = computeAverageSeverity(m);
    expect(result).toBeCloseTo(0.475, 2);
  });
});

describe('computeCriticalHitRate', () => {
  it('returns 0 when no cycles', () => {
    const m = makeMetrics();
    expect(computeCriticalHitRate(m)).toBe(0);
  });

  it('counts criticalHit: true cycles', () => {
    const m = makeMetrics();
    addCycle(m, { success: false, severity: 1000, totalTools: 1, failedTools: 1, cbrHit: false, criticalHit: true });
    addCycle(m, { success: true, severity: 50, totalTools: 1, failedTools: 0, cbrHit: false, criticalHit: false });
    addCycle(m, { success: true, severity: 50, totalTools: 1, failedTools: 0, cbrHit: false, criticalHit: false });
    expect(computeCriticalHitRate(m)).toBeCloseTo(0.333, 2);
  });

  it('only counts true values', () => {
    const m = makeMetrics();
    for (let i = 0; i < 5; i++) {
      addCycle(m, { success: true, severity: 50, totalTools: 1, failedTools: 0, cbrHit: false, criticalHit: false });
    }
    expect(computeCriticalHitRate(m)).toBe(0);
  });
});

describe('computeTrustScore — new D-prime signal system', () => {
  // Trust score is a weighted average of:
  // - successRate (weight: 0.20) — high success → high trust
  // - toolFailureRate (weight: 0.15) — low failure → high trust
  // - avgSeverity (weight: 0.15) — low severity → high trust [INVERTED from old]
  // - criticalHit (weight: 0.25) — few hits → high trust
  // - approvalPassed (weight: 0.10) — approvals → trust up
  // - approvalDenied (weight: 0.10) — denials → trust down
  // - userNudge (weight: 0.20) — nudges → trust down
  // - fastLaneUse (weight: 0.05) — fast-lane → trust up

  beforeEach(() => {
    resetSessionMetrics();
  });

  it('returns null when no signals', () => {
    const m = makeMetrics();
    expect(computeTrustScore(m)).toBeNull();
  });

  it('returns 1.0 for perfect trust session', () => {
    const m = makeMetrics();
    // All good: high success rate, no failures, low severity
    addCycle(m, { success: true, severity: 50, totalTools: 5, failedTools: 0, cbrHit: false });
    addCycle(m, { success: true, severity: 50, totalTools: 5, failedTools: 0, cbrHit: false });
    addCycle(m, { success: true, severity: 50, totalTools: 5, failedTools: 0, cbrHit: false });
    const score = computeTrustScore(m);
    expect(score).not.toBeNull();
    expect(score).toBeGreaterThan(0.8);
  });

  it('returns low score for failing session with high severity', () => {
    const m = makeMetrics();
    addCycle(m, { success: false, severity: 1000, totalTools: 3, failedTools: 3, cbrHit: false, criticalHit: true });
    addCycle(m, { success: false, severity: 800, totalTools: 2, failedTools: 2, cbrHit: false });
    const score = computeTrustScore(m);
    expect(score).not.toBeNull();
    expect(score).toBeLessThan(0.4);
  });

  it('penalizes critical pattern hits', () => {
    const m1 = makeMetrics();
    const m2 = makeMetrics();
    // Both: 2 successes, 1 critical hit
    addCycle(m1, { success: true, severity: 50, totalTools: 1, failedTools: 0, cbrHit: false });
    addCycle(m1, { success: true, severity: 50, totalTools: 1, failedTools: 0, cbrHit: false });
    addCycle(m2, { success: true, severity: 50, totalTools: 1, failedTools: 0, cbrHit: false });
    addCycle(m2, { success: true, severity: 50, totalTools: 1, failedTools: 0, cbrHit: false, criticalHit: true });
    // m2 has a criticalHit, should score lower
    const score1 = computeTrustScore(m1);
    const score2 = computeTrustScore(m2);
    expect(score2).toBeLessThan(score1);
  });

  it('score bounded between 0 and 1', () => {
    const m = makeMetrics();
    for (let i = 0; i < 10; i++) {
      addCycle(m, { success: false, severity: 1000, totalTools: 5, failedTools: 5, cbrHit: false, criticalHit: true });
    }
    const score = computeTrustScore(m);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe('computeDPrime — backwards compatible alias', () => {
  it('computeDPrime returns same as computeTrustScore', () => {
    const m = makeMetrics();
    addCycle(m, { success: true, severity: 50, totalTools: 2, failedTools: 0, cbrHit: false });
    addCycle(m, { success: false, severity: 300, totalTools: 2, failedTools: 1, cbrHit: false });
    expect(computeDPrime(m)).toBe(computeTrustScore(m));
  });
});

describe('trustSignals accumulation', () => {
  beforeEach(() => {
    resetSessionMetrics();
  });

  it('trustSignals starts at zero', () => {
    const m = makeMetrics();
    expect(m.trustSignals.criticalHits).toBe(0);
    expect(m.trustSignals.approvalPasses).toBe(0);
    expect(m.trustSignals.approvalDenials).toBe(0);
    expect(m.trustSignals.userNudges).toBe(0);
    expect(m.trustSignals.fastLaneUses).toBe(0);
  });

  it('trustSignals can be incremented', () => {
    const m = makeMetrics();
    m.trustSignals.criticalHits++;
    m.trustSignals.approvalPasses += 3;
    m.trustSignals.approvalDenials++;
    m.trustSignals.userNudges++;
    m.trustSignals.fastLaneUses += 5;
    expect(m.trustSignals.criticalHits).toBe(1);
    expect(m.trustSignals.approvalPasses).toBe(3);
    expect(m.trustSignals.approvalDenials).toBe(1);
    expect(m.trustSignals.userNudges).toBe(1);
    expect(m.trustSignals.fastLaneUses).toBe(5);
  });
});

// Helper
let _counter = 0;
function makeMetrics() {
  _counter++;
  const key = `trust-test-${_counter}-${Date.now()}`;
  const m = getMetrics(key) || {
    cycles: [],
    callCounter: 0,
    lastRecordedSuccess: null,
    lastPolicyResult: null,
    config: {
      window: 20,
      weights: DEFAULT_WEIGHTS,
      severityRules: DEFAULT_SEVERITY_RULES,
      maxCyclesMultiplier: 3,
      sigmoid: { midpoint: 0.58, steepness: 0.10, acceptBelow: 0.15, rejectAbove: 0.85 },
      dBands: { low: 0.50, high: 0.66 },
      safeDirs: [],
      neverWhitelistPatterns: [],
      evolveMode: false,
    },
    trustSignals: {
      criticalHits: 0,
      approvalPasses: 0,
      approvalDenials: 0,
      userNudges: 0,
      fastLaneUses: 0,
    },
  };
  // Ensure signals exist
  if (!m.trustSignals) {
    m.trustSignals = { criticalHits: 0, approvalPasses: 0, approvalDenials: 0, userNudges: 0, fastLaneUses: 0 };
  }
  return m;
}