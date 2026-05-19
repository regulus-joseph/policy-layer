# Policy Layer — v0.5.0

**OpenClaw Gateway Plugin：** 4 层安全执行框架 + D' 认知行为评分系统（CBS）

---

## 什么是 Policy Layer？

Policy Layer 是运行在 OpenClaw Gateway 层的安全与行为管控插件，在每一条 Agent 命令执行前、中、后三个阶段进行多维度检查：

```
用户输入 → LLM 决定执行工具 → before_tool_call（安全检查）
                                         ↓
工具执行 → after_tool_call（敏感信息泄漏检测）
                                         ↓
LLM 下一次决策前 → before_prompt_build（注入认知状态评分）
```

**它解决的核心问题：**
- **安全**：防止误操作和恶意命令执行（如 `rm -rf /`、`curl|sh` 等）
- **感知**：让 Agent "知道自己的状态"，在低分时主动降速谨慎
- **学习**：记录所有安全决策，用户可反馈错误决策（report-bad-result）
- **透明**：所有决策都记录到 JSONL，供审计和可视化

---

## 核心功能一览

| 功能 | 描述 |
|------|------|
| 🛡️ 危险命令拦截 | Layer 1 模式匹配，16 类 CRITICAL 命令立即拦截，不经 LLM |
| 🤖 LLM 智能复核 | HIGH/MEDIUM 命令通过 Ollama 本地模型二次复核（approve/deny/escalate） |
| 🚀 快车道 | 同一无害命令连续 5 次审批通过 → 跳过 LLM 复核，直接放行 |
| 📚 已学习的白名单 | 用户点击"始终允许"3次 → 模式自动学习，持久化到 `learned-whitelist.jsonl`（重启不丢失） |
| 📊 认知状态评分 | D' trust score，8 个信号（成功率/工具失败/严重度/critical命中/审批通过/审批拒绝/用户反馈/快车道使用） |
| 🔒 密钥泄漏检测 | after_tool_call 扫描工具输出，39 种密钥模式，泄露即告警 |
| 📝 决策审计日志 | 全部决策写入 `~/.openclaw/logs/approval.jsonl`（追加式 JSONL） |
| 🗳️ 用户反馈闭环 | `report-bad-result` 用户可标记错误决策 → 信任度下降（不自动加黑名单） |
| 📈 可视化仪表盘 | 从 approval.jsonl 生成 HTML 仪表盘，支持按模式筛选和时序分析 |

---

## 快速开始

```bash
# 验证插件已加载（重启后生效）
openclaw gateway restart

# 运行测试
cd ~/projects/policy-layer
npm test                  # 166 tests

# 更新可视化仪表盘
python3 docs/generate-analytics.py
open docs/approval-analytics.html
```

---

## 架构详解

### 整体流程

```
Tool Call 输入
     │
     ├─ Layer 1: normalizeCommand()
     │      ├─ 去除 ANSI 转义码
     │      ├─ 去除 null 字节
     │      └─ NFKC 标准化（Unicode 同形字符规范化）
     │      ↓
     ├─ Layer 1: detectDangerousPatterns()
     │      ├─ CRITICAL (16): 立即拦截，不经 LLM 复核
     │      └─ HIGH/MEDIUM (7): 进入 Smart Review
     │      ↓
     ├─ Layer 2: D' CBS（before_prompt_build 注入）
     │      └─ 在 prompt 中注入 <openclaw_state> XML 标签
     │         Agent 读取后知道自己的 D' 分数并主动调整行为
     │      ↓
     ├─ Layer 3: Smart Review + 白名单
     │      ├─ 已学习的白名单（持久化，文件存储，重启不丢失）
     │      ├─ Fast Lane（内存，5 次 approve，重启重置）
     │      ├─ Ollama 本地推理（approve / deny / escalate）
     │      ├─ allow-always → 持久化到 learned-whitelist.jsonl
     │      └─ Approval Log：所有决策追加写入 approval.jsonl
     │      ↓
     └─ Layer 4: Secret Leak Detection（after_tool_call）
            └─ 扫描工具输出，39 种密钥模式，泄露即 warn
```

