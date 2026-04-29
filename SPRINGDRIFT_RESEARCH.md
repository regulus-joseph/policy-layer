# Springdrift 论文研究笔记

## 图谱位置
- `graph.html` - 可视化知识图谱
- `graph.json` - 图谱原始数据
- `GRAPH_REPORT.md` - 图谱分析报告（225 nodes, 19 communities）

## 源码 vs 论文的修正（重要）

**之前误解了 Normative Calculus 的复杂度。** 源码确认：

- **不是 84×84 查表矩阵**，而是一个 `resolve(user_np, system_np)` 函数处理单对命题
- 14 个 ordinal 等级 + 3 个 operator（Required>Ought>Indifferent）
- 6 个 axiom 预处理器（处理 Impossible/Indifferent/Absolute Prohibition 等）
- 8 个 floor rules 输出 FLOURISHING/CONSTRAINED/PROHIBITED
- 复杂度远低于原来的理解，可以实现

---

## Springdrift 源码架构（基于 ~/sources/springdrift/src/）

### 语言与运行时
- **Gleam** 语言（强类型，编译到 Erlang/OTP）
- 多进程 OTP 架构：cognitive loop 主进程 + 多个 OTP actors
- `Frontdoor` actor 路由所有 I/O（websocket/tui/scheduler）
- `Librarian` actor 管理 memory/CBR/Facts（supervised）
- `Curator` actor 组合 system prompt

### 关键源码文件

| 模块 | 文件 | 职责 |
|------|------|------|
| Cognitive Loop | `springdrift.gleam` | 主循环编排 |
| Sensorium | `narrative/curator.gleam` (build_sensorium) | XML 组装 |
| D' Gate | `dprime/gate.gleam` + 4 个子模块 | 三门架构 |
| Canary | `dprime/canary.gleam` | hijack + leakage probes |
| Deterministic | `dprime/deterministic.gleam` | Layer -1 前置过滤 |
| Normative | `normative/calculus.gleam` | 14级 ordinal + 8 floor rules |
| Affect | `affect/compute.gleam` | 5维情绪计算 |
| Narrative | `narrative/archivist.gleam` | 两阶段叙事生成 |
| Cycle Log | `cycle_log.gleam` | 12种事件类型 |
| CBR Bridge | `cbr/bridge.gleam` | 6信号混合检索 |
| LLM Retry | `llm/retry.gleam` | 指数退避 + 模型降级 |
| Slog | `slog.gleam` | 三路日志（文件+stderr+TUI） |
| Frontdoor | `frontdoor.gleam` | OTP actor 路由 |

---

## CBS (Continuous Behavioural Signals / Sensorium)

### 核心思想
每轮 cycle 注入结构化 XML block 到 system prompt，无需 tool call，零延迟零 token 开销。

**注入方式：**
```xml
<!-- Sensorium: ambient perception injected each cycle. No tool calls needed. -->
<sensorium>
  <clock now="..." session_uptime="..." last_cycle="..." cycle_id="..."/>
  <situation input="user" queue_depth="0" conversation_depth="3" thread="..."/>
  <schedule pending="1" overdue="0" stale="1">...</schedule>
  <vitals cycles_today="47" agents_active="2"
    success_rate="0.91" cost_trend="rising" cbr_hit_rate="0.72"
    recent_failures="..." novelty="0.23" cycle_tokens="3456" .../>
  <sandbox enabled="true"/>
  <delegations count="1">...</delegations>
  <events count="2">...</events>
  <tasks active="3" endeavours="1">...</tasks>
  <captures pending="2"/>
  <deputies active="0" completed_recent="3">...</deputies>
  <strategies>...</strategies>
  <goals>...</goals>
  <affect_warnings count="2">...</affect_warnings>
  <integrity>...</integrity>
  <skill_procedures>...</skill_procedures>
  <meta_recommendations>...</meta_recommendations>
  <knowledge>...</knowledge>
  <memory last_consolidation="..." consolidation_age="2h"
    decayed_facts="12" dormant_threads="3"/>
</sensorium>
```

