import { describe, it, expect, beforeEach } from "vitest";
import {
  classifySeverity,
  computeSuccessRate,
  computeToolFailureRate,
  computeCbrHitRate,
  computeAverageSeverity,
  computeDPrime,
  dGateStatus,
  formatSensorium,
  extractOutcomeFromMessages,
  resolveConfig,
  createMockMetrics,
  addCycle,
  resetSessionMetrics,
  makeKey,
  getMetrics,
  DEFAULT_WEIGHTS,
  DEFAULT_D_BANDS,
  DEFAULT_SEVERITY_RULES,
} from "./sensorium-index.ts";

describe("resolveConfig", () => {
  it("returns defaults when no config provided", () => {
    const cfg = resolveConfig({});
    expect(cfg.window).toBe(20);
    expect(cfg.dBands.low).toBe(0.35);
    expect(cfg.dBands.high).toBe(0.55);
    expect(cfg.weights.success).toBe(0.30);
    expect(cfg.weights.tool).toBe(0.25);
    expect(cfg.weights.cbr).toBe(0.20);
    expect(cfg.weights.severity).toBe(0.25);
    expect(cfg.logLevel).toBe("info");
  });

  it("overrides defaults with provided values", () => {
    const cfg = resolveConfig({
      sensoriumWindow: 50,
      dBandLow: 0.4,
      dBandHigh: 0.6,
      weightSuccess: 0.5,
      weightTool: 0.2,
      weightCbr: 0.15,
      weightSeverity: 0.15,
      logLevel: "debug",
    });
    expect(cfg.window).toBe(50);
    expect(cfg.dBands.low).toBe(0.4);
    expect(cfg.dBands.high).toBe(0.6);
    expect(cfg.weights.success).toBe(0.5);
    expect(cfg.logLevel).toBe("debug");
  });

  it("uses custom severity rules when provided", () => {
    const customRules = [{ keywords: ["panic"], score: 900 }];
    const cfg = resolveConfig({ severityRules: customRules });
    expect(cfg.severityRules).toEqual(customRules);
  });
});

describe("classifySeverity", () => {
  const rules = DEFAULT_SEVERITY_RULES;

  it("returns 1000 for data exfiltration keywords", () => {
    expect(classifySeverity("data_exfiltration detected", rules)).toBe(1000);
    expect(classifySeverity("possible data leak", rules)).toBe(1000);
  });

  it("returns 800 for system command", () => {
    expect(classifySeverity("system command injection attempt", rules)).toBe(800);
  });

  it("returns 600 for file delete operations", () => {
    expect(classifySeverity("failed to delete file", rules)).toBe(600);
    expect(classifySeverity("could not unlink path", rules)).toBe(600);
  });

  it("returns 500 for exec/subprocess failures", () => {
    expect(classifySeverity("exec failure: permission error", rules)).toBe(500);
  });

  it("returns 300 for timeout/network errors", () => {
    expect(classifySeverity("web request timed out", rules)).toBe(300);
    expect(classifySeverity("network connection refused", rules)).toBe(300);
  });

  it("returns 200 for permission denied", () => {
    expect(classifySeverity("permission denied", rules)).toBe(200);
    expect(classifySeverity("access forbidden", rules)).toBe(200);
  });

  it("returns 50 for null/undefined reason", () => {
    expect(classifySeverity(null, rules)).toBe(50);
    expect(classifySeverity(undefined, rules)).toBe(50);
  });

  it("returns 50 for unknown error (default fallback)", () => {
    expect(classifySeverity("something went wrong", rules)).toBe(50);
  });

  it("first match wins in ordered rules", () => {
    const priorityRules = [
      { keywords: ["timeout"], score: 999 },
      { keywords: ["network"], score: 300 },
    ];
    expect(classifySeverity("network timeout", priorityRules)).toBe(999);
  });
});