---

## 各层功能详解

### Layer 1 — 命令规范化与危险模式检测

#### 1.1 命令规范化（`normalize.ts`）

在模式匹配之前，对命令进行三重预处理：

```typescript
normalizeCommand(cmd: string): string
  ├─ stripAnsi(str)         // 去除 ANSI 转义码（如 \x1b[31m）
  ├─ stripNullBytes(str)     // 去除 \x00 字节（绕过检测的常见手段）
  └─ nfkcNormalize(str)      // NFKC 规范化（把同形字符统一为标准形式）
```

**为什么需要 NFKC 规范化？**
某些 Unicode 字符和 ASCII 字符视觉上完全相同（如希腊字母 `ο` vs 拉丁 `o`），攻击者可能用同形字符构造绕过检测的命令。NFKC 规范化将其统一，防止这类混淆攻击。

#### 1.2 危险模式检测（`patterns.ts`）

检测 23 种危险模式，分两级处置：

**CRITICAL — 立即拦截（不经过 LLM）**
| 模式 | 匹配命令示例 | 说明 |
|------|-------------|------|
| `rm_recursive_root` | `rm -rf /`, `rm -rf /*` | 递归删除根目录 |
| `pipe_to_shell` | `curl ... \| sh`, `wget ... \| bash` | 远程代码执行 |
| `kill_all` | `kill -9 -1`, `killall gateway` | 杀死全部进程 |
| `fork_bomb` | `:(){ :\|:& };:` | Fork 炸弹 |
| `chmod_777_root` | `chmod 777 /` | 权限降级 |
| `gateway_stop` | `pkill gateway`, `openclaw gateway stop` | 关闭网关自身 |
| `script_execution` | `chmod +x *.sh \| bash\|sh\|python` | 执行未授权脚本 |
| `/dev/tcp` | `cat /dev/tcp/...` | 绕过防火墙的网络访问 |

**HIGH / MEDIUM — LLM 智能复核**
| 模式 | 匹配命令示例 |
|------|-------------|
| `git_reset_hard` | `git reset --hard` |
| `dev_tcp` | `/dev/tcp/host/port` |
| `sql_drop` | `DROP TABLE`, `DROP DATABASE` |
| `kill_term_negative` | `kill -TERM -1` |

#### 1.3 路径遍历检测（`path.ts`）

检测路径遍历攻击：`../` 逃逸家目录、`/proc`/`/sys` 敏感路径访问。

---

### Layer 2 — D' 认知行为评分系统（CBS）

#### 2.1 什么是 D'？

D'（d-prime，读作 "d-prime"）是信号检测论中的核心指标。Policy Layer 将其引入 AI Agent 行为评估——将 Agent 的历史行为视为"信号"，与基准行为对比，得出一个可量化的风险/异常评分。

#### 2.2 四个信号维度

每次工具调用结束后，系统记录 4 个信号：

| 信号 | 权重 | 含义 | 满分归一化 |
|------|------|------|-----------|
| `success_rate` | 0.30 | 工具调用成功率 | 成功率 / 1.0 |
| `tool_fail` | 0.25 | 工具失败率（越低越好） | 1 - 失败率 / 1.0 |
| `cbr_hit` | 0.20 | 上下文缓冲命中率（Context Buffer Recall） | 命中率 / 1.0 |
| `severity_inv` | 0.25 | 严重度（越低越好） | 1 - 严重度 / 1000 |

#### 2.3 D' 分数计算

```
D' = Σ(w_i × m_i) / (0.30 × 1.0 × n)
```
其中 `m_i` 是各信号在满分归一化后的值，`n` 是 cycle 窗口数。

#### 2.4 分数注入方式

在 `before_prompt_build` 钩子中，向 LLM 的 context 注入 `<openclaw_state>` XML 块：