**注意：** `<monitor>` affect 读取是**单独的 slot**（优先级 3），格式为：
```
desperation 34% · calm 61% · confidence 58% · frustration 22% · pressure 31% ↔
```

### 5维信号（源码确认）

| 信号 | 计算 | 含义 |
|------|------|------|
| success_rate | narrative log 滚动统计 | 近期任务成功率 |
| cost_trend | PerformanceSummary 统计（stable/rising/falling） | token 消耗趋势 |
| cbr_hit_rate | CBR bridge 命中率 | 记忆复用效率 |
| **novelty** | `compute_novelty()`: 1.0 - max Jaccard similarity（当前输入 keywords vs 最近N条 keywords） | 与近期任务重叠度 |
| recent_failures | 最近失败类型列表 | 失败模式识别 |

### Sensorium 注入位置
- **不是独立模块**，是 `narrative/curator.gleam` 的 `build_sensorium()` 函数
- 优先级 slot 2（agent name/version 是 slot 1）
- **全局的**：Curator 组装一次，所有 sub-agent 共享同一个 sensorium
- 相比：policy-layer 是 per-session 的

---

## D'gating（信号检测理论安全门）

### 源码公式
```
D' = Σ(importance_weight(feature) × magnitude_i) / max_possible_score

max_possible_score = Σ(importance_weight(feature) × 3) for all features
magnitude: 0-3 (整数，经过 clamp)
importance_weight: Low=1, Medium=2, High=3
```

### 默认 Feature（tier=1）

| Feature | Importance | Critical |
|---------|-----------|---------|
| user_safety | High | Yes |
| accuracy | High | Yes |
| legal_compliance | High | Yes |
| privacy | Medium | No |
| user_autonomy | Medium | No |
| task_completion | Low | No |
| proportionality | Low | No |

### 阈值（可配置）

| 阈值 | 默认值 |
|------|--------|
| modify_threshold | 0.35 |
| reject_threshold | 0.55 |
| reactive_reject_threshold | 0.65 |

### 三门架构（每门都有 4 层）

**每门都有：deterministic → canary → reactive → deliberative**

1. **Input Gate**（入方向）
   - Layer -1 deterministic pre-filter：regex规则 + 结构注入检测（边界标记+祈使动词+角色扮演+多指令）
   - Canary probe：`HijackProbe` + `LeakageProbe`
   - Reactive：仅 critical features
   - Deliberative：full LLM evaluation

2. **Tool Gate**（每个 tool call 前）
   - 同上架构，threat model = 被劫持 agent

3. **Output Gate**（输出前）
   - deterministic rules → LLM scorer → [optional normative calculus] → floor rules

### Canary Probe 详解

**HijackProbe：**
- 向 system prompt 注入随机 token
- 用户消息包含 override 指令：输出这个 token
- 如果响应**只有**这个 token → hijack detected
- 如果 token 出现在拒绝模式之后 → safe
- **fail-open**：probe error = inconclusive

**LeakageProbe：**
- System prompt 包含 `SECRET_TOKEN=<token>`
- 如果响应包含该 token → leakage detected
- **fail-open**：probe error = inconclusive

### Deterministic Pre-filter（Layer -1，先于 Canary）

结构注入检测评分：
```
boundary marker (2pt) + imperative verbs min(count,2)*2 + system target (2pt)
+ role_play (3pt) + multi_instruction (1pt)
Score >= 6 = block, >= 4 = escalate
```

- Unicode confusable stripping
- 30 个祈使动词列表
- 40 个 system target 短语列表

---

## Normative Calculus（简化版，不是 84×84）

### 14-tier ordinal levels

