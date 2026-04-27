# Policy-Layer Layer 1-4 实施计划

## 目标

在 OpenClaw Gateway plugin 层面实现四层安全管控，与 hermes-agent / NemoClaw 互补，为 WSL2 个人用户提供实用的安全增强。

---

## Layer 1: Pattern Detection + Normalize

**目标**: 在 `before_tool_call` hook 对所有工具调用做命令归一化 + 危险模式检测

### 1.1 命令归一化（新增）

```typescript
// src/security/normalize.ts
export function normalizeCommand(cmd: string): string {
  // 1. 清除 ANSI escape sequences
  let s = cmd.replace(/\x1b\[[^m]*m/g, '');
  // 2. 清除 null bytes
  s = s.replace(/\0/g, '');
  // 3. NFKC 归一化（消除全角字符混淆）
  s = s.normalize('NFKC');
  return s;
}
```

**来源**: hermes-agent `approval.py` 的 `_normalize_command_for_detection()`

### 1.2 危险模式检测（新增）

```typescript
// src/security/patterns.ts
export const DANGEROUS_PATTERNS: Array<{re: RegExp; label: string; severity: 'critical'|'high'|'medium'}> = [
  // 来自 hermes-agent approval.py 38 条规则
  { re: /\brm\s+(-[^\s]*\s*)*\//, label: 'delete in root path', severity: 'critical' },
  { re: /\brm\s+-[^\s]*r/, label: 'recursive delete', severity: 'critical' },
  { re: /\bcurl\b.*\|\s*(ba)?sh\b/, label: 'pipe remote to shell', severity: 'critical' },
  { re: /\brm\s+--recursive\b/, label: 'recursive delete long flag', severity: 'critical' },
  { re: /\bchmod\s+(-[^\s]*\s*)*(777|666|o\+[rwx]*w|a\+[rwx]*w)\b/, label: 'world-writable permissions', severity: 'high' },
  { re: /\bdd\s+.*if=/, label: 'disk copy', severity: 'critical' },
  { re: /\bDROP\s+(TABLE|DATABASE)\b/, label: 'SQL DROP', severity: 'critical' },
  { re: /\bDELETE\s+FROM\b(?!.*\bWHERE\b)/, label: 'SQL DELETE without WHERE', severity: 'high' },
  { re: /\bkill\s+-9\s+-1\b/, label: 'kill all processes', severity: 'critical' },
  { re: /\b(pkill|killall)\b.*-9/, label: 'force kill processes', severity: 'high' },
  { re: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, label: 'fork bomb', severity: 'critical' },
  { re: /\b(python[23]?|perl|ruby|node)\s+-[ec]\s+/, label: 'script via -e/-c flag', severity: 'medium' },
  { re: /\b(python[23]?|perl|ruby|node)\s+<<\s*/, label: 'script via heredoc', severity: 'medium' },
  { re: /\b(curl|wget)\b.*\|\s*(ba)?sh\b/, label: 'pipe remote to shell', severity: 'critical' },
  // Gateway 自保护
  { re: /\b(pkill|killall)\b.*\b(gateway|openclaw)\b/, label: 'kill gateway self-termination', severity: 'critical' },
  { re: /\bopenclaw\s+gateway\s+(stop|restart)\b/, label: 'gateway lifecycle attack', severity: 'critical' },
  // Git destructive
  { re: /\bgit\s+reset\s+--hard\b/, label: 'git reset --hard', severity: 'high' },
  { re: /\bgit\s+push\b.*--force\b/, label: 'git force push', severity: 'medium' },
  { re: /\bgit\s+clean\s+-[^\s]*f/, label: 'git clean force', severity: 'medium' },
  // ... 共 ~25 条核心规则（删减 hermes-agent 的 shell 注入子集）
];

export interface PatternMatch {
  label: string;
  severity: 'critical' | 'high' | 'medium';
}

export function detectDangerousPatterns(cmd: string): PatternMatch[] {
  const normalized = normalizeCommand(cmd);
  const matches: PatternMatch[] = [];
  for (const {re, label, severity} of DANGEROUS_PATTERNS) {
    if (re.test(normalized)) matches.push({ label, severity });
  }
  return matches;
}
```

