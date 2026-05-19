// =============================================================================
// D' Signal System — Trust Score based on agent behavior
// =============================================================================
//
// Signal Design (D' = weighted average, 0-1 scale):
//   - successRate     : high success → high trust        (weight: 0.20)
//   - toolFailureRate : low failure → high trust          (weight: 0.15)
//   - avgSeverity     : LOW severity → high trust         (weight: 0.15) [FIXED: was inverted]
//   - criticalHit     : hit critical pattern → LOW trust   (weight: 0.25)
//   - approvalPassed  : approval allowed → trust up       (weight: 0.10)
//   - approvalDenied  : approval denied → trust down      (weight: 0.10)
//   - userNudge       : negative feedback → LOW trust     (weight: 0.20)
//   - fastLaneUse     : fast-lane earned → trust up       (weight: 0.05)
//
// Sigmoid gates:
//   - risk < acceptBelow (default 0.15) → AUTO_ACCEPT  (auto-pass, needs whitelist)
//   - risk > rejectAbove (default 0.85) → AUTO_REJECT  (auto-block critical)
//   - otherwise         → REQUIRE_APPROVAL
//
// =============================================================================

const DEFAULT_WINDOW = 20;

const DEFAULT_WEIGHTS = {
  success: 0.20,
  tool: 0.15,
  severity: 0.15,
  criticalHit: 0.25,
  approvalPassed: 0.10,
  approvalDenied: 0.10,
  userNudge: 0.20,
  fastLaneUse: 0.05,
};

const DEFAULT_D_BANDS = {
  low: 0.50,
  high: 0.66,
};