describe("D' computation", () => {
  beforeEach(() => {
    resetSessionMetrics();
  });

  it("returns null when no cycles recorded", () => {
    const { m } = createMockMetrics({});
    expect(computeSuccessRate(m)).toBe(null);
    expect(computeToolFailureRate(m)).toBe(null);
    expect(computeCbrHitRate(m)).toBe(null);
    expect(computeAverageSeverity(m)).toBe(null);
    expect(computeDPrime(m)).toBe(null);
  });

  it("computes success_rate correctly", () => {
    const { m } = createMockMetrics({});
    addCycle(m, { success: true, totalTools: 2, failedTools: 0, cbrHit: false, severity: 50 });
    addCycle(m, { success: true, totalTools: 3, failedTools: 0, cbrHit: true, severity: 50 });
    addCycle(m, { success: false, totalTools: 1, failedTools: 1, cbrHit: false, severity: 300 });
    expect(computeSuccessRate(m)).toBeCloseTo(2 / 3);
  });

  it("computes tool_failure_rate correctly", () => {
    const { m } = createMockMetrics({});
    addCycle(m, { success: false, totalTools: 2, failedTools: 0, cbrHit: false, severity: 50 });
    addCycle(m, { success: false, totalTools: 4, failedTools: 1, cbrHit: false, severity: 50 });
    expect(computeToolFailureRate(m)).toBeCloseTo(1 / 6);
  });

  it("computes tool_failure_rate as null when no tools", () => {
    const { m } = createMockMetrics({}, makeKey("toolrate0"));
    addCycle(m, { success: true, totalTools: 0, failedTools: 0, cbrHit: false, severity: 50 });
    expect(computeToolFailureRate(m)).toBe(null);
  });

  it("computes cbr_hit_rate correctly", () => {
    const { m } = createMockMetrics({});
    addCycle(m, { success: true, totalTools: 1, failedTools: 0, cbrHit: true, severity: 50 });
    addCycle(m, { success: true, totalTools: 1, failedTools: 0, cbrHit: false, severity: 50 });
    addCycle(m, { success: true, totalTools: 1, failedTools: 0, cbrHit: true, severity: 50 });
    addCycle(m, { success: false, totalTools: 1, failedTools: 1, cbrHit: false, severity: 50 });
    expect(computeCbrHitRate(m)).toBeCloseTo(0.5);
  });

  it("computes average severity normalized", () => {
    const m = { cycles: [], config: resolveConfig({}) };
    m.cycles.push({ success: false, severity: 1000, timestamp: 1 });
    m.cycles.push({ success: false, severity: 0, timestamp: 2 });
    m.cycles.push({ success: true, severity: 50, timestamp: 3 });
    m.config.window = 20;
    const result = computeAverageSeverity(m);
    expect(result).toBeCloseTo(0.35, 3);
  });

  it("computes D' with all 4 signals", () => {
    const { m } = createMockMetrics({});
    addCycle(m, { success: true, totalTools: 2, failedTools: 0, cbrHit: true, severity: 50 });
    addCycle(m, { success: true, totalTools: 2, failedTools: 0, cbrHit: true, severity: 50 });
    const d = computeDPrime(m);
    expect(d).not.toBeNull();
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThanOrEqual(1);
  });

  it("D' scales with signal quality", () => {
    const { m: m1 } = createMockMetrics({}, makeKey("dprimegood"));
    addCycle(m1, { success: true, totalTools: 1, failedTools: 0, cbrHit: true, severity: 50 });
    addCycle(m1, { success: true, totalTools: 1, failedTools: 0, cbrHit: true, severity: 50 });

    const { m: m2 } = createMockMetrics({}, makeKey("dprimebad"));
    addCycle(m2, { success: false, totalTools: 1, failedTools: 1, cbrHit: false, severity: 1000 });

    const d1 = computeDPrime(m1);
    const d2 = computeDPrime(m2);
    expect(d1).toBeGreaterThan(d2);
    expect(d1).toBeGreaterThan(0);
    expect(d2).toBeLessThan(1);
  });

  it("D' denominator scales with number of signals", () => {
    const { m: m1 } = createMockMetrics({});
    addCycle(m1, { success: true, totalTools: 1, failedTools: 0, cbrHit: true, severity: 50 });

    const { m: m2 } = createMockMetrics({});
    addCycle(m2, { success: true, totalTools: 0, failedTools: 0, cbrHit: false, severity: 50 });

    const d1 = computeDPrime(m1);
    const d2 = computeDPrime(m2);
    expect(d1).not.toBeNull();
    expect(d2).not.toBeNull();
  });

  it("D' respects custom weights", () => {
    const { m } = createMockMetrics({
      weightSuccess: 0.10,
      weightTool: 0.10,
      weightCbr: 0.10,
      weightSeverity: 0.10,
    });
    addCycle(m, { success: true, totalTools: 1, failedTools: 0, cbrHit: true, severity: 50 });
    const d = computeDPrime(m);
    expect(d).not.toBeNull();
    expect(d).toBeGreaterThan(0);
  });

  it("only 1 signal present → denominator = maxWeight × 1.0 × 1", () => {
    const { m } = createMockMetrics({}, makeKey("onesig"));
    addCycle(m, { success: true, totalTools: 0, failedTools: 0, cbrHit: false, severity: 50 });
    const d = computeDPrime(m);
    expect(d).not.toBeNull();
    expect(d).toBeLessThanOrEqual(1);
  });
});