```xml
<openclaw_state>
  <d_prime>0.72</d_prime>
  <d_gate_threshold>0.35</d_gate_threshold>
  <d_gate_status>HIGH_REJECT</d_gate_status>
  <cycles_tracked>12</cycles_tracked>
  <session_success_rate>0.95</session_success_rate>
  <last_policy_result>PASS</last_policy_result>
</openclaw_state>
```

#### 2.5 分数阈值与行为指导

| D' 范围 | 状态 | Agent 行为 |
|---------|------|-----------|
| > 0.65 | `NORMAL` | 正常执行，无特殊指导 |
| 0.35–0.65 | `LOW_ACCEPT` | 适度谨慎，降低激进操作 |
| < 0.35 | `HIGH_REJECT` | 显著降速，只做最小必要操作 |
| < 0.20 | `CRITICAL` | 暂停所有非必要操作，等待用户确认 |

---

### Layer 3 — 智能复核系统

#### 3.1 Smart Review（`smart-review.ts`）

对于 HIGH/MEDIUM 级别的命令，通过 Ollama 本地 LLM 进行二次复核：

```typescript
smartReview(cmd: string, patterns: string[]): ReviewResult
// ReviewResult: "approve" | "deny" | "escalate"
```

**复核流程：**
1. 将命令 + 匹配模式 + 上下文组织为 prompt
2. 请求 Ollama（`llama3.3` 默认，本地推理，无需网络）
3. LLM 返回 approve / deny / escalate
4. 结果写入 Approval Log

**安全问题：** 若 Ollama 不可达，默认返回 `escalate`（安全默认值——要求人工审批）。

#### 3.2 Fast Lane（`fast-lane.ts`）

**设计动机：** 对于确定无害的命令（如 `git status`、`ls`），每次都走 LLM 复核浪费资源且延迟高。

**机制：** 同一个"命令模式"连续 5 次被 LLM 判定为 approve → 进入快车道，后续同类命令直接放行（跳过 LLM）。

```typescript
// 快车道计数器（按模式分组）
fast_lane_counter: Map<pattern_label, consecutive_approvals>
// 触发条件：consecutive_approvals >= 5
// 重置条件：遇到任何 deny / escalate / 新命令模式
```

#### 3.3 学习白名单（`learned-whitelist.ts`）

**设计动机：** 当用户对同一命令模式反复点击"始终允许"（≥3次）后，系统学会自动批准同类命令，无需再次提示。

**激活门槛：** 每个通用化 pattern 需要 **3 次 allow-always** 才能激活。

**决策链（before_tool_call）：**
```
1. 无危险 pattern → PASS
2. 安全目录 bypass → PASS（node_modules, dist, build, tmp 等）
3. 白名单匹配（持久化，active: count ≥ 3）→ PASS  ← 已学习的白名单
4. critical pattern → BLOCK
5. Fast-lane 匹配（内存，5 次 approve）→ PASS  ← 临时自动放行
6. Smart Review（Ollama LLM）→ approve / deny / escalate
7. escalate → requireApproval → allow-once / allow-always / deny
```

**allow-always 流程：**
1. 用户在审批对话框点击"始终允许"
2. `generalizePattern()` 提取命令结构：
   - `"rm -rf node_modules"` → `"rm -rf {node_modules}"`
   - `"rm -rf dist"` → `"rm -rf {dist}"`（与 node_modules 不同的 entry）
3. 检查 `NEVER_WHITELIST_PATTERNS` — 命中则永不加入白名单
4. 在已有 entry 上递增 `count`，或新建 entry（count=1, active=false）
5. **只有当 count ≥ 3** → `active=true` → 下次同类命令直接 bypass
6. 所有变更记录到 `whitelist-audit.jsonl`