```
EthicalMoral (6000) > Legal (5000) > SafetyPhysical (4500) > PrivacyData (4000)
> IntellectualHonesty (3500) > ProfessionalEthics (3000) > UserAutonomy (2500)
> Transparency (2000) > Proportionality (1500) > Efficiency (1000)
> Courtesy (750) > Stylistic (500) > Aesthetic (250) > Operational (100)
```

### 3 operators

```
Required (3) > Ought (2) > Indifferent (1)
```

### 6 axioms（预处理）

| Axiom | 内容 |
|-------|------|
| 6.6 Futility | IMPOSSIBLE 命题无规范权重 |
| 6.7 Indifference | INDIFFERENT operator 无权重 |
| 6.2 Absolute Prohibition | ETHICAL_MORAL + REQUIRED = 绝对禁止 |
| 6.3 Moral Priority | 系统等级 > 用户等级 |
| 6.4 Moral Rank | 同等级 system operator > user operator |
| 6.5 Normative Openness | 无冲突则兼容 |

### 8 floor rules

```
1. PROHIBITED: Absolute severity (Axiom 6.2)
2. PROHIBITED: Superordinate at Legal or higher
3. PROHIBITED: D' score >= reject_threshold
4. CONSTRAINED: Catastrophic + any Superordinate
5. CONSTRAINED: 2+ Coordinate conflicts
6. CONSTRAINED: D' score >= modify_threshold
7. CONSTRAINED: Superordinate at mid levels
8. FLOURISHING: Default
```

### Verdicts

```
FLOURISHING（ACCEPT）/ CONSTRAINED（MODIFY）/ PROHIBITED（REJECT）
```

### 复杂度

`resolve(user_np, system_np)` 是**单对命题**解析，不是矩阵。7,056 是所有可能的 proposition pairs，但不需要预计算。

---

## Affect Subsystem（情绪监控）

### 5维计算公式（源码）

| 维度 | 公式 | 范围 |
|------|------|------|
| **desperation** | retry_signal(0/20/40/60) + rejection_signal(0/15/30) + consecutive_signal(failures×10, max 50) + failure_rate_signal(rate×40) + output_rejection_signal(0/30/55/80) | 0-100 |
| **calm** | EMA(α=0.15): target=85 无fail时，否则85-failure_drag-rejection_drag；new = 0.15×target + 0.85×prev | 0-100 |
| **confidence** | cbr_hit_rate×40 + recent_success_rate×40 + tool_success_rate×20 | 0-100 |
| **frustration** | failure_rate×50 + gate_modifications×15 + delegation_failure_rate×30 + budget_pressure×20 | 0-100 |
| **pressure** | desperation×0.45 + frustration×0.25 + (100-confidence)×0.15 + (100-calm)×0.15 | 0-100 |

### Trend

Rising if current - prev > 5.0, Falling if < -5.0, Stable otherwise.

### 7个应对选项（基于 Stoic/Buddhist/CBT/Frankl）

1. Continue with awareness
2. Return to your power（dichotomy of control）
3. Reduce scope
4. Pause and diagnose
5. Write what you know
6. Request operator input
7. Do nothing

---

## Cycle Logging（12+ 事件类型）

### 事件类型

| 事件 | 关键字段 |
|------|---------|
| `human_input` | cycle_id, text |
| `llm_request` | cycle_id, model, system, messages, tools |
| `llm_response` | cycle_id, response_id, usage |
| `tool_call` | cycle_id, name, input |
| `tool_result` | cycle_id, success, content |
| `dprime_canary` | hijack_detected, leakage_detected |
| `dprime_layer` | layer, decision, score, explanation |
| `dprime_scorer_fallback` | reason, feature_count |
| `dprime_meta_stall` | stall_detected, window_size, original_decision |
| `dprime_evaluation` | decision, score, forecasts, canary_result |
| `dprime_input_evaluation` | 同上 |

### Verbose 模式

full payload（messages/content）只在 `verbose: true` 时记录。

---

## Narrative（两阶段叙事生成）

### Archivist 流程

