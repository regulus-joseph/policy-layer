const DEFAULT_WINDOW = 20;
const DEFAULT_D_THRESHOLD = 0.35;

const sessionMetrics = new Map();

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

function computeCostTrend(metrics) {
  const recent = metrics.cycles.slice(-metrics.window);
  if (recent.length < 2) return null;
  const costs = recent.map((c) => c.cost || 0);
  const n = costs.length;
  const sumX = (n * (n - 1)) / 2;
  const sumY = costs.reduce((a, b) => a + b, 0);
  const sumXY = costs.reduce((sum, y, x) => sum + x * y, 0);
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;
  return (n * sumXY - sumX * sumY) / denom;
}

function computeCbrHitRate(metrics) {
  const recent = metrics.cycles.slice(-metrics.window);
  if (recent.length === 0) return null;
  const hits = recent.filter((c) => c.cbrHit).length;
  return hits / recent.length;
}

function computeDPrime(metrics) {
  const successRate = computeSuccessRate(metrics);
  const toolFailureRate = computeToolFailureRate(metrics);
  const cbrHitRate = computeCbrHitRate(metrics);

  const signals = [];
  if (successRate !== null) signals.push({ importance: 0.3, magnitude: successRate });
  if (toolFailureRate !== null) signals.push({ importance: 0.25, magnitude: 1 - toolFailureRate });
  if (cbrHitRate !== null) signals.push({ importance: 0.2, magnitude: cbrHitRate });
  if (signals.length === 0) return null;

  const numerator = signals.reduce((sum, s) => sum + s.importance * s.magnitude, 0);
  return numerator / (0.3 * 1.0 * signals.length);
}

function formatSensorium(sessionKey, metrics) {
  const successRate = computeSuccessRate(metrics);
  const toolFailureRate = computeToolFailureRate(metrics);
  const costTrend = computeCostTrend(metrics);
  const cbrHitRate = computeCbrHitRate(metrics);
  const dPrime = computeDPrime(metrics);
  const recent = metrics.cycles.slice(-5);
  const recentFailures = recent
    .filter((c) => !c.success)
    .map((c) => c.reason || "unknown")
    .slice(-3);

  return [
    "<openclaw_state>",
    `  <session_key>${sessionKey}</session_key>`,
    successRate !== null ? `  <session_success_rate>${successRate.toFixed(3)}</session_success_rate>` : `  <session_success_rate>--</session_success_rate>`,
    toolFailureRate !== null ? `  <tool_failure_rate>${toolFailureRate.toFixed(3)}</tool_failure_rate>` : `  <tool_failure_rate>0.000</tool_failure_rate>`,
    costTrend !== null ? `  <cost_trend>${costTrend.toExponential(4)}</cost_trend>` : `  <cost_trend>--</cost_trend>`,
    cbrHitRate !== null ? `  <cbr_hit_rate>${cbrHitRate.toFixed(3)}</cbr_hit_rate>` : `  <cbr_hit_rate>--</cbr_hit_rate>`,
    dPrime !== null ? `  <d_prime>${dPrime.toFixed(3)}</d_prime>` : `  <d_prime>--</d_prime>`,
    `  <d_gate_threshold>${metrics.dThreshold}</d_gate_threshold>`,
    recentFailures.length > 0 ? `  <recent_failures>${recentFailures.join(" | ")}</recent_failures>` : `  <recent_failures>none</recent_failures>`,
    `  <cycles_tracked>${metrics.cycles.length}</cycles_tracked>`,
    "</openclaw_state>",
  ].join("\n");
}

function resolveLogLevel(pluginConfig) {
  return pluginConfig?.logLevel || "info";
}

const PRIORITY = { debug: 0, info: 1, warn: 2 };

function doLog(api, level, msg) {
  const configured = resolveLogLevel(api.pluginConfig);
  if ((PRIORITY[level] ?? 1) >= (PRIORITY[configured] ?? 1)) {
    const fn = level === "debug" ? api.logger.debug : level === "warn" ? api.logger.warn : api.logger.info;
    fn?.(`[policy-sensorium] ${msg}`);
  }
}

function extractOutcomeFromMessages(messages) {
  let totalTools = 0;
  let failedTools = 0;
  let reason = "";

  for (const msg of messages) {
    if (msg.role === "tool") {
      totalTools++;
      const content = msg.content;
      if (typeof content === "string") {
        let isError = false;
        try {
          const parsed = JSON.parse(content);
          isError = !!(parsed.isError || parsed.error || parsed.success === false);
          if (isError) reason = parsed.error || parsed.message || "tool error";
        } catch {
          const lower = content.toLowerCase();
          if (lower.includes("error") || lower.includes("failed") || lower.includes("exception")) {
            isError = true;
            reason = content.slice(0, 100);
          }
        }
        if (isError) failedTools++;
      }
    }
  }

  return { totalTools, failedTools, reason };
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
          const { totalTools, failedTools, reason } = extractOutcomeFromMessages(messages);
          const success = metrics.lastRecordedSuccess === null
            ? true
            : metrics.lastRecordedSuccess;
          const prevCall = metrics.callCounter - 1;
          if (prevCall > 0) {
            const cost = 0;
            metrics.cycles.push({
              success,
              totalTools,
              failedTools,
              cbrHit: false,
              cost,
              reason,
              timestamp: Date.now(),
            });
            const maxCycles = metrics.window * 3;
            if (metrics.cycles.length > maxCycles) {
              metrics.cycles = metrics.cycles.slice(-metrics.window * 2);
            }
          }
        }

        const dPrime = computeDPrime(metrics);
        if (dPrime !== null && dPrime < metrics.dThreshold) {
          doLog(api, "warn", `D'=${dPrime.toFixed(3)} below threshold ${metrics.dThreshold} for session ${sessionKey}`);
        }

        const sensorium = formatSensorium(sessionKey, metrics);
        doLog(api, "debug", `Injecting sensorium for session ${sessionKey} (D'=${dPrime?.toFixed(3) ?? "--"}, call #${metrics.callCounter})`);

        metrics.lastRecordedSuccess = true;
        metrics.callCounter++;

        return { prependContext: sensorium };
      } catch (err) {
        doLog(api, "warn", `before_prompt_build error: ${String(err)}`);
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
          return { text: "[policy-sensorium] No session context available." };
        }

        const metrics = getOrCreateMetrics(sessionKey);
        const dPrime = computeDPrime(metrics);
        const successRate = computeSuccessRate(metrics);
        const toolFailureRate = computeToolFailureRate(metrics);
        const cbrHitRate = computeCbrHitRate(metrics);

        const lines = [
          `[policy-sensorium] Session: ${sessionKey}`,
          `  Cycles tracked:   ${metrics.cycles.length} (window: ${metrics.window})`,
          `  Calls:          ${metrics.callCounter}`,
          `  Success rate:  ${successRate !== null ? successRate.toFixed(3) : "--"}`,
          `  Tool fail rate: ${toolFailureRate !== null ? toolFailureRate.toFixed(3) : "--"}`,
          `  CBR hit rate:  ${cbrHitRate !== null ? cbrHitRate.toFixed(3) : "--"}`,
          `  D' score:     ${dPrime !== null ? dPrime.toFixed(3) : "--"}`,
          `  D' threshold: ${metrics.dThreshold}`,
          `  D' status:    ${dPrime !== null ? (dPrime >= metrics.dThreshold ? "PASS" : "GATED") : "n/a"}`,
        ];

        return { text: lines.join("\n") };
      },
    });
  },
};

export default plugin;
