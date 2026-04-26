# OpenClaw Plugin & Hook System

## 目录

1. [插件项目结构](#1-插件项目结构)
2. [openclaw.json 配置](#2-openclawjson-配置)
3. [PluginEntrySchema（严格验证）](#3-pluginentryschema严格验证)
4. [Hook 系统分类](#4-hook-系统分类)
5. [所有 Hook 类型详解](#5-所有-hook-类型详解)
6. [PluginEntrySchema 字段对照表](#6-pluginentryschema-字段对照表)
7. [api.on() 注册](#7-apion-注册)
8. [api.registerCommand() 注册命令](#8-apiregistercommand-注册命令)
9. [before_prompt_build 详解](#9-before_prompt_build-详解)
10. [before_agent_start（Legacy）](#10-before_agent_startlegacy)
11. [完整示例：policy-sensorium 插件](#11-完整示例policy-sensorium-插件)
12. [常见陷阱](#12-常见陷阱)
13. [关键文件索引](#13-关键文件索引)

---

## 1. 插件项目结构

```
~/projects/policy-sensorium/          ← 插件根目录（放在 ~/projects/ 下，NOT ~/.openclaw/extensions/）
├── openclaw.plugin.json              ← 插件 manifest（描述符）
├── package.json                      ← npm 包配置
└── src/
    └── index.ts                      ← 插件入口（ESM，default export plugin 对象）
```

### 1.1 openclaw.plugin.json

```json
{
  "id": "policy-sensorium",
  "name": "Policy Sensorium (CBS)",
  "description": "Springdrift-inspired Cognitive Behavior System: injects self-perception signals.",
  "version": "0.1.0",
  "configSchema": {
    "type": "object",
    "properties": {
      "sensoriumWindow": {
        "type": "number",
        "default": 20,
        "description": "Rolling window for cycle metrics"
      },
      "dGateThreshold": {
        "type": "number",
        "default": 0.35,
        "description": "D' gating threshold"
      },
      "logLevel": {
        "type": "string",
        "default": "info",
        "enum": ["debug", "info", "warn"]
      }
    }
  }
}
```

### 1.2 package.json

```json
{
  "name": "policy-sensorium",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "openclaw": {
    "extensions": ["./src/index.ts"]
  },
  "dependencies": {}
}
```

### 1.3 src/index.ts（ESM 插件入口）

```typescript
const plugin = {
  id: "policy-sensorium",
  name: "Policy Sensorium (CBS)",
  description: "Springdrift-inspired Cognitive Behavior System: injects self-perception signals before each LLM call.",
  kind: "sensorium",
  register(api: OpenClawPluginApi) {
    // 注册 hooks, commands, tools 等
  },
};

export default plugin;
```

**关键点：**
- `type: "module"` 使其成为 ESM
- `main: "src/index.ts"` 直接指向 TypeScript 源文件
- `openclaw.extensions: ["./src/index.ts"]` 告诉 OpenClaw 加载这个入口文件
- 插件 ID 必须与 `openclaw.plugin.json` 中的 `id` 一致

---

## 2. openclaw.json 配置

### 2.1 三处必须修改的地方

```json
{
  "plugins": {
    "allow": [
      "...",
      "policy-sensorium"          // ① allow 列表
    ],
    "entries": {
      "...": {},
      "policy-sensorium": {       // ② entries 配置
        "enabled": true,
        "hooks": {
          "allowPromptInjection": true   // 注意：只有这个，没有 allowConversationAccess！
        }
      }
    },
    "installs": {
      "...": {},
      "policy-sensorium": {       // ③ installs 记录
        "source": "path",
        "sourcePath": "/home/marlon-wei/projects/policy-sensorium",
        "installPath": "/home/marlon-wei/projects/policy-sensorium",
        "version": "0.1.0",
        "installedAt": "2026-04-26T05:00:00.000Z"
      }
    },
    "load": {
      "paths": [
        "/home/marlon-wei/projects/skill-auto-injection",
        "/home/marlon-wei/projects/memory-recall",
        "/home/marlon-wei/projects/policy-sensorium"  // ④ load.paths（若用 sourcePath 加载则需）
      ]
    }
  }
}
```

### 2.2 完整插件配置对象结构

```typescript
type PluginEntryConfig = {
  enabled?: boolean;
  hooks?: {
    allowPromptInjection?: boolean;      // 控制 before_prompt_build / before_agent_start 的 prompt 字段
    allowConversationAccess?: boolean;   // ⚠️ 仅 TypeScript 类型定义，运行时 Zod schema 不支持！
  };
  subagent?: {
    allowModelOverride?: boolean;
    allowedModels?: string[];            // ["*"] 允许任意模型
  };
  config?: Record<string, unknown>;      // 插件自定义配置（通过 api.pluginConfig 访问）
};
```

---

## 3. PluginEntrySchema（严格验证）

**来源：** `zod-schema-BhKK4qYw.js` 第 773-781 行

```typescript
const PluginEntrySchema = z.object({
  enabled: z.boolean().optional(),
  hooks: z.object({
    allowPromptInjection: z.boolean().optional()
  }).strict().optional(),   // ← .strict() 意味着任何未知 key 都会报错！
  subagent: z.object({
    allowModelOverride: z.boolean().optional(),
    allowedModels: z.array(z.string()).optional()
  }).strict().optional(),
  config: z.record(z.string(), z.unknown()).optional()
}).strict();   // ← .strict() 顶层也拒绝未知字段
```

### 关键结论

| 字段 | schema 支持 | 运行时效果 |
|------|------------|-----------|
| `enabled` | ✅ | 启用/禁用插件 |
| `hooks.allowPromptInjection` | ✅ | 控制 prompt 变异字段 |
| `hooks.allowConversationAccess` | ❌ | **不要用！** 类型定义有但 Zod `.strict()` 拒绝， gateway 会 abort |
| `subagent` | ✅ | 子 agent 权限控制 |
| `config` | ✅ | 插件自定义配置 |

**`allowConversationAccess` 在 `types.plugins.d.ts` 的 TypeScript 类型中定义，但 Zod `.strict()` schema 不包含它。** 写入此字段 → gateway abort。

---

## 4. Hook 系统分类

### 4.1 三类 Hook

```
PROMPT_INJECTION_HOOK_NAMES  ← "before_prompt_build" | "before_agent_start"
CONVERSATION_HOOK_NAMES       ← "llm_input" | "llm_output" | "agent_end"
（其余 ~20 种）               ← tool/session/compaction/subagent/gateway/dispatch/messaging
```

### 4.2 权限控制矩阵

| Hook 类型 | `allowPromptInjection` | `allowConversationAccess` | 备注 |
|-----------|----------------------|--------------------------|------|
| `before_prompt_build` | ✅ 控制（变异字段） | ❌ 不需要 | 推荐使用 |
| `before_agent_start` | ✅ 控制（变异字段） | ❌ 不需要 | Legacy，推荐用上面 |
| `before_model_resolve` | ✅ 控制（模型选择） | ❌ 不需要 | 选模型，不改 prompt |
| `llm_input` | — | ❌ **schema 不支持** | 不要用 |
| `llm_output` | — | ❌ **schema 不支持** | 不要用 |
| `agent_end` | — | ❌ **schema 不支持** | 不要用 |
| `session_start/end` | — | ❌ 不需要 | 无权限限制 |
| `before/after_tool_call` | — | ❌ 不需要 | 无权限限制 |
| `message_received/sent` | — | ❌ 不需要 | 无权限限制 |
| `gateway_start/stop` | — | ❌ 不需要 | 无权限限制 |

**结论：** 对于非 bundled 插件，只有 `before_prompt_build` 和 `before_agent_start` 是实际可用的（通过 `allowPromptInjection: true` 控制）。`agent_end` / `llm_input` / `llm_output` 需要 `allowConversationAccess`，但 schema 不支持。

---

## 5. 所有 Hook 类型详解

### 5.1 Prompt 变异 Hook（需要 `allowPromptInjection`）

#### `before_prompt_build`

```typescript
// Event
{
  prompt: string;              // 用户输入的 prompt
  messages: unknown[];          // 当前 session 的历史消息（turn 对话）
}

// Result（可选）
{
  systemPrompt?: string;       // 替换 system prompt
  prependContext?: string;      // 预置到 prompt 前的上下文（每轮追加）
  prependSystemContext?: string; // 预置到 system prompt（可缓存，适合静态内容）
  appendSystemContext?: string; // 追加到 system prompt（可缓存）
}
```

**触发时机：** 每次 LLM 调用之前（agent turn）。

**`ctx` 上下文对象：**
```typescript
{
  runId?: string;
  agentId?: string;
  sessionKey?: string;         // "agent:main:explicit:xxx" 格式
  sessionId?: string;          // UUID
  workspaceDir?: string;
  modelProviderId?: string;
  modelId?: string;
  messageProvider?: string;
  trigger?: string;
  channelId?: string;
}
```

#### `before_model_resolve`

```typescript
// Event
{
  prompt: string;
  attachments?: Array<{
    kind: "image" | "video" | "audio" | "document" | "other";
    mimeType?: string;
  }>;
}

// Result
{
  modelOverride?: string;     // e.g. "llama3.3:8b"
  providerOverride?: string;   // e.g. "local-provider"
}
```

#### `before_agent_start`（Legacy）

```typescript
// Event
{
  prompt: string;
  messages?: unknown[];        // legacy 可能为 undefined
}

// Result = PluginHookBeforePromptBuildResult + PluginHookBeforeModelResolveResult
// 内部通过 stripPromptMutationFieldsFromLegacyHookResult() 过滤 prompt 字段
```

---

### 5.2 Conversation Hook（schema 不支持，不要用）

#### `llm_input`

```typescript
{
  runId: string;
  sessionId: string;
  provider: string;
  model: string;
  systemPrompt?: string;
  prompt: string;
  historyMessages: unknown[];
  imagesCount: number;
}
```

#### `llm_output`

```typescript
{
  runId: string;
  sessionId: string;
  provider: string;
  model: string;
  assistantTexts: string[];
  lastAssistant?: unknown;
  usage?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; total?: number; };
}
```

#### `agent_end`

```typescript
{
  messages: unknown[];
  success: boolean;
  error?: string;
  durationMs?: number;
}
```

---

### 5.3 Session Hook

#### `session_start`

```typescript
{
  sessionId: string;
  sessionKey?: string;
  resumedFrom?: string;        // 若从旧 session 恢复
}
```

#### `session_end`

```typescript
{
  sessionId: string;
  sessionKey?: string;
  messageCount: number;
  durationMs?: number;
  reason: "new" | "reset" | "idle" | "daily" | "compaction" | "deleted" | "unknown";
  sessionFile?: string;
  transcriptArchived?: boolean;
  nextSessionId?: string;
  nextSessionKey?: string;
}
```

---

### 5.4 Tool Hook

#### `before_tool_call`

```typescript
{
  toolName: string;
  params: Record<string, unknown>;
  runId?: string;
  toolCallId?: string;
}

// Result
{
  params?: Record<string, unknown>;   // 修改参数
  block?: boolean;                     // 阻止调用
  blockReason?: string;
  requireApproval?: {
    title: string;
    description: string;
    severity?: "info" | "warning" | "critical";
    timeoutMs?: number;
    timeoutBehavior?: "allow" | "deny";
    pluginId?: string;
    onResolution?: (decision: PluginApprovalResolution) => Promise<void>;
  };
}
```

#### `after_tool_call`

```typescript
{
  toolName: string;
  params: Record<string, unknown>;
  runId?: string;
  toolCallId?: string;
  result?: unknown;
  error?: string;
  durationMs?: number;
}
```

#### `tool_result_persist`

```typescript
{
  toolName?: string;
  toolCallId?: string;
  message: AgentMessage;
  isSynthetic?: boolean;
}

// Result
{
  message?: AgentMessage;    // 修改持久化的消息
}
```

---

### 5.5 Compaction / Reset Hook

```typescript
// before_compaction
{ messageCount: number; compactingCount?: number; tokenCount?: number; messages?: unknown[]; sessionFile?: string; }

// after_compaction
{ messageCount: number; tokenCount?: number; compactedCount: number; sessionFile?: string; }

// before_reset
{ sessionFile?: string; messages?: unknown[]; reason?: string; }
```

---

### 5.6 Subagent Hook

| Hook | 用途 |
|------|------|
| `subagent_spawning` | 拦截子 agent 启动，返回 `{ status: "ok" \| "error", error?: string }` |
| `subagent_delivery_target` | 设置投递来源（channel/account/to/threadId） |
| `subagent_spawned` | 子 agent 已启动（包含 runId） |
| `subagent_ended` | 子 agent 结束（outcome: ok/error/timeout/killed/reset/deleted） |

---

### 5.7 Messaging Hook

| Hook | 用途 |
|------|------|
| `message_received` | 收到消息 |
| `message_sending` | 发送前拦截（可修改/取消） |
| `message_sent` | 发送后 |
| `inbound_claim` | 声明/放弃入站消息处理权 |

---

### 5.8 Gateway / Dispatch Hook

| Hook | 用途 |
|------|------|
| `gateway_start` | Gateway 启动时（port 可用） |
| `gateway_stop` | Gateway 关闭时 |
| `before_dispatch` | 原始入站调度拦截 |
| `reply_dispatch` | 回复调度拦截（可检查 counts per dispatch kind） |
| `before_agent_reply` | 拦截 agent 回复（设置 `handled: true` 可自行处理） |

---

### 5.9 Install Hook

```typescript
// before_install
{
  targetType: "skill" | "plugin";
  targetName: string;
  sourcePath: string;
  request: {
    kind: "skill-install" | "plugin-dir" | "plugin-archive" | "plugin-file" | "plugin-npm";
    mode: "install" | "update";
    requestedSpecifier?: string;
  };
  builtinScan: {
    status: "ok" | "error";
    scannedFiles: number;
    critical: number;
    warn: number;
    info: number;
    findings: Array<{ ruleId: string; severity: string; file: string; line: number; message: string; }>;
    error?: string;
  };
}

// Result: { findings?: Finding[]; block?: boolean; blockReason?: string; }
```

---

## 6. PluginEntrySchema 字段对照表

| openclaw.json 路径 | Zod 类型 | 运行时行为 |
|-------------------|---------|-----------|
| `enabled` | `z.boolean()` | 启用/禁用 |
| `hooks.allowPromptInjection` | `z.boolean()` | ✅ 唯一支持的 hook 权限字段 |
| `hooks.allowConversationAccess` | ❌ 不存在 | ❌ 会导致 gateway abort |
| `subagent.allowModelOverride` | `z.boolean()` | 允许子 agent 覆盖模型 |
| `subagent.allowedModels` | `z.array(z.string())` | 允许的模型列表 |
| `config` | `z.record(z.string(), z.unknown())` | 插件自定义配置（通过 `api.pluginConfig` 访问） |

---

## 7. api.on() 注册

```typescript
// 签名
api.on<K extends PluginHookName>(
  hookName: K,
  handler: PluginHookHandlerMap[K],
  opts?: { priority?: number }
): void

// PluginHookHandlerMap 定义了每个 hook 的事件和返回类型
// TypeScript 编译器强制类型安全
```

### 示例

```typescript
api.on("before_prompt_build", async (event, ctx) => {
  const sessionKey = ctx.sessionKey?.trim() || `${ctx.agentId}:${ctx.sessionId}`;

  // 构建上下文 XML
  const sensorium = buildSensoriumXML(sessionKey, metrics);

  // 返回 prependContext 注入到 prompt
  return { prependContext: sensorium };
});

api.on("session_end", async (event, ctx) => {
  console.log(`Session ${ctx.sessionId} ended: ${event.reason}`);
});

api.on("before_tool_call", async (event, ctx) => {
  if (event.toolName === "DangerousTool" && !await isAuthorized(ctx)) {
    return { block: true, blockReason: "Not authorized" };
  }
});
```

---

## 8. api.registerCommand() 注册命令

```typescript
api.registerCommand({
  name: string;                    // 命令名（无前导斜杠），e.g. "policy-sensorium"
  nativeNames?: Partial<Record<string, string>>;
  nativeProgressMessages?: Partial<Record<string, string>>;
  description: string;              // 命令说明
  acceptsArgs?: boolean;            // 是否接受参数
  requireAuth?: boolean;            // 默认 true
  handler: (ctx: PluginCommandContext) => PluginCommandResult | Promise<PluginCommandResult>;
});

// PluginCommandContext
{
  senderId?: string;
  channel?: string;
  channelId?: string;
  isAuthorizedSender?: boolean;
  sessionKey?: string;
  sessionId?: string;
  args?: string;
  commandBody?: string;
  config?: unknown;
  accountId?: string;
  messageThreadId?: string;
  requestConversationBinding(): Promise<void>;
  detachConversationBinding(): Promise<void>;
  getCurrentConversationBinding(): unknown;
}

// PluginCommandResult = ReplyPayload
{
  text?: string;
  // ...其他 ReplyPayload 字段
}
```

### 示例

```typescript
api.registerCommand({
  name: "policy-sensorium",
  description: "Show CBS metrics for current session.",
  acceptsArgs: true,
  handler: async (ctx) => {
    const sessionKey = ctx.sessionKey || "default";
    const metrics = getMetrics(sessionKey);
    return {
      text: [
        `[policy-sensorium] Session: ${sessionKey}`,
        `  D' score:  ${metrics.dPrime?.toFixed(3) ?? "--"}`,
        `  Cycles:    ${metrics.cycles.length}`,
        `  Status:   ${metrics.dPrime >= metrics.dThreshold ? "PASS" : "GATED"}`,
      ].join("\n"),
    };
  },
});
```

---

## 9. before_prompt_build 详解

### 9.1 触发时机

每次 agent 需要 LLM 响应时（`agent-harness-runtime-DTtqy8so.js:24`）：

```
用户消息 → agent turn
  └─ 加载 session messages
  └─ hookRunner.hasHooks("before_prompt_build") ?
       └─ runBeforePromptBuild(event, ctx)
            └─ api.on("before_prompt_build", handler)
                 └─ return { prependContext / systemPrompt / ... }
  └─ 合并到 prompt
  └─ 调用 LLM
```

### 9.2 sessionKey 格式

```
agent:main:explicit:{sessionId}     ← openclaw agent 命令
whatsapp:{account}:{to}             ← WhatsApp channel
telegram:{bot}:{chatId}             ← Telegram channel
```

**测试时用 `sessionKey` 判断当前会话。**

### 9.3 循环跟踪策略（无 agent_end 时的替代方案）

由于 `agent_end` 不可用，cycle 跟踪只能在 `before_prompt_build` 内部完成：

```typescript
const sessionMetrics = new Map();   // 全局 in-memory 存储

api.on("before_prompt_build", async (event, ctx) => {
  const metrics = getOrCreateMetrics(ctx.sessionKey);

  if (metrics.callCounter > 0) {
    // 分析上一轮的工具结果（event.messages 包含 tool role 消息）
    const outcome = extractOutcome(event.messages);
    recordCycle(metrics, outcome);
  }

  const dPrime = computeDPrime(metrics);

  // 注入 XML
  const xml = formatSensorium(ctx.sessionKey, metrics, dPrime);

  metrics.callCounter++;
  return { prependContext: xml };
});
```

### 9.4 从 messages 中提取工具结果

```typescript
function extractOutcome(messages: unknown[]): { totalTools, failedTools, reason } {
  let totalTools = 0, failedTools = 0, reason = "";
  for (const msg of messages as any[]) {
    if (msg.role === "tool") {
      totalTools++;
      const content = msg.content as string;
      // 尝试解析 JSON error
      try {
        const parsed = JSON.parse(content);
        if (parsed.isError || parsed.error) {
          failedTools++;
          reason = parsed.error || parsed.message || "tool error";
        }
      } catch {
        if (content.toLowerCase().includes("error")) {
          failedTools++;
          reason = content.slice(0, 100);
        }
      }
    }
  }
  return { totalTools, failedTools, reason };
}
```

---

## 10. before_agent_start（Legacy）

**用途：** 旧版 hook，等效于 `before_prompt_build` + `before_model_resolve`。

**关键区别：** `before_prompt_build` 的 `messages` 总是有值，`before_agent_start` 的 `messages` 可能是 `undefined`（在 pre-session 阶段）。

```typescript
// 自动过滤 prompt 变异字段（通过 stripPromptMutationFieldsFromLegacyHookResult）
// 返回 systemPrompt/prependContext 等字段会被正确应用
// 但在 Zod schema 验证前就已被 strip
```

**推荐：** 新插件用 `before_prompt_build`，不要用 `before_agent_start`。

---

## 11. 完整示例：policy-sensorium 插件

```typescript
const DEFAULT_WINDOW = 20;
const DEFAULT_D_THRESHOLD = 0.35;

const sessionMetrics = new Map();

function getOrCreateMetrics(sessionKey: string) {
  if (!sessionMetrics.has(sessionKey)) {
    sessionMetrics.set(sessionKey, {
      cycles: [],
      window: DEFAULT_WINDOW,
      dThreshold: DEFAULT_D_THRESHOLD,
      callCounter: 0,
    });
  }
  return sessionMetrics.get(sessionKey);
}

function computeDPrime(metrics): number | null {
  const recent = metrics.cycles.slice(-metrics.window);
  if (recent.length === 0) return null;

  const successRate = recent.filter(c => c.success).length / recent.length;
  const toolFailureRate = recent.reduce((s, c) => s + c.failedTools, 0) /
    Math.max(1, recent.reduce((s, c) => s + c.totalTools, 0));
  const cbrHitRate = recent.filter(c => c.cbrHit).length / recent.length;

  const signals = [
    { importance: 0.3, magnitude: successRate },
    { importance: 0.25, magnitude: 1 - toolFailureRate },
    { importance: 0.2, magnitude: cbrHitRate },
  ];

  const numerator = signals.reduce((sum, s) => sum + s.importance * s.magnitude, 0);
  return numerator / (0.3 * 1.0 * signals.length);
}

function formatSensorium(sessionKey: string, metrics, dPrime: number | null): string {
  const recent = metrics.cycles.slice(-5);
  const failures = recent.filter(c => !c.success).map(c => c.reason || "unknown").slice(-3);

  return [
    "<openclaw_state>",
    `  <session_key>${sessionKey}</session_key>`,
    `  <d_prime>${dPrime?.toFixed(3) ?? "--"}</d_prime>`,
    `  <d_gate_threshold>${metrics.dThreshold}</d_gate_threshold>`,
    `  <cycles_tracked>${metrics.cycles.length}</cycles_tracked>`,
    `  <recent_failures>${failures.join(" | ") || "none"}</recent_failures>`,
    "</openclaw_state>",
  ].join("\n");
}

const plugin = {
  id: "policy-sensorium",
  name: "Policy Sensorium (CBS)",
  description: "Springdrift-inspired Cognitive Behavior System.",
  kind: "sensorium",

  register(api) {
    api.on("before_prompt_build", async (event, ctx) => {
      try {
        const sessionKey = ctx.sessionKey?.trim() ||
          (ctx.agentId && ctx.sessionId ? `${ctx.agentId}:${ctx.sessionId}` : null);
        if (!sessionKey) return;

        const cfg = api.pluginConfig || {};
        const metrics = getOrCreateMetrics(sessionKey);
        if (cfg.sensoriumWindow) metrics.window = cfg.sensoriumWindow;
        if (cfg.dGateThreshold !== undefined) metrics.dThreshold = cfg.dGateThreshold;

        if (metrics.callCounter > 0) {
          const { totalTools, failedTools, reason } = extractOutcome(event.messages || []);
          const cycle = { success: failedTools === 0, totalTools, failedTools, cbrHit: false, reason };
          metrics.cycles.push(cycle);
          if (metrics.cycles.length > metrics.window * 3) {
            metrics.cycles = metrics.cycles.slice(-metrics.window * 2);
          }
        }

        const dPrime = computeDPrime(metrics);
        if (dPrime !== null && dPrime < metrics.dThreshold) {
          api.logger.warn?.(`[policy-sensorium] D'=${dPrime.toFixed(3)} below threshold`);
        }

        const sensorium = formatSensorium(sessionKey, metrics, dPrime);
        metrics.callCounter++;

        return { prependContext: sensorium };
      } catch (err) {
        api.logger.warn?.(`[policy-sensorium] error: ${String(err)}`);
      }
    });

    api.registerCommand({
      name: "policy-sensorium",
      description: "Show CBS metrics for current session.",
      acceptsArgs: true,
      handler: async (ctx) => {
        const sessionKey = ctx.sessionKey?.trim() ||
          (ctx.agentId && ctx.sessionId ? `${ctx.agentId}:${ctx.sessionId}` : null);
        if (!sessionKey) return { text: "[policy-sensorium] No session context." };

        const m = getOrCreateMetrics(sessionKey);
        const d = computeDPrime(m);
        return {
          text: [
            `[policy-sensorium] Session: ${sessionKey}`,
            `  D' score:    ${d?.toFixed(3) ?? "--"}`,
            `  Cycles:     ${m.cycles.length}`,
            `  D' threshold: ${m.dThreshold}`,
            `  Status:     ${d !== null ? (d >= m.dThreshold ? "PASS" : "GATED") : "n/a"}`,
          ].join("\n"),
        };
      },
    });
  },
};

export default plugin;
```

---

## 12. 常见陷阱

### 12.1 不要用 `allowConversationAccess`

```json
// ❌ 这样会导致 gateway abort
"hooks": { "allowConversationAccess": true }

// ✅ 正确做法：用 before_prompt_build 代替 agent_end
"hooks": { "allowPromptInjection": true }
```

### 12.2 `agent_end` / `llm_input` / `llm_output` 不可用

这三个是 conversation hooks，schema 不支持。解决方案：用 `before_prompt_build` 的 `event.messages` 分析上一轮结果。

### 12.3 Gateway 拦截 openclaw.json 写入

Gateway 运行时，Python/外部进程对 `openclaw.json` 的写入会被拦截并恢复。
**解决方案：** 先 `kill $(pgrep -f "openclaw")`，再编辑，再重启。

### 12.4 插件必须在 `~/projects/` 下

`~/.openclaw/extensions/` 是 bundled 插件目录。源码项目插件放在 `~/projects/` 下，通过 `sourcePath` 配置引用。

### 12.5 `before_agent_start` 的 `messages` 可能为 undefined

```typescript
// ⚠️ 可能 undefined
const msgs = event.messages;

// ✅ 安全写法
const msgs = event.messages || [];
```

### 12.6 `api.logger` 的日志级别

`api.logger` 支持 `.debug()` / `.info()` / `.warn()` / `.error()`。默认 `info` 级别，debug 日志需要 gateway 以 `--log-level debug` 启动。

---

## 13. 关键文件索引

| 文件 | 职责 |
|------|------|
| `hook-types.d.ts` | 所有 hook 类型定义（`PluginHookHandlerMap`、`PluginHookName` 等） |
| `hook-before-agent-start.types.d.ts` | `before_prompt_build` / `before_agent_start` 事件和结果类型 |
| `types.plugins.d.ts` | `PluginEntryConfig` 类型（含 `allowConversationAccess` 但 schema 不支持） |
| `zod-schema-BhKK4qYw.js:773-781` | **PluginEntrySchema**（`.strict()`，只允许 `allowPromptInjection`） |
| `loader-DeOtDUYt.js:1265-1280` | `allowPromptInjection` 的运行时拦截逻辑 |
| `agent-harness-runtime-DTtqy8so.js:24-37` | `before_prompt_build` 在 embedded runtime 中的调用 |
| `hook-runner-global-CR-ifbin.js:219-223` | `runBeforePromptBuild` 的 hook runner 实现 |
| `manifest-registry-D5n47dku.js:259-267` | manifest 中 `allowConversationAccess` 的规范化（但 schema 不支持） |
| `status-DzwF2l1C.js` | 报告 `legacy-before-agent-start` 警告 |

### 文档文件

| 文件 | 内容 |
|------|------|
| `docs/openclaw-docs/plugins-hooks.md` | 官方 hooks 文档 |
| `docs/openclaw-docs/plugins-building-plugins.md` | 官方插件构建指南 |
| `docs/openclaw-docs/plugins-sdk.md` | 官方 SDK 文档 |
| `docs/openclaw-docs/plugins-sdk-overview.md` | SDK 概览 |
| `docs/openclaw-docs/automation-hooks.md` | 自动化与 hooks |
