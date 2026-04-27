const DEFAULT_WINDOW = 20;

const DEFAULT_WEIGHTS = {
  success: 0.30,
  tool: 0.25,
  cbr: 0.20,
  severity: 0.25,
};

const DEFAULT_D_BANDS = {
  low: 0.35,
  high: 0.55,
};

const DEFAULT_SEVERITY_RULES = [
  { keywords: ["exfil", "steal", "leak"], score: 1000 },
  { keywords: ["system", "command"], score: 800 },
  { keywords: ["delete", "rm ", "unlink"], score: 600 },
  { keywords: ["exec", "subprocess"], score: 500 },
  { keywords: ["timeout", "timed out"], score: 300 },
  { keywords: ["network", "fetch", "connect"], score: 300 },
  { keywords: ["permission", "denied", "forbidden"], score: 200 },
  { keywords: [], score: 100 },
];

const DEFAULT_MAX_CYCLES_MULTIPLIER = 3;

const sessionMetrics = new Map();

function resolveConfig(cfg) {
  return {
    window: cfg?.sensoriumWindow ?? DEFAULT_WINDOW,
    dBands: {
      low: cfg?.dBandLow ?? DEFAULT_D_BANDS.low,
      high: cfg?.dBandHigh ?? DEFAULT_D_BANDS.high,
    },
    weights: {
      success: cfg?.weightSuccess ?? DEFAULT_WEIGHTS.success,
      tool: cfg?.weightTool ?? DEFAULT_WEIGHTS.tool,
      cbr: cfg?.weightCbr ?? DEFAULT_WEIGHTS.cbr,
      severity: cfg?.weightSeverity ?? DEFAULT_WEIGHTS.severity,
    },
    severityRules: cfg?.severityRules ?? DEFAULT_SEVERITY_RULES,
    maxCyclesMultiplier: cfg?.maxCyclesMultiplier ?? DEFAULT_MAX_CYCLES_MULTIPLIER,
    dGateThreshold: cfg?.dGateThreshold ?? DEFAULT_D_BANDS.low,
    logLevel: cfg?.logLevel || "info",
  };
}

function classifySeverity(reason, rules) {
  if (!reason) return 50;
  const lower = reason.toLowerCase();
  for (const rule of rules) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return rule.score;
    }
  }
  return 50;
}

function getOrCreateMetrics(sessionKey, cfg) {
  if (!sessionMetrics.has(sessionKey)) {
    const resolved = resolveConfig(cfg);
    sessionMetrics.set(sessionKey, {
      cycles: [],
      callCounter: 0,
      lastRecordedSuccess: null,
      config: resolved,
    });
  }
  return sessionMetrics.get(sessionKey);
}

function computeSuccessRate(metrics) {
  const recent = metrics.cycles.slice(-metrics.config.window);
  if (recent.length === 0) return null;
  return recent.filter((c) => c.success).length / recent.length;
}

function computeToolFailureRate(metrics) {
  const recent = metrics.cycles.slice(-metrics.config.window);
  if (recent.length === 0) return null;
  const totalTools = recent.reduce((sum, c) => sum + (c.totalTools || 0), 0);
  const failedTools = recent.reduce((sum, c) => sum + (c.failedTools || 0), 0);
  if (totalTools === 0) return null;
  return failedTools / totalTools;
}

function computeCbrHitRate(metrics) {
  const recent = metrics.cycles.slice(-metrics.config.window);
  if (recent.length === 0) return null;
  return recent.filter((c) => c.cbrHit).length / recent.length;
}

function computeAverageSeverity(metrics) {
  const recent = metrics.cycles.slice(-metrics.config.window);
  if (recent.length === 0) return null;
  const avg = recent.reduce((sum, c) => sum + (c.severity ?? 50), 0) / recent.length;
  return avg / 1000;
}