### 1.3 路径穿越验证（新增）

```typescript
// src/security/path.ts
export function validatePath(path: string, root: string): string | null {
  // 拒绝绝对路径含 .. 或绝对路径超越 root
  // 用于 file/edit/copy/move 工具的参数检查
}
```

### 1.4 Layer 1 集成到 before_tool_call

```typescript
api.on("before_tool_call", async (event, ctx) => {
  const { toolName, params } = event;

  // 只检查 exec 类工具
  if (!['exec', 'bash', 'shell', 'run_command'].includes(toolName)) return;

  const cmd = typeof params.command === 'string' ? params.command
             : typeof params.cmd === 'string' ? params.cmd
             : null;
  if (!cmd) return;

  const matches = detectDangerousPatterns(cmd);
  if (matches.length === 0) return; // 无危险模式，放行

  const critical = matches.filter(m => m.severity === 'critical');
  if (critical.length > 0) {
    return {
      block: true,
      blockReason: `Critical danger patterns: ${critical.map(m => m.label).join(', ')}`,
    };
  }

  // high/medium → 触发审批
  return {
    requireApproval: {
      title: `Dangerous command: ${matches[0].label}`,
      description: `Pattern hit: ${matches.map(m => `${m.severity}: ${m.label}`).join('\n')}\n\nCommand:\n${cmd}`,
      severity: 'warning',
      timeoutMs: 300000,
      timeoutBehavior: 'deny',
    },
  };
}, { name: 'policy-layer-pattern-gating', priority: 100 });
```

---

## Layer 2: D' Statistical Gating

**目标**: 扩展 policy-sensorium 的 D' 信号，加入 danger signal，增强统计决策

### 2.1 扩展 D' 信号

```typescript
// 原有 4 信号，新增第 5 信号
const WEIGHTS = {
  success:       0.30,
  tool:          0.25,
  cbr:           0.20,
  severity:      0.25,
  danger:        0.30,   // 新增：危险命令出现次数
};

// 新增 danger signal
function computeDangerSignal(metrics: SessionMetrics): number | null {
  const recent = metrics.cycles.slice(-metrics.config.window);
  if (recent.length === 0) return null;
  const dangerCount = recent.filter(c => c.patternHit && c.patternSeverity === 'critical').length;
  return 1 - (dangerCount / Math.max(recent.length, 1));
}
```

### 2.2 D' 分段联动 Layer 3

```typescript
// Layer 1 命中 + D' 分段决定行为
function decideAction(matches: PatternMatch[], dPrime: number | null, ctx): Action {
  if (dPrime === null) return 'llm_review'; // 冷启动，保守

  const critical = matches.filter(m => m.severity === 'critical');
  if (critical.length > 0 && dPrime >= 0.55) {
    return 'block'; // D' 高 + critical pattern = 直接拒绝
  }
  if (critical.length > 0 && dPrime >= 0.35) {
    return 'llm_review'; // D' 中 + critical = LLM 二审
  }
  if (matches.length > 0 && dPrime < 0.35) {
    return 'llm_review'; // D' 低但有危险模式 = LLM 二审
  }
  return 'allow';
}
```

### 2.3 Layer 2 configSchema 扩展

```json
{
  "policy-layer": {
    "preset": "personal-acp",
    "dBandLow": 0.35,
    "dBandHigh": 0.55,
    "dangerSignal": true,
    "dangerWeight": 0.30
  }
}
```

---

## Layer 3: LLM Smart Review

**目标**: Pattern 命中 + D' 中间值时，调用辅助 LLM 做二审，减少误报

### 3.1 LLM Review 实现

```typescript
// src/security/smart-review.ts
export async function smartReview(
  command: string,
  patterns: PatternMatch[],
): Promise<'approve' | 'deny' | 'escalate'> {

  const patternDesc = patterns.map(p => `${p.severity}: ${p.label}`).join(', ');
  const prompt = `You are a security reviewer for an AI coding agent.