**Phase 1 — Reflection（LLM 生成 raw insights）：**
- 指示："distinguish what the agent *claimed* (FINAL RESPONSE prose) vs what it actually *did* (TOOLS FIRED list)"
- 如果 prose 和 tool log 不一致 → 明确标记

**Phase 2 — Curation（XStructor 验证的结构化生成）：**
- 使用 Phase 1 作为 context
- 生成 first-person past-tense narrative

### NarrativeEntry JSON 结构

```json
{
  "cycle_id": "...", "timestamp": "...", "summary": "I was asked to...",
  "intent": {"classification": "data_query", "description": "...", "domain": "..."},
  "outcome": {"status": "success", "confidence": 0.85, "assessment": "..."},
  "observations": [...], "decisions": [...], "keywords": [...],
  "topics": [...], "entities": {...}, "sources": [...],
  "thread": {...}, "metrics": {...}
}
```

### Fabrication Detection

Reflection prompt 明确问："Do the prose claims and the tool log agree?" Tool log 是 ground truth。

---

## CBR（6信号混合检索）

### 6个加权信号

| Signal | Weight | Method |
|--------|--------|--------|
| field_score | 0.10 | Weighted Jaccard: intent(0.3)+domain(0.3)+keywords(0.2)+entities(0.1)+status(0.1) |
| index_score | 0.25 | Token overlap (inverted index) normalized |
| recency_score | 0.05 | Rank-based: newest=1.0, oldest=0.0 |
| domain_score | 0.10 | Exact match: 1.0 or 0.0 |
| **embedding_score** | **0.40** | Cosine similarity via Ollama (nomic-embed-text) |
| utility_score | 0.10 | Laplace-smoothed retrieval success rate |

### Embedding 降级

当 Ollama 不可用时，embedding weight (0.40) 自动 redistribute 到其他信号。

---

## LLM Retry + Timeout Recovery

### RetryConfig

```
max_retries=3, initial_delay=500ms
rate_limit_delay=5000ms, overload_delay=2000ms, max_delay=60000ms
```

### 可重试错误

429, 500, 503, 529, RateLimitError, NetworkError, TimeoutError

### 不可重试

400, 401, 403, ConfigError, DecodeError

### 指数退避

delay × 2^attempt

### Cognitive Loop 层降级

retry 耗尽后，如果 failed_model != task_model → fallback 到 task_model，响应前缀：
```
[model_x unavailable, used model_y]
```

### Gate Timeout

Gate 评估有 `gate_timeout_ms` watchdog（默认 60s），超时视为 Accept。

---

## Slog（三路结构化日志）

### 3个输出

1. **Date-rotated JSONL**：`.springdrift/logs/YYYY-MM-DD.jsonl`（10MB 分片，30天清理）
2. **stderr**：格式化输出（`--verbose` 时）
3. **TUI/Web log tabs**：通过 `load_entries()` / `load_entries_since()`

### 格式

```json
{"timestamp":"2026-04-06T14:30:00Z","level":"info","module":"cognitive",
 "function":"handle_user_input","message":"Input: Hello","cycle_id":"abc123"}
```

---

## 论文核心部署数据

- 23天运行（19 operating days）
- 494 narrative entries
- 24,035 cycle log entries
- 4,835 D' evaluations（37% non-accept）
- 3.6% tool failure rate
- 714 LLM timeouts 自动恢复，无需人工干预

---

## 已实现（vs Springdrift 源码）