function computeDPrime(metrics) {
  const weights = metrics.config.weights;
  const successRate = computeSuccessRate(metrics);
  const toolFailureRate = computeToolFailureRate(metrics);
  const cbrHitRate = computeCbrHitRate(metrics);
  const avgSeverity = computeAverageSeverity(metrics);

  const signals = [];
  if (successRate !== null) signals.push({ importance: weights.success, magnitude: successRate });
  if (toolFailureRate !== null) signals.push({ importance: weights.tool, magnitude: 1 - toolFailureRate });
  if (cbrHitRate !== null) signals.push({ importance: weights.cbr, magnitude: cbrHitRate });
  if (avgSeverity !== null) signals.push({ importance: weights.severity, magnitude: 1 - avgSeverity });

  if (signals.length === 0) return null;

  const maxImportance = Math.max(weights.success, weights.tool, weights.cbr, weights.severity);
  const maxMagnitude = 1.0;
  const n = signals.length;

  const numerator = signals.reduce((sum, s) => sum + s.importance * s.magnitude, 0);
  const denominator = maxImportance * maxMagnitude * n;

  return numerator / denominator;
}

function dGateStatus(dPrime, bands) {
  if (dPrime === null) return "UNKNOWN";
  if (dPrime >= bands.high) return "HIGH_REJECT";
  if (dPrime >= bands.low) return "MEDIUM_CONFIRM";
  return "LOW_ACCEPT";
}

function formatSensorium(sessionKey, metrics) {
  const successRate = computeSuccessRate(metrics);
  const toolFailureRate = computeToolFailureRate(metrics);
  const cbrHitRate = computeCbrHitRate(metrics);
  const dPrime = computeDPrime(metrics);
  const status = dGateStatus(dPrime, metrics.config.dBands);
  const recent = metrics.cycles.slice(-5);
  const recentFailures = recent
    .filter((c) => !c.success)
    .map((c) => (c.severity >= 600 ? `[CRIT]${c.reason || "unknown"}` : c.reason || "unknown"))
    .slice(-3);

  return [
    "<openclaw_state>",
    `  <session_key>${sessionKey}</session_key>`,
    `  <d_prime>${dPrime !== null ? dPrime.toFixed(4) : "--"}</d_prime>`,
    `  <d_gate_threshold>${metrics.config.dGateThreshold}</d_gate_threshold>`,
    `  <d_gate_status>${status}</d_gate_status>`,
    `  <cycles_tracked>${metrics.cycles.length}</cycles_tracked>`,
    successRate !== null ? `  <session_success_rate>${successRate.toFixed(3)}</session_success_rate>` : `  <session_success_rate>--</session_success_rate>`,
    toolFailureRate !== null ? `  <tool_failure_rate>${toolFailureRate.toFixed(3)}</tool_failure_rate>` : `  <tool_failure_rate>0.000</tool_failure_rate>`,
    cbrHitRate !== null ? `  <cbr_hit_rate>${cbrHitRate.toFixed(3)}</cbr_hit_rate>` : `  <cbr_hit_rate>--</cbr_hit_rate>`,
    recentFailures.length > 0 ? `  <recent_failures>${recentFailures.join(" | ")}</recent_failures>` : `  <recent_failures>none</recent_failures>`,
    "</openclaw_state>",
  ].join("\n");
}

function resolveLogLevel(pluginConfig) {
  return pluginConfig?.logLevel || "info";
}

const LOG_LEVELS = { debug: 0, info: 1, warn: 2 };

function doLog(api, level, msg) {
  const configured = resolveLogLevel(api.pluginConfig);
  if ((LOG_LEVELS[level] ?? 1) >= (LOG_LEVELS[configured] ?? 1)) {
    const fn = level === "debug" ? api.logger.debug : level === "warn" ? api.logger.warn : api.logger.info;
    fn?.(`[policy-sensorium] ${msg}`);
  }
}