Command was flagged for: ${patternDesc}

Command: ${command}

Assess ACTUAL risk. Many pattern flags are false positives.
Examples of false positives:
- \`python -c "print('hello')"\` is harmless
- \`curl https://example.com | bash\` from trusted CDNs is often legitimate
- \`rm -rf node_modules\` is normal dev cleanup

Respond with exactly one word: APPROVE, DENY, or ESCALATE`;

  const result = await callAuxLLM({
    messages: [{ role: 'user', content: prompt }],
    model: 'llm',
    temperature: 0,
    max_tokens: 16,
  });

  const answer = (result.content || '').trim().toUpperCase();
  if (answer.includes('APPROVE')) return 'approve';
  if (answer.includes('DENY')) return 'deny';
  return 'escalate';
}
```

### 3.2 approval history 积累

```typescript
// src/security/approval-log.ts
interface ApprovalRecord {
  ts: number;
  sessionKey: string;
  command: string;
  patterns: string[];
  dPrime: number;
  verdict: 'approve' | 'deny' | 'escalate' | 'timeout';
  source: 'pattern' | 'd_prime' | 'llm_review' | 'human';
}

// 写入 JSONL 审计日志
const APPROVAL_LOG = `${process.env.OPENCLAW_STATE_DIR}/logs/approval.jsonl`;

export function logApproval(record: ApprovalRecord) {
  fs.appendFileSync(APPROVAL_LOG, JSON.stringify(record) + '\n');
}

// 快速查询同类命令历史
export function lookupHistory(command: string): ApprovalRecord[] {
  // 简单实现：读取最近 1000 行，查同类 pattern
}
```

### 3.3 连续 approve 自动放行

```typescript
// 同类 pattern 连续 5 次 approve → 进入快车道
const FAST_LANE_THRESHOLD = 5;
const fastLane = new Map<string, number>(); // pattern → consecutive approves

function onApprove(pattern: string) {
  const count = (fastLane.get(pattern) || 0) + 1;
  fastLane.set(pattern, count);
}