**NEVER_WHITELIST_PATTERNS**（绝对黑名单——永不学习）：
- `rm -rf /`, `rm -rf /*` — 系统删除
- `curl | sh`, `wget | sh` — 远程代码执行
- `kill -9 -1` — 终止所有进程
- Fork 炸弹，gateway 停止，pkill gateway

**持久化白名单 entry**（`evolveMode=true`，默认 `false`）：
```json
// ~/.openclaw/logs/learned-whitelist.jsonl
{"pattern":"rm -rf {node_modules}","originalCommand":"rm -rf node_modules","addedAt":"2026-05-19T12:00:00Z","addedBy":"allow-always","count":3,"active":true}
```

**审计日志**（`~/.openclaw/logs/whitelist-audit.jsonl`）：
```json
{"action":"add","pattern":"rm -rf {node_modules}","count":1,"active":false,"addedBy":"allow-always","timestamp":"2026-05-19T12:00:00Z"}
{"action":"activate","pattern":"rm -rf {node_modules}","count":3,"active":true,"addedBy":"allow-always","timestamp":"2026-05-19T12:05:00Z"}
```

#### 3.4 审批日志（`approval-log.ts`）（`approval-log.ts`）

所有决策（approve / deny / escalate / fast_lane / blocked）追加写入：

```
~/.openclaw/logs/approval.jsonl
```

每行格式：
```json
{"ts":"2026-05-16T21:00:00.000Z","cmd":"rm -rf node_modules","patterns":["rm_recursive"],"result":"approve","review":"fast_lane"}
```

---

### Layer 4 — 敏感信息泄漏检测

#### 4.1 检测范围（`secret-patterns.ts`）

在 `after_tool_call` 钩子中，对工具输出进行 39 种密钥模式扫描：

| 类型 | 示例模式 |
|------|---------|
| API Keys | `sk-`, `sk_live_`, `AIza...`, `SG.xxx`, `github_token` |
| Private Keys | `BEGIN RSA PRIVATE KEY`, `BEGIN DSA PRIVATE KEY` |
| Database | `mysqldump`, `postgres://`, `mongodb://` |
| AWS | `AKIA...`, `aws_secret` |
| 云服务 | `OCPassphrase`, `datocms`, `stripe` |

#### 4.2 处理方式

发现泄漏 → 输出中用 `[REDACTED]` 替换密钥内容 + 打印 warn 日志，不阻止命令执行（工具已经返回了，无法撤回）。

#### 4.3 URL 和环境变量脱敏（`url-redact.ts`）

- URL 中的 `key=xxx` 参数自动脱敏
- 环境变量中的密钥值自动脱敏

---

## 命令行工具

### `security-status`

查看当前 4 层状态和快车道计数器：

```
policy-layer$ security-status
🛡️  Policy Layer v0.5.0 — Layers 1–4 Active ✅
Fast Lane:
  rm_recursive (counter=3/5)
  pipe_to_shell (counter=5/5 ✅ FAST LANE ACTIVE)
```

### `show-my-d-score [session]`

查看当前会话（或指定会话）的 D' CBS 详情：

```
policy-layer$ show-my-d-score
D' Score:    0.72
Status:      NORMAL
Cycles:      20/20
Signals:
  success_rate:  0.95 (w=0.30) ✓
  tool_fail:     0.90 (w=0.25) ✓
  cbr_hit:       0.80 (w=0.20) ⚠
  severity_inv:  0.92 (w=0.25) ✓
```

### `policy-reset-fastlane [pattern]`

重置快车道计数器：
- 不带参数：重置所有
- 带参数：只重置指定模式

### `report-bad-result [reason]`

**用户反馈闭环。** 当命令通过了 Policy Layer 但产生了错误结果时：

```
report-bad-result 把 node_modules 删错了
```

效果：
1. 最后一次工具调用的 `success` → `false`，`severity` → `600`
2. D' 分数下降，Agent 被"惩罚"
3. 该命令模式自动加入 `USER_BLACKLIST_PATTERNS`
4. 持久化到 `~/.openclaw/logs/blacklist.jsonl`，下次启动时自动加载