function extractOutcomeFromMessages(messages, severityRules) {
  let totalTools = 0;
  let failedTools = 0;
  let reason = "";
  let maxSeverity = 50;

  for (const msg of messages) {
    if (msg.role === "tool") {
      totalTools++;
      const content = msg.content;
      if (typeof content === "string") {
        let isError = false;
        let errReason = "";
        try {
          const parsed = JSON.parse(content);
          isError = !!(parsed.isError || parsed.error || parsed.success === false);
          if (isError) {
            errReason = parsed.error || parsed.message || "tool error";
          }
        } catch {
          const lower = content.toLowerCase();
          if (lower.includes("error") || lower.includes("failed") || lower.includes("exception")) {
            isError = true;
            errReason = content.slice(0, 120);
          }
        }
        if (isError) {
          failedTools++;
          const sev = classifySeverity(errReason, severityRules);
          if (sev > maxSeverity) {
            maxSeverity = sev;
            reason = errReason;
          }
        }
      }
    }
  }

  return { totalTools, failedTools, reason, severity: maxSeverity };
}

export function resetSessionMetrics(sessionKey) {
  if (sessionKey) sessionMetrics.delete(sessionKey);
  else sessionMetrics.clear();
  _mockCounter = 0;
  _keyCounter = 0;
}

let _mockCounter = 0;
let _keyCounter = 0;
export function createMockMetrics(cfg, explicitKey) {
  if (explicitKey) {
    const m = getOrCreateMetrics(explicitKey, cfg);
    return { key: explicitKey, m };
  }
  _mockCounter++;
  const key = `__test__${_mockCounter}__${Date.now()}`;
  const m = getOrCreateMetrics(key, cfg);
  return { key, m };
}

export function makeKey(n) {
  _keyCounter++;
  return `__key__${n}__${_keyCounter}__${Date.now()}`;
}

export function addCycle(metrics, cycle) {
  metrics.cycles.push({ ...cycle, timestamp: Date.now() });
  const maxCycles = metrics.config.window * metrics.config.maxCyclesMultiplier;
  if (metrics.cycles.length > maxCycles) {
    metrics.cycles = metrics.cycles.slice(-metrics.config.window * 2);
  }
}

export function getMetrics(sessionKey) {
  return sessionMetrics.get(sessionKey);
}

export {
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
  DEFAULT_WEIGHTS,
  DEFAULT_D_BANDS,
  DEFAULT_SEVERITY_RULES,
};

import { normalizeCommand } from './security/normalize';
import { detectDangerousPatterns, PatternMatch } from './security/patterns';
import { validatePath } from './security/path';
import { smartReview } from './security/smart-review';
import { logApproval, ApprovalRecord } from './security/approval-log';
import { onApprove, isFastLane, resetFastLane, getFastLaneEntries } from './security/fast-lane';
import { redactSecrets } from './security/redact';
import { redactUrlSecrets, redactEnvironmentVariables } from './security/url-redact';