function isFastLane(pattern: string): boolean {
  return (fastLane.get(pattern) || 0) >= FAST_LANE_THRESHOLD;
}
```

---

## Layer 4: Secret Redaction in Output

**目标**: 在 `after_tool_call` hook 对所有输出扫描并 redact 敏感信息

### 4.1 凭证模式库（40+ patterns）

```typescript
// src/security/secret-patterns.ts
export const SECRET_PATTERNS: Array<{re: RegExp; label: string}> = [
  // GitHub
  { re: /ghp_[A-Za-z0-9]{36}/, label: 'GitHub token' },
  { re: /github_pat_[A-Za-z0-9_]{22,}/, label: 'GitHub PAT' },
  // OpenAI
  { re: /sk-[A-Za-z0-9]{48,}/, label: 'OpenAI key' },
  // Anthropic
  { re: /sk-ant-[A-Za-z0-9_-]{20,}/, label: 'Anthropic key' },
  // AWS
  { re: /AKIA[A-Z0-9]{16}/, label: 'AWS access key' },
  { re: /(?:aws)?_?(?:secret)?_?access_?key.*["\s]([A-Za-z0-9\/+=]{40})/, label: 'AWS secret key' },
  // Slack
  { re: /xox[baprs]-[A-Za-z0-9]{10,}/, label: 'Slack token' },
  // NVIDIA
  { re: /nvapi-[A-Za-z0-9]{16,}/, label: 'NVIDIA API key' },
  { re: /nvcf-[A-Za-z0-9]{20,}/, label: 'NVIDIA CF API key' },
  // Bearer tokens
  { re: /Bearer\s+[A-Za-z0-9\-_]{20,}/, label: 'Bearer token' },
  // Generic patterns
  { re: /(?:api[_-]?key|apikey)\s*[:=]\s*["\']?([A-Za-z0-9_\-]{20,})/i, label: 'Generic API key' },
  { re: /(?:password|passwd|pwd)\s*[:=]\s*["\']?([^\s'"]{8,})/i, label: 'Password' },
  { re: /(?:private[_-]?key)\s*[:=]\s*["\']?-----BEGIN/, label: 'Private key' },
  // ... 共 40+ 条（参考 NemoClaw credential-filter.ts）
];
```

### 4.2 Redaction 引擎

```typescript
// src/security/redact.ts
export interface RedactResult {
  redacted: string;
  found: string[];
}

export function redactSecrets(text: string): RedactResult {
  const found: string[] = [];
  let result = text;
  for (const {re, label} of SECRET_PATTERNS) {
    if (re.test(result)) {
      found.push(label);
      result = result.replace(re, `[${label} REDACTED]`);
    }
  }
  return { redacted: result, found };
}
```

### 4.3 Layer 4 集成到 after_tool_call

```typescript
// after_tool_call hook
api.on("after_tool_call", async (event) => {
  const { toolName, result, toolCallId } = event;
  if (!result || typeof result !== 'string') return;

  const { redacted, found } = redactSecrets(result);
  if (found.length === 0) return;

  // 1. 写审计日志
  writeAudit({
    ts: Date.now(),
    event: 'secret_detected',
    toolCallId,
    tool: toolName,
    patterns: found,
  });

  // 2. 通知（通过 audit channel 或 session message）
  // 3. 返回 redacted 结果（需要修改 result 对象）

  return { modified: true, redactedResult: redacted };
}, { name: 'policy-layer-secret-redact', priority: 50 });
```

### 4.4 URL 参数 redact

```typescript
// 来自 NemoClaw: URL 中的凭证参数也要清除
export function redactUrl(url: string): string {
  return url
    .replace(/([?&])(signature|sig|token|auth|access_token|key)=[^&\s]*/gi,
             '$1$2=[REDACTED]')
    .replace(/:[^@\s:]+@/g, ':[REDACTED]@'); // user:pass@host
}
```

---

## 文件结构规划

```
policy-layer/src/
  sensorium-index.ts        # 已有：D' + CBS
  security/
    normalize.ts            # Layer 1: ANSI/Unicode/null 归一化
    patterns.ts            # Layer 1: 危险模式库（~25条）
    path.ts                # Layer 1: 路径穿越验证
    smart-review.ts        # Layer 3: LLM 二审
    approval-log.ts        # Layer 3: 审批历史（JSONL）
    secret-patterns.ts     # Layer 4: 凭证模式库（40+条）
    redact.ts              # Layer 4: Redaction 引擎
  config/
    presets.ts             # 四套预设配置
    schema.ts              # configSchema 扩展
```

---

## 实施顺序

```
阶段一：Layer 1 基础（1-2天）
├─ normalize.ts + patterns.ts + path.ts
├─ before_tool_call hook 集成
└─ configSchema 扩展

阶段二：Layer 2 增强（1-2天）
├─ danger signal 加入 D' 计算
├─ D' 分段联动 Layer 3 触发条件
└─ 现有 42 个测试验证

阶段三：Layer 3 LLM Review（2-3天）
├─ smart-review.ts（接 aux LLM）
├─ approval-log.ts（JSONL 审计）
└─ fast-lane 机制

阶段四：Layer 4 Secret Redaction（1-2天）
├─ secret-patterns.ts（40+ patterns）
├─ redact.ts + URL redact
└─ after_tool_call hook 集成

阶段五：集成 + 测试（2-3天）
├─ 四套 preset 配置完成
├─ 端到端测试（实际 ACP session）
└─ README 补充实施文档
```

---

## 依赖确认

| 依赖 | 状态 |
|------|------|
| `before_tool_call` hook | ✅ 已确认存在 |
| `after_tool_call` hook | ✅ 已确认存在 |
| `requireApproval` return type | ✅ 已确认存在（`blockReason`, `requireApproval`） |
| `PluginApprovalResolution` | ✅ 已确认：`allow-once` / `allow-always` / `deny` / `timeout` / `cancelled` |
| aux LLM provider | ✅ 通过 `llm-connector` 调用 |
| JSONL 文件写入 | ✅ Node.js fs 模块 |