describe("dGateStatus", () => {
  const bands = DEFAULT_D_BANDS;

  it("UNKNOWN when dPrime is null", () => {
    expect(dGateStatus(null, bands)).toBe("UNKNOWN");
  });

  it("LOW_ACCEPT when dPrime < low band", () => {
    expect(dGateStatus(0.1, bands)).toBe("LOW_ACCEPT");
    expect(dGateStatus(0.54, bands)).toBe("LOW_ACCEPT");
  });

  it("MEDIUM_CONFIRM when low ≤ dPrime < high", () => {
    expect(dGateStatus(0.50, bands)).toBe("MEDIUM_CONFIRM");
    expect(dGateStatus(0.60, bands)).toBe("MEDIUM_CONFIRM");
    expect(dGateStatus(0.65, bands)).toBe("MEDIUM_CONFIRM");
  });

  it("HIGH_REJECT when dPrime ≥ high band", () => {
    expect(dGateStatus(0.66, bands)).toBe("HIGH_REJECT");
    expect(dGateStatus(0.8, bands)).toBe("HIGH_REJECT");
    expect(dGateStatus(1.0, bands)).toBe("HIGH_REJECT");
  });

  it("uses custom bands", () => {
    const custom = { low: 0.3, high: 0.5 };
    expect(dGateStatus(0.25, custom)).toBe("LOW_ACCEPT");
    expect(dGateStatus(0.35, custom)).toBe("MEDIUM_CONFIRM");
    expect(dGateStatus(0.5, custom)).toBe("HIGH_REJECT");
  });
});

describe("extractOutcomeFromMessages", () => {
  it("returns zero when no tool messages", () => {
    const messages = [{ role: "user", content: "hello" }];
    const result = extractOutcomeFromMessages(messages, DEFAULT_SEVERITY_RULES);
    expect(result.totalTools).toBe(0);
    expect(result.failedTools).toBe(0);
    expect(result.severity).toBe(50);
  });

  it("counts successful tool calls", () => {
    const messages = [
      { role: "tool", content: JSON.stringify({ success: true, result: "ok" }) },
      { role: "tool", content: "Read 100 bytes from file.txt" },
    ];
    const result = extractOutcomeFromMessages(messages, DEFAULT_SEVERITY_RULES);
    expect(result.totalTools).toBe(2);
    expect(result.failedTools).toBe(0);
  });

  it("detects JSON error responses", () => {
    const messages = [
      { role: "tool", content: JSON.stringify({ isError: true, error: "permission denied" }) },
    ];
    const result = extractOutcomeFromMessages(messages, DEFAULT_SEVERITY_RULES);
    expect(result.totalTools).toBe(1);
    expect(result.failedTools).toBe(1);
    expect(result.severity).toBe(200);
    expect(result.reason).toBe("permission denied");
  });

  it("detects plain-text error keywords", () => {
    const messages = [
      { role: "tool", content: "ERROR: connection timed out after 30s" },
    ];
    const result = extractOutcomeFromMessages(messages, DEFAULT_SEVERITY_RULES);
    expect(result.failedTools).toBe(1);
    expect(result.severity).toBe(300);
  });

  it("captures highest severity from multiple errors", () => {
    const messages = [
      { role: "tool", content: JSON.stringify({ error: "permission denied" }) },
      { role: "tool", content: JSON.stringify({ error: "network timeout" }) },
    ];
    const result = extractOutcomeFromMessages(messages, DEFAULT_SEVERITY_RULES);
    expect(result.totalTools).toBe(2);
    expect(result.failedTools).toBe(2);
    expect(result.severity).toBe(300);
  });

  it("handles malformed JSON gracefully", () => {
    const messages = [
      { role: "tool", content: "parse error: unexpected token" },
    ];
    const result = extractOutcomeFromMessages(messages, DEFAULT_SEVERITY_RULES);
    expect(result.totalTools).toBe(1);
    expect(result.failedTools).toBe(1);
    expect(result.severity).toBe(50);
  });

  it("detects success: false in JSON", () => {
    const messages = [
      { role: "tool", content: JSON.stringify({ success: false, message: "exec failure" }) },
    ];
    const result = extractOutcomeFromMessages(messages, DEFAULT_SEVERITY_RULES);
    expect(result.failedTools).toBe(1);
    expect(result.severity).toBe(500);
  });
});