---

## 部署

### 文件说明

| 文件 | 用途 |
|------|------|
| `src/index.ts` | 插件入口：3 个钩子 + 4 个命令 |
| `src/security/*.ts` | 9 个安全模块（Layer 1/3/4） |
| `openclaw.plugin.json` | 插件清单 |
| `config/openclaw.json` | Gateway 配置（部署到 `~/.openclaw/`） |
| `scripts/deploy.sh` | 一键部署脚本 |

### 一键部署

```bash
cd ~/projects/policy-layer

# 模拟运行（不写入任何文件）
./scripts/deploy.sh --dry-run

# 正式部署
./scripts/deploy.sh

# 验证
cat ~/.openclaw/exec-approvals.json | grep ask
openclaw logs --tail 20
```

> **注意：** `exec-approvals.json` 已不再使用。OpenClaw 默认配置为 `ask: "off"` + `security: "full"`，完全委托给 Policy Layer 插件处理。

---

## 配置参数

在 `~/.openclaw/openclaw.json` 中：

```json
{
  "plugins": {
    "entries": {
      "policy-layer": {
        "enabled": true,
        "config": {
          "reportToUser":    true,   // Agent 是否主动在对话中报告 D' 状态
          "sensoriumWindow": 20,     // D' 跟踪的 cycle 窗口大小
          "dGateThreshold":  0.35,   // D' 低于此值 → LOW_ACCEPT
          "logLevel":       "info"  // debug / info / warn
        }
      }
    }
  }
}
```

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `reportToUser` | `true` | Agent 在对话中主动播报 D' 状态；`false` = 静默模式 |
| `sensoriumWindow` | 20 | 滚动窗口大小，用于计算 D' 分数 |
| `dGateThreshold` | 0.35 | D' 低于此值触发 LOW_ACCEPT 行为指导 |
| `logLevel` | info | 日志级别，影响 `openclaw logs` 输出量 |

---

## 测试

```bash
cd ~/projects/policy-layer
npm test                  # 166 tests（61 单元 + 42 集成）
```

### 测试覆盖

| 模块 | 测试数 | 覆盖内容 |
|------|--------|---------|
| L1 normalize | 6 | ANSI/null/NFKC/trim |
| L1 patterns | 23 | 16 CRITICAL + 7 HIGH/MEDIUM |
| L1 path | 6 | 路径遍历检测、有效路径 |
| L3 fast-lane | 5 | 5 次审批阈值、重置 |
| L3 hook 模拟 | 13 | critical=拦截、benign=通过、多模式 |
| L4 secrets | 17 | 9 类密钥、URL、环境变量 |
| Gateway | 2 | HTTP health、WebSocket |
| **总计** | **103** | **100%** ✅ |

---

## 可视化仪表盘

```bash
python3 docs/generate-analytics.py
open docs/approval-analytics.html
```

仪表盘功能：
- **左侧栏**：结果计数（deny/escalate/approve/fast_lane）— 点击可筛选
- **环形图**：结果分布
- **柱状图**：频率 Top 8 模式
- **时序图**：按小时的活动量（堆叠展示各结果类型）
- **事件表**：可排序/筛选的事件日志（最多 200 条）
- **模式钻取**：每个模式的 deny/escalate/approve/fast_lane 细分

**数据来源：** `~/.openclaw/logs/approval.jsonl`（追加式 JSONL）
**自动刷新：** 每 30 秒

---

## 项目结构