const DEFAULT_SIGMOID = {
  midpoint: 0.58,
  steepness: 0.10,
  acceptBelow: 0.15,
  rejectAbove: 0.85,
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

// Patterns that NEVER enter whitelist (no matter how trusted the agent)
const NEVER_WHITELIST_PATTERNS = [
  /\brm\s+-rf\s+\//,                  // rm -rf /
  /\brm\s+-rf\s+\/\*/,               // rm -rf /*
  /\bcurl\s+[^\|]+\s*\|\s*sh/,       // curl | sh
  /\bwget\s+[^\|]+\s*\|\s*sh/,       // wget | sh
  /\bkill\s+-9\s+-1/,                // kill -9 -1
  /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;:/, // fork bomb
  /fork\s*\(\s*\)\s*\{\s*fork\s*\(\s*\)\s*\|\s*fork\s*\(\s*\)\s*&\s*\}\s*;fork\s*\(\s*\)/, // fork bomb v2
  /pkill\s+(-9\s+)?gateway/,         // kill gateway
  /openclaw\s+gateway\s+stop/,      // stop gateway
];

// Safe directories that are always allowed (no approval needed)
const DEFAULT_SAFE_DIRS = [
  'node_modules',
  'dist',
  'build',
  '.git/objects',
  '__pycache__',
  '.pytest_cache',
  'tmp',
  'tmp/*',
];

const sessionMetrics = new Map();
let lastCommand = '';

function resolveConfig(cfg) {
  return {
    window: cfg?.sensoriumWindow ?? DEFAULT_WINDOW,
    dBands: {
      low: cfg?.dBandLow ?? DEFAULT_D_BANDS.low,
      high: cfg?.dBandHigh ?? DEFAULT_D_BANDS.high,
    },
    sigmoid: {
      midpoint: cfg?.sigmoidMidpoint ?? DEFAULT_SIGMOID.midpoint,
      steepness: cfg?.sigmoidSteepness ?? DEFAULT_SIGMOID.steepness,
      acceptBelow: cfg?.sigmoidAcceptBelow ?? DEFAULT_SIGMOID.acceptBelow,
      rejectAbove: cfg?.sigmoidRejectAbove ?? DEFAULT_SIGMOID.rejectAbove,
    },
    weights: {
      success: cfg?.weightSuccess ?? DEFAULT_WEIGHTS.success,
      tool: cfg?.weightTool ?? DEFAULT_WEIGHTS.tool,
      severity: cfg?.weightSeverity ?? DEFAULT_WEIGHTS.severity,
      criticalHit: cfg?.weightCriticalHit ?? DEFAULT_WEIGHTS.criticalHit,
      approvalPassed: cfg?.weightApprovalPassed ?? DEFAULT_WEIGHTS.approvalPassed,
      approvalDenied: cfg?.weightApprovalDenied ?? DEFAULT_WEIGHTS.approvalDenied,
      userNudge: cfg?.weightUserNudge ?? DEFAULT_WEIGHTS.userNudge,
      fastLaneUse: cfg?.weightFastLaneUse ?? DEFAULT_WEIGHTS.fastLaneUse,
    },
    severityRules: cfg?.severityRules ?? DEFAULT_SEVERITY_RULES,
    maxCyclesMultiplier: cfg?.maxCyclesMultiplier ?? DEFAULT_MAX_CYCLES_MULTIPLIER,
    dGateThreshold: cfg?.dGateThreshold ?? DEFAULT_D_BANDS.low,
    logLevel: cfg?.logLevel || "info",
    safeDirs: cfg?.safeDirs ?? DEFAULT_SAFE_DIRS,
    neverWhitelistPatterns: cfg?.neverWhitelistPatterns ?? NEVER_WHITELIST_PATTERNS,
    evolveMode: cfg?.evolveMode ?? false, // learned whitelist (default off)
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
      lastPolicyResult: null,
      config: resolved,
      // Trust signals accumulated this session
      trustSignals: {
        criticalHits: 0,
        approvalPasses: 0,
        approvalDenials: 0,
        userNudges: 0,
        fastLaneUses: 0,
      },
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

// FIXED: avgSeverity was inverted. Now LOW severity = HIGH trust (dividing by score to invert)
function computeAverageSeverity(metrics) {
  const recent = metrics.cycles.slice(-metrics.config.window);
  if (recent.length === 0) return null;
  const avg = recent.reduce((sum, c) => sum + (c.severity ?? 50), 0) / recent.length;
  // Invert: severity 1000 → trust 0.0, severity 50 → trust ~1.0
  return 1 - (avg / 1000);
}

// NEW: Count critical pattern hits in window
function computeCriticalHitRate(metrics) {
  const recent = metrics.cycles.slice(-metrics.config.window);
  const hits = recent.filter((c) => c.criticalHit).length;
  return recent.length > 0 ? hits / recent.length : 0;
}

// Kept for backwards-compat / CBR subsystem (separate from trust score)
function computeCbrHitRate(metrics) {
  const recent = metrics.cycles.slice(-metrics.config.window);
  if (recent.length === 0) return null;
  return recent.filter((c) => c.cbrHit).length / recent.length;
}

// NEW: Compute trust score from all signals (D' replacement)
function computeTrustScore(metrics) {
  const w = metrics.config.weights;
  const recent = metrics.cycles.slice(-metrics.config.window);

  const successRate = computeSuccessRate(metrics);
  const toolFailureRate = computeToolFailureRate(metrics);
  const avgSeverityInverted = computeAverageSeverity(metrics); // already inverted: low severity = high trust
  const criticalHitRate = computeCriticalHitRate(metrics);

  // Session-level trust signals (from approval flow)
  const ts = metrics.trustSignals;
  const approvalPassRate = ts.approvalPasses > 0 ? Math.min(ts.approvalPasses / 20, 1) : 0;
  const approvalDenyRate = ts.approvalDenials > 0 ? Math.min(ts.approvalDenials / 20, 1) : 0;
  const userNudgeRate = ts.userNudges > 0 ? Math.min(ts.userNudges / 10, 1) : 0;
  const fastLaneRate = ts.fastLaneUses > 0 ? Math.min(ts.fastLaneUses / 10, 1) : 0;

  const signals = [];
  if (successRate !== null) signals.push({ weight: w.success, magnitude: successRate });
  if (toolFailureRate !== null) signals.push({ weight: w.tool, magnitude: 1 - toolFailureRate });
  if (avgSeverityInverted !== null) signals.push({ weight: w.severity, magnitude: avgSeverityInverted });
  if (criticalHitRate > 0) signals.push({ weight: w.criticalHit, magnitude: 1 - criticalHitRate });
  if (ts.approvalPasses > 0) signals.push({ weight: w.approvalPassed, magnitude: approvalPassRate });
  if (ts.approvalDenials > 0) signals.push({ weight: w.approvalDenied, magnitude: -approvalDenyRate });
  if (ts.userNudges > 0) signals.push({ weight: w.userNudge, magnitude: -userNudgeRate });
  if (ts.fastLaneUses > 0) signals.push({ weight: w.fastLaneUse, magnitude: fastLaneRate });

  if (signals.length === 0) return null;

  const maxWeight = Math.max(...signals.map((s) => s.weight));
  const n = signals.length;

  const numerator = signals.reduce((sum, s) => sum + s.weight * s.magnitude, 0);
  const denominator = maxWeight * n;

  return Math.max(0, Math.min(1, numerator / denominator));
}

// Backwards-compatible alias
function computeDPrime(metrics) {
  return computeTrustScore(metrics);
}

function severityLevel(sev) {
  if (sev >= 1000) return "CRITICAL";
  if (sev >= 600) return "HIGH";
  if (sev >= 300) return "MEDIUM";
  return "LOW";
}

function computeToolDetails(metrics) {
  const recent = metrics.cycles.slice(-metrics.config.window);
  const total = recent.reduce((s, c) => s + (c.totalTools || 0), 0);
  const failed = recent.reduce((s, c) => s + (c.failedTools || 0), 0);
  const failedNames = [];
  for (const c of recent) {
    if (c.failedToolNames) for (const n of c.failedToolNames) failedNames.push(n);
  }
  return {
    total,
    failed,
    failedRate: total > 0 ? failed / total : 0,
    failedNames,
  };
}

function computeSeverityStats(metrics) {
  const recent = metrics.cycles.slice(-metrics.config.window);
  if (recent.length === 0) return { maxSeverity: 50, avgSeverity: 50, reason: "", level: "LOW" };
  const sevs = recent.map((c) => c.severity ?? 50);
  const maxSeverity = Math.max(...sevs);
  const avgSeverity = sevs.reduce((a, b) => a + b, 0) / sevs.length;
  const topCycle = recent.find((c) => (c.severity ?? 50) === maxSeverity);
  const reason = topCycle?.reason || "";
  return { maxSeverity, avgSeverity, reason, level: severityLevel(maxSeverity) };
}

async function logDCycle(
  sessionKey: string,
  agentId: string,
  sessionId: string,
  metrics: ReturnType<typeof getOrCreateMetrics>,
  trigger: DCycleTrigger,
  decision: 'ACCEPT' | 'ESCALATE' | 'REJECT',
): Promise<void> {
  const successRate = computeSuccessRate(metrics);
  const toolRate = computeToolFailureRate(metrics);
  const cbrRate = computeCbrHitRate(metrics);
  const dPrime = computeDPrime(metrics);
  const riskScore = sigmoidRisk(dPrime, metrics.config.sigmoid.midpoint, metrics.config.sigmoid.steepness);
  const status = dGateStatus(dPrime, metrics.config.dBands, metrics.config.sigmoid);
  const toolDetails = computeToolDetails(metrics);
  const sevStats = computeSeverityStats(metrics);
  const recent = metrics.cycles.slice(-metrics.config.window);
  const lastCycle = recent[recent.length - 1];

  try {
    await dCycleStore.log({
      sessionId: sessionKey,
      agentId: agentId || 'unknown',
      signals: {
        success: lastCycle?.success ?? true,
        successRate,
        toolDetails,
        cbrDetails: {
          hit: lastCycle?.cbrHit ?? false,
          hitRate: cbrRate,
          matchedCaseIds: lastCycle?.matchedCaseIds ?? [],
        },
        severityDetails: sevStats,
      },
      dPrime,
      dPrimeStatus: status,
      decision,
      trigger,
      windowSize: metrics.config.window,
    });
  } catch (err) {
    doLog({ logger: { warn: console.warn.bind(console) }, pluginConfig: {} } as any, "warn", `logDCycle error: ${String(err)}`);
  }
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function sigmoidRisk(dPrime: number | null, midpoint: number, steepness: number): number | null {
  if (dPrime === null) return null;
  return sigmoid((dPrime - midpoint) / steepness);
}

function dGateStatus(dPrime, bands, sigmoidCfg?) {
  if (dPrime === null) return "UNKNOWN";
  if (sigmoidCfg) {
    const risk = sigmoidRisk(dPrime, sigmoidCfg.midpoint, sigmoidCfg.steepness);
    if (risk !== null) {
      if (risk >= sigmoidCfg.rejectAbove) return "REJECT";
      if (risk <= sigmoidCfg.acceptBelow) return "ACCEPT";
      return "ESCALATE";
    }
  }
  if (dPrime >= bands.high) return "REJECT";
  if (dPrime >= bands.low) return "ESCALATE";
  return "ACCEPT";
}

function interpretSensorium(dPrime, status, toolFailureRate, recentFailures, successRate, riskScore) {
  const lines = [];

  if (status === "REJECT") {
    lines.push("[REJECT] Risk score indicates poor recent performance. Diagnose root cause before continuing.");
  } else if (status === "ESCALATE") {
    lines.push(`[ESCALATE] Risk score=${riskScore?.toFixed(2) ?? "--"}: exercise caution with high-impact decisions.`);
  } else if (status === "ACCEPT") {
    lines.push("[ACCEPT] Risk score indicates healthy session. Normal operation.");
  }

  if (toolFailureRate > 0.15) {
    lines.push("[TOOL_FAILURE>15%] Multiple tool failures detected. Stop and diagnose — check paths, permissions, or system state. Do not retry the same failing command.");
  } else if (toolFailureRate > 0.05) {
    lines.push("[TOOL_FAILURE>5%] Some tool failures. Watch for patterns in which tools fail.");
  }

  if (recentFailures.length > 0) {
    const critFails = recentFailures.filter(f => f.startsWith('[CRIT]'));
    if (critFails.length > 0) {
      lines.push(`[CRITICAL FAILURES] ${critFails.join(', ')}. Stop related operations immediately.`);
    }
    if (recentFailures.length >= 3 && critFails.length === 0) {
      lines.push("[REPEATED FAILURES] Same goal failing repeatedly. Try a different approach instead of retrying.");
    }
  }

  return lines;
}

function formatSensorium(sessionKey, metrics) {
  const successRate = computeSuccessRate(metrics);
  const toolFailureRate = computeToolFailureRate(metrics);
  const cbrHitRate = computeCbrHitRate(metrics);
  const dPrime = computeDPrime(metrics);
  const riskScore = sigmoidRisk(dPrime, metrics.config.sigmoid.midpoint, metrics.config.sigmoid.steepness);
  const status = dGateStatus(dPrime, metrics.config.dBands, metrics.config.sigmoid);
  const recent = metrics.cycles.slice(-5);
  const recentFailures = recent
    .filter((c) => !c.success)
    .map((c) => (c.severity >= 600 ? `[CRIT]${c.reason || "unknown"}` : c.reason || "unknown"))
    .slice(-3);
  const lastCycle = metrics.cycles[metrics.cycles.length - 1];
  const interpretations = interpretSensorium(dPrime, status, toolFailureRate, recentFailures, successRate, riskScore);

  return [
    "<openclaw_state>",
    `  <session_key>${sessionKey}</session_key>`,
    `  <d_prime>${dPrime !== null ? dPrime.toFixed(4) : "--"}</d_prime>`,
    `  <risk_score>${riskScore !== null ? riskScore.toFixed(3) : "--"}</risk_score>`,
    `  <risk_zone>${status}</risk_zone>`,
    `  <cycles_tracked>${metrics.cycles.length}</cycles_tracked>`,
    successRate !== null ? `  <session_success_rate>${successRate.toFixed(3)}</session_success_rate>` : `  <session_success_rate>--</session_success_rate>`,
    toolFailureRate !== null ? `  <tool_failure_rate>${toolFailureRate.toFixed(3)}</tool_failure_rate>` : `  <tool_failure_rate>0.000</tool_failure_rate>`,
    cbrHitRate !== null ? `  <cbr_hit_rate>${cbrHitRate.toFixed(3)}</cbr_hit_rate>` : `  <cbr_hit_rate>--</cbr_hit_rate>`,
    metrics.lastPolicyResult
      ? `  <last_policy_result>${metrics.lastPolicyResult}</last_policy_result>`
      : `  <last_policy_result>none</last_policy_result>`,
    recentFailures.length > 0 ? `  <recent_failures>${recentFailures.join(" | ")}</recent_failures>` : `  <recent_failures>none</recent_failures>`,
    interpretations.length > 0 ? `  <action>\n    ${interpretations.join('\n    ')}\n  </action>` : '',
    "</openclaw_state>",
  ].join("\n");
}

function resolveLogLevel(pluginConfig) {
  return pluginConfig?.logLevel || "info";
}

async function persistSigmoidConfig(key: string, value: number): Promise<void> {
  const configPath = join(homedir(), '.openclaw', 'openclaw.json');
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    const cfg = JSON.parse(raw);
    const pluginKey = 'policy-layer';
    if (!cfg.plugins?.entries?.[pluginKey]) return;
    cfg.plugins.entries[pluginKey].config = cfg.plugins.entries[pluginKey].config || {};
    cfg.plugins.entries[pluginKey].config[key] = value;
    await fs.writeFile(configPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  } catch { /* non-fatal */ }
}

const LOG_LEVELS = { debug: 0, info: 1, warn: 2 };

function doLog(api, level, msg) {
  const configured = resolveLogLevel(api.pluginConfig);
  if ((LOG_LEVELS[level] ?? 1) >= (LOG_LEVELS[configured] ?? 1)) {
    const fn = level === "debug" ? api.logger.debug : level === "warn" ? api.logger.warn : api.logger.info;
    fn?.(`[policy-layer] ${msg}`);
  }
}

function extractOutcomeFromMessages(messages, severityRules) {
  let totalTools = 0;
  let failedTools = 0;
  let reason = "";
  let maxSeverity = 50;
  let failedToolNames: string[] = [];

  for (const msg of messages) {
    if (msg.role === "tool") {
      const toolName = msg.name || 'unknown';
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
          failedToolNames.push(toolName);
          const sev = classifySeverity(errReason, severityRules);
          if (sev > maxSeverity) {
            maxSeverity = sev;
            reason = errReason;
          }
        }
      }
    }
  }

  return { totalTools, failedTools, reason, severity: maxSeverity, failedToolNames };
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
  computeCriticalHitRate,
  computeTrustScore,
  computeDPrime,
  sigmoidRisk,
  dGateStatus,
  formatSensorium,
  extractOutcomeFromMessages,
  resolveConfig,
  DEFAULT_WEIGHTS,
  DEFAULT_D_BANDS,
  DEFAULT_SIGMOID,
  DEFAULT_SEVERITY_RULES,
  NEVER_WHITELIST_PATTERNS,
  DEFAULT_SAFE_DIRS,
};

import { normalizeCommand } from './security/normalize';
import { detectDangerousPatterns, PatternMatch, addToBlacklist, loadBlacklist } from './security/patterns';
import { validatePath } from './security/path';
import { smartReview } from './security/smart-review';
import { logApproval, ApprovalRecord, extractRawCommand } from './security/approval-log';
import { onApprove, isFastLane, resetFastLane, getFastLaneEntries } from './security/fast-lane';
import { redactSecrets } from './security/redact';
import { redactUrlSecrets, redactEnvironmentVariables } from './security/url-redact';
import { dCycleStore, type DCycleRecord, type DCycleTrigger } from './security/sensorium-log';
import { matchesWhitelist, matchesNeverWhitelist, canWhitelist, generalizePattern, addToWhitelist, type WhitelistEntry } from './security/learned-whitelist';
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const plugin = {
  id: "policy-layer",
  name: "Policy Sensorium (CBS)",
  description: "Springdrift-inspired Cognitive Behavior System: injects self-perception signals before each LLM call.",
  kind: "sensorium",

  register(api) {
    loadBlacklist().catch(() => {});
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
        let triggerGate: DCycleTrigger['gate'] = 'output';

        if (metrics.callCounter > 0) {
          const lastResult = metrics.lastPolicyResult || '';
          const success = !lastResult.startsWith('DENY') && !lastResult.startsWith('ESCALATE');
          const reason = lastResult || '';
          addCycle(metrics, {
            success,
            totalTools: 1,
            failedTools: success ? 0 : 1,
            failedToolNames: success ? [] : ['policy_block'],
            cbrHit: false,
            reason,
            severity: success ? 50 : 500,
          });
        }

        const dPrime = computeDPrime(metrics);
        const status = dGateStatus(dPrime, metrics.config.dBands, metrics.config.sigmoid);

        if (status === "REJECT") {
          triggerGate = 'input';
          doLog(api, "warn", `D'=${dPrime?.toFixed(4)} → REJECT: risk too high for session ${sessionKey}`);
        } else if (status === "ESCALATE") {
          doLog(api, "warn", `D'=${dPrime?.toFixed(4)} → ESCALATE: requesting operator confirmation`);
        }

        const decision = status;
        const agentId = ctx?.agentId || sessionKey.split(':')[0] || 'unknown';
        const sessId = ctx?.sessionId || sessionKey.split(':')[1] || sessionKey;
        await logDCycle(sessionKey, agentId, sessId, metrics, { gate: triggerGate }, decision);

        const sensorium = formatSensorium(sessionKey, metrics);
        doLog(api, "debug", `Injecting sensorium for ${sessionKey}: D'=${dPrime?.toFixed(4) ?? "--"}, status=${status}`);

        metrics.callCounter++;

        const reportToUser = cfg.reportToUser !== false;
        let systemContext = sensorium;
        if (reportToUser) {
          systemContext +=
            "\n\n[System] After each tool execution, briefly report the CBS status: D' score, gate status, and last_policy_result in parentheses, e.g. \"(D'=0.42 MEDIUM_CONFIRM, last=PASS)\".";
        }

        return { prependSystemContext: systemContext };
      } catch (err) {
        doLog(api, "warn", `before_prompt_build error: ${String(err)}`);
      }
    });

    api.on("before_tool_call", async (toolCall, ctx) => {
      try {
        const raw = toolCall.params ? JSON.stringify(toolCall.params) : '';
        const cmd = (toolCall.toolName + ' ' + raw).trim();
        const normalized = normalizeCommand(cmd);
        const rawCmd = extractRawCommand(toolCall.toolName, toolCall.params);
        const rawCmdNormalized = rawCmd ? normalizeCommand(rawCmd) : '';
        const effectiveCmd = rawCmdNormalized || normalized;

        const patternsFromOuter = detectDangerousPatterns(effectiveCmd);
        const patternsFromInner = rawCmdNormalized ? detectDangerousPatterns(rawCmdNormalized) : [];
        const allPatterns = [...patternsFromOuter];
        for (const p of patternsFromInner) {
          if (!allPatterns.some(existing => existing.label === p.label)) {
            allPatterns.push(p);
          }
        }
        const patterns = allPatterns;

        const sessionKey = ctx?.sessionKey || 'unknown';
        const pluginCfg = api.pluginConfig || {};
        const cfg = resolveConfig(pluginCfg);
        const recordBase: Partial<ApprovalRecord> = {
          command: normalized,
          rawCommand: rawCmd,
          tool: toolCall.toolName,
          sessionId: sessionKey,
          patterns: patterns.map(p => p.label),
        };

        lastCommand = normalized;

        if (patterns.length === 0) {
          const metrics = getOrCreateMetrics(sessionKey, pluginCfg);
          metrics.lastPolicyResult = 'PASS';
          return { block: false };
        }

        // Check if command targets ONLY safe directories
        const safeDirs = cfg.safeDirs;
        const hitsSafeDir = safeDirs.some(safe =>
          effectiveCmd.includes(safe) &&
          !effectiveCmd.includes('/etc') &&
          !effectiveCmd.includes('/home') &&
          !effectiveCmd.includes('/root') &&
          !effectiveCmd.includes('/var') &&
          !effectiveCmd.includes('/sys') &&
          !effectiveCmd.includes('/proc')
        );
        if (hitsSafeDir && patterns.every(p => p.severity !== 'critical')) {
          const metrics = getOrCreateMetrics(sessionKey, pluginCfg);
          metrics.lastPolicyResult = `SAFE_DIR_BYPASS(${safeDirs.find(s => effectiveCmd.includes(s))})`;
          return { block: false };
        }

        // Filter out NEVER_WHITELIST_PATTERNS from whitelist consideration
        const neverWhitelistLabels = patterns
          .filter(p => cfg.neverWhitelistPatterns.some(regex => regex.test(effectiveCmd)))
          .map(p => p.label);
        const whitelistablePatterns = patterns.filter(p => !neverWhitelistLabels.includes(p.label));

        const toolTrigger: DCycleTrigger = {
          gate: 'tool',
          operation: toolCall.name,
          patterns: patterns.map(p => p.label),
          normalizedCommand: normalized,
        };
        const agentId = ctx?.agentId || sessionKey.split(':')[0] || 'unknown';
        const sessionId = ctx?.sessionId || sessionKey;

        // Check persistent learned whitelist (before fast-lane — whitelist is permanent, fast-lane is temporary memory)
        if (cfg.evolveMode) {
          const wlMatch = await matchesWhitelist(effectiveCmd);
          if (wlMatch) {
            const metrics = getOrCreateMetrics(sessionKey, pluginCfg);
            metrics.trustSignals.fastLaneUses++;
            metrics.lastPolicyResult = `WHITELIST_BYPASS(${wlMatch.pattern})`;
            await logApproval({ ...recordBase, result: 'whitelist', timestamp: new Date().toISOString() } as ApprovalRecord);
            await logDCycle(sessionKey, agentId, sessionKey, metrics, toolTrigger, 'ACCEPT');
            doLog(api, "debug", `Whitelist approve: ${wlMatch.pattern}`);
            return { block: false };
          }
        }

        const severities = patterns.map(p => p.severity);
        if (severities.includes('critical')) {
          const critLabels = patterns.filter(p => p.severity === 'critical').map(p => p.label);
          const metrics = getOrCreateMetrics(sessionKey, pluginCfg);
          metrics.trustSignals.criticalHits++;
          metrics.lastPolicyResult = `DENY(${critLabels[0]})`;
          await logApproval({ ...recordBase, result: 'deny', timestamp: new Date().toISOString() } as ApprovalRecord);
          await logDCycle(sessionKey, agentId, sessionKey, metrics, toolTrigger, 'REJECT');
          doLog(api, "warn", `CRITICAL pattern blocked: ${critLabels.join(', ')}`);
          return { block: true, blockReason: `Critical dangerous pattern(s): ${critLabels.join(', ')}` };
        }

        const patternKey = patterns.map(p => p.label).sort().join('|');
        if (isFastLane(patternKey)) {
          patterns.forEach(p => onApprove(p.label));
          const metrics = getOrCreateMetrics(sessionKey, pluginCfg);
          metrics.trustSignals.fastLaneUses++;
          metrics.lastPolicyResult = `FASTLANE(${patternKey})`;
          await logApproval({ ...recordBase, result: 'fast_lane', timestamp: new Date().toISOString() } as ApprovalRecord);
          await logDCycle(sessionKey, agentId, sessionKey, metrics, toolTrigger, 'ACCEPT');
          doLog(api, "debug", `Fast-lane approve: ${patternKey}`);
          return { block: false };
        }

        const redacted = redactSecrets(normalized);
        const reviewResult = await smartReview(redacted.redacted, patterns);

        if (reviewResult === 'deny') {
          const metrics = getOrCreateMetrics(sessionKey, pluginCfg);
          metrics.trustSignals.approvalDenials++;
          metrics.lastPolicyResult = `DENY(review)`;
          await logApproval({ ...recordBase, result: 'deny', reason: 'smart-review deny', timestamp: new Date().toISOString() } as ApprovalRecord);
          await logDCycle(sessionKey, agentId, sessionKey, metrics, toolTrigger, 'REJECT');
          return { block: true, blockReason: `Smart review denied: ${patterns.map(p => p.label).join(', ')}` };
        }

        if (reviewResult === 'escalate') {
          const metrics = getOrCreateMetrics(sessionKey, pluginCfg);
          metrics.lastPolicyResult = `ESCALATE`;
          await logApproval({ ...recordBase, result: 'escalate', reason: 'requires human review', timestamp: new Date().toISOString() } as ApprovalRecord);
          await logDCycle(sessionKey, agentId, sessionKey, metrics, toolTrigger, 'ESCALATE');

          const evolveMode = pluginCfg.evolveMode === true;
          const decisions = evolveMode
            ? ["allow-once", "allow-always", "deny"]
            : ["allow-once", "deny"];

          // Determine safe dir hint for description
          const safe = cfg.safeDirs ?? DEFAULT_SAFE_DIRS;
          const safeDirHint = whitelistablePatterns.length > 0 && whitelistablePatterns.every(p => p.severity !== 'critical')
            ? ` (Only safe directories like: ${safe.slice(0, 4).join(', ')}... are learned)`
            : '';

          return {
            block: false,
            requireApproval: {
              title: `Policy Layer: Command Requires Approval`,
              description: `Command "${normalized}" matched pattern(s): ${patterns.map(p => p.label).join(', ')}. Risky operations require human confirmation.${safeDirHint}`,
              severity: "warning",
              allowedDecisions: decisions,
              onResolution: async (decision: string) => {
                const m = getOrCreateMetrics(sessionKey, pluginCfg);
                const resolutionRecord: Partial<ApprovalRecord> = {
                  command: normalized,
                  rawCommand: rawCmd,
                  tool: toolCall.toolName,
                  sessionId: sessionKey,
                  patterns: patterns.map(p => p.label),
                };
                if (decision === 'allow-once') {
                  m.trustSignals.approvalPasses++;
                  await logApproval({ ...resolutionRecord, result: 'allow-once', timestamp: new Date().toISOString() } as ApprovalRecord);
                } else if (decision === 'allow-always') {
                  m.trustSignals.approvalPasses++;
                  await logApproval({ ...resolutionRecord, result: 'allow-always', timestamp: new Date().toISOString() } as ApprovalRecord);
                  if (cfg.evolveMode && whitelistablePatterns.length > 0) {
                    try {
                      const generalized = generalizePattern(effectiveCmd, safe);
                      const entry = await addToWhitelist({
                        pattern: generalized,
                        originalCommand: effectiveCmd,
                        addedAt: new Date().toISOString(),
                        addedBy: 'allow-always',
                      });
                      if (entry.active) {
                        doLog(api, "info", `Whitelist ACTIVATED: ${generalized} (${entry.count} approvals)`);
                      } else {
                        doLog(api, "debug", `Whitelist queued: ${generalized} (${entry.count}/${ACTIVATION_THRESHOLD} — needs ${ACTIVATION_THRESHOLD - entry.count} more)`);
                      }
                    } catch (err) {
                      doLog(api, "warn", `Failed to add whitelist: ${String(err)}`);
                    }
                  }
                } else if (decision === 'deny') {
                  m.trustSignals.approvalDenials++;
                  await logApproval({ ...resolutionRecord, result: 'deny', timestamp: new Date().toISOString() } as ApprovalRecord);
                }
              },
            },
          };
        }

        patterns.forEach(p => onApprove(p.label));
        const metrics = getOrCreateMetrics(sessionKey, pluginCfg);
        metrics.trustSignals.approvalPasses++;
        metrics.lastPolicyResult = `REVIEW_OK`;
        await logApproval({ ...recordBase, result: 'approve', reason: 'smart-review approve', timestamp: new Date().toISOString() } as ApprovalRecord);
        await logDCycle(sessionKey, agentId, sessionKey, metrics, toolTrigger, 'ACCEPT');
        return { block: false };
      } catch (err) {
        doLog(api, "warn", `before_tool_call error: ${String(err)}`);
        return { block: false };
      }
    });

    api.on("after_tool_call", async (toolCall, result) => {
      try {
        if (result?.result) {
          const content = typeof result.result === "string" ? result.result : JSON.stringify(result.result);
          const { found } = redactSecrets(content);
          if (found.length > 0) {
            doLog(api, "warn", `SECRET LEAK DETECTED in ${toolCall.name} output: ${found.join(', ')}`);
          }
        }
      } catch {
      }
    });

    api.registerCommand({
      name: "security-status",
      description: "Show security layer status, fast-lane patterns, and layer info.",
      acceptsArgs: false,
      handler: async () => {
        const fastLanePatterns = getFastLaneEntries()
          .map(({ pattern, count }) => `  ${pattern}: ${count} approves`);
        const lines = [
          "[policy-layer] Layers 1-4 Active",
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
          return { text: `[policy-layer] Fast-lane reset for: ${pattern}` };
        }
        resetFastLane();
        return { text: "[policy-layer] All fast-lane counters reset." };
      },
    });

    api.registerCommand({
      name: "report-bad-result",
      description: "Mark the last command/tool result as bad. Usage: report-bad-result [optional reason]. Note: does NOT auto-blacklist — use security-add-blacklist for that.",
      acceptsArgs: true,
      handler: async (ctx) => {
        const sessionKey = ctx.sessionKey?.trim() || (ctx.agentId && ctx.sessionId ? `${ctx.agentId}:${ctx.sessionId}` : null);
        if (!sessionKey) return { text: "[policy-layer] No session context." };

        const metrics = getOrCreateMetrics(sessionKey, api.pluginConfig || {});
        const reason = ctx.args?.trim() || 'user-reported bad result';
        const cycle = metrics.cycles[metrics.cycles.length - 1];

        if (cycle) {
          cycle.success = false;
          cycle.reason = `BAD_RESULT: ${reason}`;
          cycle.severity = Math.max(cycle.severity, 600);
        }

        if (lastCommand) {
          metrics.trustSignals.userNudges++;
        }

        doLog(api, "warn", `[policy-layer] User bad result feedback: "${reason}". Trust penalty applied. Last command was: "${lastCommand || 'unknown'}".`);
        return {
          text: `[policy-layer] Recorded bad result: "${reason}". ` +
            `Agent trust score will be penalized. ` +
            `Last command was: "${lastCommand || 'unknown'}". ` +
            `To permanently block a command, use: security-add-blacklist <command>`,
        };
      },
    });

    api.registerCommand({
      name: "show-my-d-score",
      description: "Show my cognitive behavior score (D' prime) and session metrics.",
      acceptsArgs: true,
      handler: async (ctx) => {
        const sessionKey =
          ctx.sessionKey?.trim() ||
          (ctx.agentId && ctx.sessionId ? `${ctx.agentId}:${ctx.sessionId}` : null);

        if (!sessionKey) {
          return { text: "[policy-layer] No session context." };
        }

        const metrics = getOrCreateMetrics(sessionKey, {});
        const dPrime = computeDPrime(metrics);
        const riskScore = sigmoidRisk(dPrime, metrics.config.sigmoid.midpoint, metrics.config.sigmoid.steepness);
        const status = dGateStatus(dPrime, metrics.config.dBands, metrics.config.sigmoid);
        const successRate = computeSuccessRate(metrics);
        const toolFailureRate = computeToolFailureRate(metrics);
        const cbrHitRate = computeCbrHitRate(metrics);
        const toolDetails = computeToolDetails(metrics);
        const sevStats = computeSeverityStats(metrics);

        const recent = metrics.cycles.slice(-3);
        const failLines = recent
          .filter((c) => !c.success)
          .map((c) => `  - ${c.reason || "unknown"} (sev=${c.severity})`);

        let breakdown = "";
        try {
          const stats = await dCycleStore.stats(sessionKey);
          if (stats.total > 0) {
            const decLines = Object.entries(stats.byDecision)
              .map(([k, v]) => `    ${k}: ${v}`)
              .join("\n");
            const lastCycles = stats.last10.slice(-5).map((r) => {
              const sev = r.signals.severityDetails;
              const tool = r.signals.toolDetails;
              return `    [${r.cycleId.split(":")[1]}] D'=${r.dPrime?.toFixed(3) ?? "--"} ${r.decision} | ` +
                `sev=${sev.maxSeverity}(${sev.level}) | ` +
                `tool_fail=${tool.failed}/${tool.total} | ` +
                `${r.trigger.gate} gate` +
                (r.trigger.patterns ? ` [${r.trigger.patterns.join(",")}]` : "");
            });
            breakdown = [
              `  Decision breakdown (${stats.total} total):`,
              decLines,
              `  Avg D': ${stats.avgDPrime?.toFixed(4) ?? "--"}`,
              lastCycles.length > 0 ? `  Last 5 cycles:\n${lastCycles.join("\n")}` : "",
            ].filter(Boolean).join("\n");
          }
        } catch { /* non-fatal */ }

        const lines = [
          `[policy-layer] Session: ${sessionKey}`,
          `  D' score:      ${dPrime !== null ? dPrime.toFixed(4) : "--"}`,
          `  Risk score:   ${riskScore !== null ? riskScore.toFixed(3) : "--"}`,
          `  Risk zone:    ${status}`,
          `  Sigmoid:      midpoint=${metrics.config.sigmoid.midpoint} steepness=${metrics.config.sigmoid.steepness}`,
          `  Zones:        accept≤${metrics.config.sigmoid.acceptBelow} | escalate | reject≥${metrics.config.sigmoid.rejectAbove}`,
          `  Cycles:       ${metrics.cycles.length} (window ${metrics.config.window})`,
          `  Calls:        ${metrics.callCounter}`,
          `  --- Signals ---`,
          `  Success rate: ${successRate !== null ? successRate.toFixed(3) : "--"}`,
          `  Tool fail:    ${toolFailureRate !== null ? toolFailureRate.toFixed(3) : "--"} (${toolDetails.failed}/${toolDetails.total})` +
            (toolDetails.failedNames.length > 0 ? ` [${[...new Set(toolDetails.failedNames)].join(",")}]` : ""),
          `  CBR hit:      ${cbrHitRate !== null ? cbrHitRate.toFixed(3) : "--"}`,
          `  Max severity: ${sevStats.maxSeverity} (${sevStats.level})` +
            (sevStats.reason ? ` — ${sevStats.reason.slice(0, 60)}` : ""),
          failLines.length > 0 ? `  Recent failures:\n${failLines.join("\n")}` : `  Recent failures: none`,
          `  Adjust:      set-sigmoid <midpoint|steepness|acceptBelow|rejectAbove> <value>`,
          breakdown ? `\n${breakdown}` : "",
        ].filter(Boolean);

        return { text: lines.join("\n") };
      },
    });

    api.registerCommand({
      name: "set-sigmoid",
      description: "Adjust sigmoid risk scoring parameters. Usage: set-sigmoid <midpoint|steepness|acceptBelow|rejectAbove> <value>",
      acceptsArgs: true,
      handler: async (ctx) => {
        const args = (ctx.args || '').trim().split(/\s+/);
        if (args.length !== 2) {
          return { text: "[policy-layer] Usage: set-sigmoid <midpoint|steepness|acceptBelow|rejectAbove> <value>\n" +
            `  Current: midpoint=${DEFAULT_SIGMOID.midpoint}, steepness=${DEFAULT_SIGMOID.steepness}, acceptBelow=${DEFAULT_SIGMOID.acceptBelow}, rejectAbove=${DEFAULT_SIGMOID.rejectAbove}` };
        }
        const [param, valStr] = args;
        const value = parseFloat(valStr);
        if (isNaN(value)) return { text: `[policy-layer] Invalid value: ${valStr}` };

        const validParams = ['sigmoidMidpoint', 'sigmoidSteepness', 'sigmoidAcceptBelow', 'sigmoidRejectAbove'];
        const internalKey = `sigmoid${param.charAt(0).toUpperCase() + param.slice(1)}`;
        if (!validParams.includes(internalKey)) {
          return { text: `[policy-layer] Unknown parameter: ${param}. Valid: ${validParams.join(', ')}` };
        }

        const sessionKey = ctx.sessionKey?.trim() || (ctx.agentId && ctx.sessionId ? `${ctx.agentId}:${ctx.sessionId}` : null);
        if (sessionKey) {
          const metrics = getOrCreateMetrics(sessionKey, api.pluginConfig || {});
          metrics.config.sigmoid[param === 'midpoint' ? 'midpoint' : param === 'steepness' ? 'steepness' : param === 'acceptBelow' ? 'acceptBelow' : 'rejectAbove'] = value;
        }
        for (const m of sessionMetrics.values()) {
          m.config.sigmoid[param === 'midpoint' ? 'midpoint' : param === 'steepness' ? 'steepness' : param === 'acceptBelow' ? 'acceptBelow' : 'rejectAbove'] = value;
        }
        await persistSigmoidConfig(internalKey, value);
        const dPrime = sessionKey ? computeDPrime(getOrCreateMetrics(sessionKey, {})) : null;
        const risk = dPrime !== null ? sigmoidRisk(dPrime, value, DEFAULT_SIGMOID.steepness) : null;
        return { text: `[policy-layer] ${param}=${value} set (persisted). Current risk for D'=${dPrime?.toFixed(3)}: ${risk?.toFixed(3) ?? '--'}` };
      },
    });
  },
};

export default plugin;
