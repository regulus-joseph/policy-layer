import { normalizeCommand } from './security/normalize';
import { detectDangerousPatterns } from './security/patterns';
import { validatePath } from './security/path';

const DEFAULT_WINDOW = 20;
const DEFAULT_D_THRESHOLD = 0.35;

const sessionMetrics = new Map();

const SEVERITY_SCORES = {
  data_exfiltration: 1000,
  system_command: 800,
  file_delete: 600,
  exec_failure: 500,
  llm_timeout: 400,
  network_timeout: 300,
  tool_permission_denied: 200,
  generic_error: 100,
  unknown: 50,
};

function classifySeverity(reason) {
  if (!reason) return 50;
  const lower = reason.toLowerCase();
  if (lower.includes("permission") || lower.includes("denied") || lower.includes("forbidden")) return 200;
  if (lower.includes("timeout") || lower.includes("timed out")) return 300;
  if (lower.includes("network") || lower.includes("fetch") || lower.includes("connect")) return 300;
  if (lower.includes("exec") || lower.includes("subprocess")) return 500;
  if (lower.includes("delete") || lower.includes("rm ") || lower.includes("unlink")) return 600;
  if (lower.includes("system") && lower.includes("command")) return 800;
  if (lower.includes("exfil") || lower.includes("steal") || lower.includes("leak")) return 1000;
  return 100;
}

function getOrCreateMetrics(sessionKey) {
  if (!sessionMetrics.has(sessionKey)) {
    sessionMetrics.set(sessionKey, {
      cycles: [],
      window: DEFAULT_WINDOW,
      dThreshold: DEFAULT_D_THRESHOLD,
      callCounter: 0,
      lastRecordedSuccess: null,
    });
  }
  return sessionMetrics.get(sessionKey);
}

function computeSuccessRate(metrics) {
  const recent = metrics.cycles.slice(-metrics.window);
  if (recent.length === 0) return null;
  return recent.filter((c) => c.success).length / recent.length;
}

function computeToolFailureRate(metrics) {
  const recent = metrics.cycles.slice(-metrics.window);
  if (recent.length === 0) return null;
  const totalTools = recent.reduce((sum, c) => sum + (c.totalTools || 0), 0);
  const failedTools = recent.reduce((sum, c) => sum + (c.failedTools || 0), 0);
  if (totalTools === 0) return 0;
  return failedTools / totalTools;
}

function computeCbrHitRate(metrics) {
  const recent = metrics.cycles.slice(-metrics.window);
  if (recent.length === 0) return null;
  return recent.filter((c) => c.cbrHit).length / recent.length;
}

function computeAverageSeverity(metrics) {
  const recent = metrics.cycles.slice(-metrics.window);
  if (recent.length === 0) return null;
  const avg = recent.reduce((sum, c) => sum + (c.severity || 50), 0) / recent.length;
  return avg / 1000;
}

function computeDPrime(metrics) {
  const successRate = computeSuccessRate(metrics);
  const toolSuccess = 1 - (computeToolFailureRate(metrics) ?? 0);
  const cbrHitRate = computeCbrHitRate(metrics);
  const avgSeverity = computeAverageSeverity(metrics);

  const signals = [];
  if (successRate !== null) signals.push({ importance: 0.30, magnitude: successRate });
  if (toolSuccess !== null) signals.push({ importance: 0.25, magnitude: toolSuccess });
  if (cbrHitRate !== null) signals.push({ importance: 0.20, magnitude: cbrHitRate });
  if (avgSeverity !== null) signals.push({ importance: 0.25, magnitude: 1 - avgSeverity });

  if (signals.length === 0) return null;

  const MAX_IMPORTANCE = 0.30;
  const MAX_MAGNITUDE = 1.0;
  const n = signals.length;

  const numerator = signals.reduce((sum, s) => sum + s.importance * s.magnitude, 0);
  const denominator = MAX_IMPORTANCE * MAX_MAGNITUDE * n;

  return numerator / denominator;
}

function dGateStatus(dPrime) {
  if (dPrime === null) return "UNKNOWN";
  if (dPrime >= 0.55) return "HIGH_REJECT";
  if (dPrime >= 0.35) return "MEDIUM_CONFIRM";
  return "LOW_ACCEPT";
}

function formatSensorium(sessionKey, metrics) {
  const successRate = computeSuccessRate(metrics);
  const toolFailureRate = computeToolFailureRate(metrics);
  const cbrHitRate = computeCbrHitRate(metrics);
  const dPrime = computeDPrime(metrics);
  const status = dGateStatus(dPrime);
  const recent = metrics.cycles.slice(-5);
  const recentFailures = recent
    .filter((c) => !c.success)
    .map((c) => (c.severity >= 600 ? `[CRIT]${c.reason || "unknown"}` : c.reason || "unknown"))
    .slice(-3);

  return [
    "<openclaw_state>",
    `  <session_key>${sessionKey}</session_key>`,
    `  <d_prime>${dPrime !== null ? dPrime.toFixed(4) : "--"}</d_prime>`,
    `  <d_gate_threshold>${metrics.dThreshold}</d_gate_threshold>`,
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

function extractOutcomeFromMessages(messages) {
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
          const sev = classifySeverity(errReason);
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
        const metrics = getOrCreateMetrics(sessionKey);

        if (cfg.sensoriumWindow) metrics.window = cfg.sensoriumWindow;
        if (cfg.dGateThreshold !== undefined) metrics.dThreshold = cfg.dGateThreshold;

        const messages = event.messages || [];

        if (metrics.callCounter > 0) {
          const { totalTools, failedTools, reason, severity } = extractOutcomeFromMessages(messages);
          const success = failedTools === 0;
          metrics.cycles.push({
            success,
            totalTools,
            failedTools,
            cbrHit: false,
            reason,
            severity,
            timestamp: Date.now(),
          });
          const maxCycles = metrics.window * 3;
          if (metrics.cycles.length > maxCycles) {
            metrics.cycles = metrics.cycles.slice(-metrics.window * 2);
          }
        }

        const dPrime = computeDPrime(metrics);
        const status = dGateStatus(dPrime);

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

    api.on("before_tool_call", async (toolCall) => {
      try {
        const raw = toolCall.arguments
          ? JSON.stringify(toolCall.arguments)
          : '';
        const cmd = (toolCall.name + ' ' + raw).trim();
        const normalized = normalizeCommand(cmd);
        const patterns = detectDangerousPatterns(normalized);

        if (patterns.length > 0) {
          const severities = patterns.map(p => p.severity);
          if (severities.includes('critical')) {
            return {
              block: true,
              blockReason: `Critical dangerous pattern(s) detected: ${patterns.map(p => p.label).join(', ')}`,
            };
          }
          return {
            block: false,
            requireApproval: true,
          };
        }
        return { block: false };
      } catch (err) {
        doLog(api, "warn", `before_tool_call error: ${String(err)}`);
        return { block: false };
      }
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

        const metrics = getOrCreateMetrics(sessionKey);
        const dPrime = computeDPrime(metrics);
        const status = dGateStatus(dPrime);
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
          `  Threshold:    ${metrics.dThreshold}`,
          `  Cycles:       ${metrics.cycles.length} (window ${metrics.window})`,
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