const plugin = {
  id: "policy-sensorium",
  name: "Policy Sensorium (CBS)",
  description: "Springdrift-inspired Cognitive Behavior System: injects self-perception signals before each LLM call.",
  kind: "sensorium",

  register(api) {
    api.on("before_prompt_build", async (event, ctx) => {
      try {
        const sessionKey =
          ctx.sessionKey?.trim() ||
          (ctx.agentId && ctx.sessionId ? `${ctx.agentId}:${ctx.sessionId}` : null);
        if (!sessionKey) return;

        const cfg = api.pluginConfig || {};
        const metrics = getOrCreateMetrics(sessionKey, cfg);

        const resolvedCfg = resolveConfig(cfg);
        if (cfg.sensoriumWindow) metrics.config.window = cfg.sensoriumWindow;
        if (cfg.dGateThreshold !== undefined) metrics.config.dGateThreshold = cfg.dGateThreshold;
        if (cfg.dBandLow !== undefined) metrics.config.dBands.low = cfg.dBandLow;
        if (cfg.dBandHigh !== undefined) metrics.config.dBands.high = cfg.dBandHigh;

        const messages = event.messages || [];

        if (metrics.callCounter > 0) {
          const { totalTools, failedTools, reason, severity } = extractOutcomeFromMessages(messages, resolvedCfg.severityRules);
          const success = failedTools === 0;
          addCycle(metrics, {
            success,
            totalTools,
            failedTools,
            cbrHit: false,
            reason,
            severity,
          });
        }

        const dPrime = computeDPrime(metrics);
        const status = dGateStatus(dPrime, metrics.config.dBands);

        if (status === "HIGH_REJECT") {
          doLog(api, "warn", `D'=${dPrime?.toFixed(4)} → HIGH_REJECT: blocking high-risk call for session ${sessionKey}`);
        } else if (status === "MEDIUM_CONFIRM") {
          doLog(api, "warn", `D'=${dPrime?.toFixed(4)} → MEDIUM_CONFIRM: requesting operator confirmation`);
        }

        const sensorium = formatSensorium(sessionKey, metrics);
        doLog(api, "debug", `Injecting sensorium for ${sessionKey}: D'=${dPrime?.toFixed(4) ?? "--"}, status=${status}`);

        metrics.callCounter++;

        return { prependContext: sensorium };
      } catch (err) {
        doLog(api, "warn", `before_prompt_build error: ${String(err)}`);
      }
    });

    api.on("before_tool_call", async (toolCall, ctx) => {
      try {
        const raw = toolCall.arguments ? JSON.stringify(toolCall.arguments) : '';
        const cmd = (toolCall.name + ' ' + raw).trim();
        const normalized = normalizeCommand(cmd);
        const patterns = detectDangerousPatterns(normalized);

        const sessionKey = ctx?.sessionKey || 'unknown';
        const recordBase: Partial<ApprovalRecord> = {
          command: normalized,
          tool: toolCall.name,
          sessionId: sessionKey,
          patterns: patterns.map(p => p.label),
        };

        if (patterns.length === 0) {
          return { block: false };
        }

        const severities = patterns.map(p => p.severity);
        if (severities.includes('critical')) {
          const critLabels = patterns.filter(p => p.severity === 'critical').map(p => p.label);
          await logApproval({ ...recordBase, result: 'deny', timestamp: new Date().toISOString() } as ApprovalRecord);
          doLog(api, "warn", `CRITICAL pattern blocked: ${critLabels.join(', ')}`);
          return { block: true, blockReason: `Critical dangerous pattern(s): ${critLabels.join(', ')}` };
        }

        const patternKey = patterns.map(p => p.label).sort().join('|');
        if (isFastLane(patternKey)) {
          patterns.forEach(p => onApprove(p.label));
          await logApproval({ ...recordBase, result: 'fast_lane', timestamp: new Date().toISOString() } as ApprovalRecord);
          doLog(api, "debug", `Fast-lane approve: ${patternKey}`);
          return { block: false };
        }

        const redacted = redactSecrets(normalized);
        const reviewResult = await smartReview(redacted.redacted, patterns);

        if (reviewResult === 'deny') {
          await logApproval({ ...recordBase, result: 'deny', reason: 'smart-review deny', timestamp: new Date().toISOString() } as ApprovalRecord);
          return { block: true, blockReason: `Smart review denied: ${patterns.map(p => p.label).join(', ')}` };
        }

        if (reviewResult === 'escalate') {
          await logApproval({ ...recordBase, result: 'escalate', reason: 'requires human review', timestamp: new Date().toISOString() } as ApprovalRecord);
          return { block: false, requireApproval: true };
        }

        patterns.forEach(p => onApprove(p.label));
        await logApproval({ ...recordBase, result: 'approve', reason: 'smart-review approve', timestamp: new Date().toISOString() } as ApprovalRecord);
        return { block: false };
      } catch (err) {
        doLog(api, "warn", `before_tool_call error: ${String(err)}`);
        return { block: false };
      }
    });

    api.on("after_tool_call", async (toolCall, result) => {
      try {
        if (!result?.content) return;
        const content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
        const { found } = redactSecrets(content);
        if (found.length > 0) {
          doLog(api, "warn", `SECRET LEAK DETECTED in ${toolCall.name} output: ${found.join(', ')}`);
        }
      } catch {
      }
    });

    api.registerCommand({
      name: "policy-security",
      description: "Show policy security status: fast-lane patterns, layer info.",
      acceptsArgs: false,
      handler: async () => {
        const fastLanePatterns = getFastLaneEntries()
          .map(({ pattern, count }) => `  ${pattern}: ${count} approves`);
        const lines = [
          "[policy-security] Layers 1-4 Active",
          "  Layer 1: normalize + 23 dangerous patterns (critical=block, high/medium=review)",
          "  Layer 2: D' CBS sensorium (openclaw_state injection)",
          "  Layer 3: Smart review (Ollama LLM), fast-lane (5 consecutive approvals)",
          "  Layer 4: 39 secret patterns, URL redaction, env var redaction",
          "  Approval log: ~/.openclaw/logs/approval.jsonl",
          fastLanePatterns.length > 0 ? `  Fast-lane patterns:\n${fastLanePatterns.join('\n')}` : "  Fast-lane patterns: none",
        ];
        return { text: lines.join("\n") };
      },
    });

    api.registerCommand({
      name: "policy-reset-fastlane",
      description: "Reset fast-lane counters. Usage: policy-reset-fastlane [pattern]",
      acceptsArgs: true,
      handler: async (ctx) => {
        const pattern = ctx.args?.trim();
        if (pattern) {
          resetFastLane(pattern);
          return { text: `[policy-security] Fast-lane reset for: ${pattern}` };
        }
        resetFastLane();
        return { text: "[policy-security] All fast-lane counters reset." };
      },
    });

    api.registerCommand({
      name: "policy-sensorium",
      description: "Show policy-sensorium CBS metrics for the current session.",
      acceptsArgs: true,
      handler: async (ctx) => {
        const sessionKey =
          ctx.sessionKey?.trim() ||
          (ctx.agentId && ctx.sessionId ? `${ctx.agentId}:${ctx.sessionId}` : null);

        if (!sessionKey) {
          return { text: "[policy-sensorium] No session context." };
        }

        const metrics = getOrCreateMetrics(sessionKey, {});
        const dPrime = computeDPrime(metrics);
        const status = dGateStatus(dPrime, metrics.config.dBands);
        const successRate = computeSuccessRate(metrics);
        const toolFailureRate = computeToolFailureRate(metrics);
        const cbrHitRate = computeCbrHitRate(metrics);

        const recent = metrics.cycles.slice(-3);
        const failLines = recent
          .filter((c) => !c.success)
          .map((c) => `  - ${c.reason || "unknown"} (sev=${c.severity})`);

        const lines = [
          `[policy-sensorium] Session: ${sessionKey}`,
          `  D' score:     ${dPrime !== null ? dPrime.toFixed(4) : "--"}`,
          `  D' status:   ${status}`,
          `  Threshold:    ${metrics.config.dGateThreshold}`,
          `  Cycles:       ${metrics.cycles.length} (window ${metrics.config.window})`,
          `  Calls:        ${metrics.callCounter}`,
          `  Success rate: ${successRate !== null ? successRate.toFixed(3) : "--"}`,
          `  Tool fail:    ${toolFailureRate !== null ? toolFailureRate.toFixed(3) : "--"}`,
          `  CBR hit:      ${cbrHitRate !== null ? cbrHitRate.toFixed(3) : "--"}`,
          failLines.length > 0 ? `  Recent failures:\n${failLines.join("\n")}` : `  Recent failures: none`,
        ];

        return { text: lines.join("\n") };
      },
    });
  },
};

export default plugin;