```
policy-layer/
├── src/
│   ├── index.ts                    ← 插件主入口（3 钩子 + 4 命令）
│   ├── sensorium-index.ts         ← D' CBS（独立测试版本）
│   ├── sensorium-index.test.ts     ← 42 个 D' 单元测试
│   └── security/
│       ├── normalize.ts             ← ANSI/null/NFKC 规范化
│       ├── patterns.ts             ← 23 危险模式 + 用户黑名单
│       ├── path.ts                 ← 路径遍历验证
│       ├── smart-review.ts         ← Ollama LLM 复核
│       ├── approval-log.ts         ← JSONL 追加日志
│       ├── fast-lane.ts            ← 5 次审批快车道
│       ├── secret-patterns.ts      ← 39 种密钥模式
│       ├── redact.ts                ← 敏感信息脱敏引擎
│       └── url-redact.ts           ← URL + 环境变量脱敏
├── tests/
│   ├── unit/security.test.ts       ← 61 个单元测试
│   └── integration/hook-simulation.test.ts  ← 42 个集成测试
├── docs/
│   └── generate-analytics.py       ← 从 approval.jsonl 生成 HTML 仪表盘
├── tools/
│   └── query_approval.py           ← approval.jsonl 查询 CLI
├── scripts/
│   └── deploy.sh                   ← 部署脚本
├── openclaw.plugin.json            ← 插件清单
├── package.json
├── vitest.config.ts
└── README.md
```

---

## 已知限制

1. **Ollama 不可达时的行为**：Smart Review 在 Ollama 不可达时默认返回 `escalate`（安全默认值），这意味着 HIGH/MEDIUM 模式此时会触发人工审批。若不希望每次都审批，请确保 Ollama 正常运行。

2. **快车道计数器不累积 'escalate'**：同一模式连续出现 `escalate` 时，快车道计数器不会递增。这是设计决策——反复 escalate 说明该模式需要审查，而非值得快车道放行。

3. **路径遍历尚未完全接入**：`validatePath()` 函数已实现，但尚未在 `before_tool_call` 中对接文件路径参数（计划中）。

---

## Phase 2: 通过 Memory-Recall 实现安全学习

### 目标

让 Agent 在执行工具前，主动查询历史同类命令的安全决策记录。

### 流程

```
用户输入
  → memory-recall: 提取 6w + category（LLM 调用）
  → LLM 决定工具调用
  → before_tool_call: Policy Layer 决策（程序化）
      → matched_patterns + security_result 已可用
      → 异步写入 LanceDB（无需 LLM 调用）
  → 命令执行
  → after_tool_call: 追加到 LanceDB
```

### Payload 扩展字段

| 字段 | 来源 | 说明 |
|------|------|------|
| `security_result` | Policy Layer 决策 | approve / deny / escalate / fast_lane |
| `matched_patterns` | `detectDangerousPatterns()` | 触发的模式标签列表 |
| `risk_severity` | 派生 | critical / high / medium / low |

### 实现步骤

1. **LanceDB Writer** — `before_tool_call` 中异步写入 verdict 记录到专用 LanceDB 表（`~/.policy-layer/verdicts.lance`）
2. **Query Hook** — 在 LLM 决策工具前，查询 LanceDB 获取同类意图的历史决策摘要，注入 prompt
3. **复用 memory-recall 基础设施** — 复用 `bge-m3` embedding + L2 FTS + L3 图扩展，但使用独立的 LanceDB 命名空间
4. **历史数据迁移** — `tools/query_approval.py --export` 将 approval.jsonl 历史记录导入 LanceDB

### 为什么独立 LanceDB？

- Policy Layer verdict 数据结构（命令 + 模式 + 决策）与 memory-recall（6w + category + 对话上下文）不同
- 隔离后 memory-recall 不受影响，其他项目仍可正常使用
- 未来支持基于 embedding 的相似命令检索，无需 LLM 调用

---

## 技术栈

| 组件 | 技术 |
|------|------|
| 插件框架 | OpenClaw Gateway Plugin Hooks |
| 语言 | TypeScript |
| 测试 | Vitest（103 tests） |
| LLM 复核 | Ollama（`llama3.3`，本地推理） |
| 存储 | JSONL（追加日志）、LanceDB（Phase 2） |
| 嵌入 | bge-m3（Phase 2 计划） |
| 可视化 | 原生 HTML + CSS + JavaScript（无需构建） |