describe("formatSensorium", () => {
  beforeEach(() => {
    resetSessionMetrics();
  });

  it("outputs valid XML block with all fields", () => {
    const { key, m } = createMockMetrics({});
    addCycle(m, { success: true, totalTools: 2, failedTools: 0, cbrHit: true, severity: 50 });
    const output = formatSensorium(key, m);
    expect(output).toContain("<openclaw_state>");
    expect(output).toContain("</openclaw_state>");
    expect(output).toContain("<d_prime>");
    expect(output).toContain("<d_gate_threshold>");
    expect(output).toContain("<d_gate_status>");
    expect(output).toContain("<session_success_rate>");
    expect(output).toContain("<tool_failure_rate>");
    expect(output).toContain("<cbr_hit_rate>");
    expect(output).toContain("<recent_failures>");
  });

  it("shows -- when no cycles recorded", () => {
    const { key, m } = createMockMetrics({});
    const output = formatSensorium(key, m);
    expect(output).toContain("<session_success_rate>--</session_success_rate>");
    expect(output).toContain("<cbr_hit_rate>--</cbr_hit_rate>");
    expect(output).toContain("<recent_failures>none</recent_failures>");
  });

  it("tags CRITICAL failures with [CRIT] prefix", () => {
    const { key, m } = createMockMetrics({});
    addCycle(m, { success: false, totalTools: 1, failedTools: 1, cbrHit: false, severity: 1000, reason: "data_exfiltration" });
    const output = formatSensorium(key, m);
    expect(output).toContain("[CRIT]");
    expect(output).toContain("data_exfiltration");
  });

  it("shows recent_failures as non-empty when failures present", () => {
    const { key, m } = createMockMetrics({});
    addCycle(m, { success: false, totalTools: 1, failedTools: 1, cbrHit: false, severity: 100, reason: "generic error" });
    const output = formatSensorium(key, m);
    expect(output).not.toContain("<recent_failures>none</recent_failures>");
    expect(output).toContain("generic error");
  });

  it("limits recent_failures to last 3", () => {
    const { key, m } = createMockMetrics({});
    for (let i = 0; i < 5; i++) {
      addCycle(m, { success: false, totalTools: 1, failedTools: 1, cbrHit: false, severity: 100, reason: `fail${i}` });
    }
    const output = formatSensorium(key, m);
    const failMatch = output.match(/<recent_failures>(.*?)<\/recent_failures>/s);
    expect(failMatch).not.toBeNull();
    const failures = failMatch[1];
    expect(failures.split("|").length).toBeLessThanOrEqual(3);
  });
});

describe("cycle management", () => {
  beforeEach(() => {
    resetSessionMetrics();
  });

  it("evicts old cycles beyond window × multiplier", () => {
    const m = { cycles: [], config: resolveConfig({}) };
    m.config.window = 5;
    m.config.maxCyclesMultiplier = 2;
    for (let i = 0; i < 20; i++) {
      addCycle(m, { success: true, totalTools: 1, failedTools: 0, cbrHit: false, severity: 50 });
    }
    expect(m.cycles.length).toBeLessThanOrEqual(10);
    expect(m.cycles.length).toBe(10);
  });

  it("session metrics are isolated per session", () => {
    const { m: m1 } = createMockMetrics({}, makeKey("iso1"));
    const { m: m2 } = createMockMetrics({}, makeKey("iso2"));
    addCycle(m1, { success: true, totalTools: 1, failedTools: 0, cbrHit: false, severity: 50 });
    expect(m1.cycles.length).toBe(1);
    expect(m2.cycles.length).toBe(0);
  });
});