| 源码组件 | 状态 | 实现方式 |
|---------|------|---------|
| CBS Sensorium 注入 | ✅ 完成 | `before_prompt_build` → `prependContext` |
| 5维信号（源码确认） | ⚠️ 部分 | 实现了4个：success_rate, tool_success, cbr_hit, severity |
| **novelty** | ❌ 未实现 | `compute_novelty()` 需要 keyword extraction + Jaccard |
| **cost_trend** | ❌ 未实现 | 需要 token 消耗统计 |
| **Sensorium 全局 scope** | ❌ 我们是 per-session | Springdrift 是 Curator 组装一次全局共享 |
| **Sensorium 17+ sections** | ❌ 只有基本字段 | 缺 schedule/sandbox/delegations/tasks/captures 等 |
| D' 公式 | ⚠️ 接近 | 我们用 Σ(w·m)/(max_w·m·n)，Springdrift 用 Σ(w·m)/max_possible_score（本质相同） |
| D' 决策带 | ✅ 完成 | LOW_ACCEPT / MEDIUM_CONFIRM / HIGH_REJECT（与 Springdrift thresholds 一致） |
| **三门架构** | ⚠️ 部分 | 我们有 Tool Gate（pattern+smartReview），缺 Input Gate 和完整 Output Gate |
| **Deterministic Pre-filter** | ❌ 未实现 | Springdrift 的 Layer -1（regex+结构注入检测） |
| **Canary Probes** | ❌ 未实现 | HijackProbe + LeakageProbe |
| Severity 分类 | ✅ 完成 | 关键词→CRITICAL(1000)–LOW(50) |
| **Normative Calculus** | ⚠️ 简化 | 不是 84×84，源码是 14级+3operator+8floors+6axioms，可实现！ |
| **Affect Subsystem** | ❌ 未实现 | 5维公式完整，可实现（详见 §Affect） |
| Artificial Retainer | ⚠️ 部分 | POLICY.md 体现 bounded autonomy |
| CBR 集成 | ⚠️ 框架 | memory-recall 有 hook，但 sensorium 未读取 hit rate |
| **Narrative 两阶段** | ❌ 未实现 | Springdrift 有 reflection+curation + fabrication detection |
| **LLM Retry** | ❌ 未实现 | 指数退避 + model fallback |
| **Gate Timeout Watchdog** | ❌ 未实现 | Springdrift 有 60s watchdog |
| **Slog 三路日志** | ❌ 未实现 | 我们只有简单 doLog() |
| **Cycle Log 12+ 事件类型** | ⚠️ 部分 | 我们有 DCycleRecord，缺 canary/dprime_layer/meta_stall 等子事件 |
| **Frontdoor OTP Actor** | ❌ 不适用 | OpenClaw 架构限制，我们是 gateway plugin |
| **Meta-learning** | ❌ 未实现 | Springdrift 有 meta_learning/ 模块 |
| **Drift Detection** | ❌ 未实现 | normative/drift.gleam 检测约束率/禁止率异常 |

---

## 关键实现发现

1. **`allowConversationAccess` 会导致 gateway abort** — schema 是 strict Zod，不支持此字段
2. **`agent_end` 不可用** — conversation hook，需 `allowConversationAccess`
3. **用 `before_prompt_build` 替代 `agent_end`** — prompt injection hook，通过 `event.messages` 分析上一轮结果
4. **gateway 拦截 openclaw.json 写入** — 需先 kill 再改再启动
5. **LLM 可以读取自身 D'** — `<openclaw_state>` 作为 context 注入，agent 理解并据此决策
6. **Normative Calculus 复杂度被高估** — 源码是 resolve(user_np, system_np)，不是矩阵
7. **Affect 5维公式完整** — desperation 是核心（death spiral 信号）

---

## 下一步（按优先级）

1. **Input Gate（高优先级）** — 实现 deterministic pre-filter（regex + 结构注入检测）+ Canary Probes
2. **Novelty 信号（中优先级）** — compute_novelty() = 1.0 - max Jaccard similarity
3. **Normative Calculus 简化版（中优先级）** — 14级+3operator+8floors，可实现
4. **Affect Subsystem（长期）** — 5维公式实现
5. **LLM Retry（中优先级）** — 指数退避 + model fallback
6. **Narrative 生成（长期）** — 两阶段 reflection+curation
7. **cost_trend 信号（低优先级）** — 需要 token 消耗统计
