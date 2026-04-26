# Springdrift 论文研究笔记

## 图谱位置
- `graph.html` - 可视化知识图谱
- `graph.json` - 图谱原始数据
- `GRAPH_REPORT.md` - 图谱分析报告（225 nodes, 19 communities）

## CBS (Continuous Behavioural Signals / Sensorium)

### 核心思想
每轮 cycle 注入结构化 XML block 到 system prompt，无需 tool call，零延迟零 token 开销。

### 5维信号
| 信号 | 计算 | 含义 |
|------|------|------|
| success_rate | narrative log 滚动统计 | 近期任务成功率 |
| cost_trend | token 消耗趋势 | stable/rising/falling |
| cbr_hit_rate | 检索到的 case 命中率 | 记忆复用效率 |
| novelty | keyword Jaccard similarity（System M） | 与近期任务重叠度 |
| recent_failures | 最近失败类型列表 | 失败模式识别 |

### 注入方式
```xml
<sensorium>
  <clock now="2026-03-29T14:30:00" session_uptime="2h15m" cycle_id="a7f3b2c1"/>
  <vitals cycles_today="8" agents_active="5" success_rate="0.75" cost_trend="stable" cbr_hit_rate="0.60" novelty="0.42" recent_failures="web_search␣timeout"/>
</sensorium>
```
优先级最高，永远不被 shed。

## D'gating（信号检测理论安全门）

### 公式
```
D' = Σ(importance_i × magnitude_i) / (max_importance × max_magnitude × n)
```

### 三个评估点
1. **Input Gate** - 入方向过滤，检测 prompt injection，canary probe + regex fast path
2. **Tool Gate** - 每个 tool call 前评估，threat model = 被劫持 agent 响应注入内容（full LLM scorer）
3. **Output Gate** - 输出前评估，interactive 模式用 deterministic rules，autonomous 模式用 full LLM scorer + normative calculus

### 决策流
- D' < 0.35 → ACCEPT（快速通道）
- D' ≥ 0.35 → 送 Normative Calculus
- D' ≥ 0.55 → 直接 REJECT 或送 Normative Calculus

### Normative Calculus
- **来源**：Becker 的 A New Stoicism (1998)
- **14-tier ordinal levels**：Ethical/Moral(6000) → Legal(5000) → Prudential(4500) → Safety(3500) → ... → Operational(100) → Aesthetic(500)
- **3个 operators**：Required > Ought > Indifferent
- **2个 modality**：Possible / Impossible
- **6 axioms**：
  - 6.6 Futility（Impossible 命题无规范权重）
  - 6.7 Indifference（Indifferent 命题无规范权重）
  - 6.2 Absolute Prohibition（Ethical/Moral + Required = 绝对禁止）
  - 6.3 Moral Priority（高等级优先）
  - 6.4 Moral Rank（同等级按 operator 强度）
  - 6.5 Normative Openness（无冲突则兼容）
- **8 floor rules**：
  - Floor 1: Any Absolute → PROHIBITED
  - Floor 2: Superordinate at Legal+ → PROHIBITED
  - Floor 3: D' ≥ reject → PROHIBITED
  - Floor 4: Catastrophic + Superordinate → CONSTRAINED
  - Floor 5: 2+ Coordinate → CONSTRAINED
  - Floor 6: D' ≥ modify → CONSTRAINED
  - Floor 7: Superordinate at Professional–Safety → CONSTRAINED
  - Floor 8: default → FLOURISHING
- **Verdicts**：FLOURISHING（ACCEPT）/ CONSTRAINED（MODIFY）/ PROHIBITED（REJECT）
- **评估结果**：84 propositions × 84 pairs = 7,056 resolutions，100% coverage, zero determinism violations, zero monotonicity violations

### 关键教训
- 阈值校准错误（output gate 太激进）会导致 rejection cascade，比没有 authority 更糟糕
- interactive vs autonomous 分流很重要：operator 输入时不走结构化注入规则（operator 可能合法讨论安全机制）

## Artificial Retainer

6个结构属性：
1. **Persistent identity and memory** - 跨 session 连续记忆
2. **Defined scope of authority** - 明确授权边界
3. **Domain-specific refusal** - 有限领域内的拒绝权（bounded, reasoned, overridable）
4. **Proactive engagement** - 不等待指令，主动提醒
5. **Forensic accountability** - 每个决策可审计
6. **Relationship continuity** - 随时间积累上下文变得更有效

核心类比：**guide dog**。不是 assistant，不是 autonomous agent，是 bounded autonomy 的 retainer。

## Affect Subsystem（情绪监控）

5个维度：
- **Desperation** (0-100)：受 output gate rejections 影响最大（death spiral 条件检测）
- **Calm** (0-100)：EMA α=0.15，高惯性，缓慢下降缓慢恢复
- **Confidence** (0-100)：CBR hit rate × 40% + success rate × 40% + tool success × 20%
- **Frustration** (0-100)：工具失败 × 50%，delegation 失败 × 30%
- **Pressure** (0-100)：desperation 45% + frustration 25% + inverted confidence 15% + inverted calm 15%

7个应对选项（均基于 Stoic/Buddhist/CBT/Frankl 哲学传统）：
1. Continue with awareness
2. Return to your power（dichotomy of control）
3. Reduce scope
4. Pause and diagnose
5. Write what you know
6. Request operator input
7. Do nothing

**Blind spot**：当 agent 表现干净（无 tool failures，无 gate modifications）时，读数为空，但压力可能恰恰最大。

## 对 OpenClaw policy layer 的改进方向

### Level 1 — CBS 信号注入（最简单，最有价值）
在每次 LLM 调用前，往 system prompt 注入 `<openclaw_state>` block：
```xml
<openclaw_state>
  <session_success_rate>0.78</session_success_rate>
  <recent_failures>web_timeout, tool_permission_denied</recent_failures>
  <tool_success_rate>0.93</tool_success_rate>
  <autonomous_mode>true</autonomous_mode>
  <queue_depth>3</queue_depth>
</openclaw_state>
```
作用：让 agent 感知自身行为健康度，在失败率高时自动更谨慎

### Level 2 — D' scoring on tool calls
给每个 tool call 打分：高危险操作（文件写入、系统命令）→ 高 importance；可疑 pattern → 高 magnitude

### Level 3 — Normative Calculus character specification
类似 character.json，定义 operator 级别的规范承诺。改动较大。

## Springdrift 核心部署数据
- 23天运行（19 operating days）
- 494 narrative entries
- 24,035 cycle log entries
- 4,835 D' evaluations（37% non-accept）
- 3.6% tool failure rate
- 714 LLM timeouts 自动恢复，无需人工干预

## 已实现（vs 论文原版）

| 论文组件 | 状态 | 实现方式 |
|---------|------|---------|
| CBS Sensorium 注入 | ✅ 完成 | `before_prompt_build` → `prependContext` |
| 5维信号（论文） | ⚠️ 部分 | 实现了4个：success_rate, tool_success, cbr_hit, severity |
| Novelty 信号 | ❌ 未实现 | 需要 System M / keyword Jaccard，未接入 |
| D' 公式 | ✅ 完成 | Σ(w·mag)/(0.3×1.0×n)，阈值 0.35/0.55 |
| D' 决策带 | ✅ 完成 | LOW_ACCEPT / MEDIUM_CONFIRM / HIGH_REJECT |
| Severity 分类 | ✅ 完成 | 错误原因→CRITICAL(1000)–LOW(50) |
| Normative Calculus | ❌ 未实现 | 7,056 查表成本高；用简化 ordinal 替代 |
| Affect Subsystem | ❌ 未实现 | 暂不需要 |
| Artificial Retainer | ⚠️ 部分 | POLICY.md 体现了 bounded autonomy 原则 |
| CBR 集成 | ⚠️ 框架 | memory-recall 有 hook，但 sensorium 未读取 hit rate |

## 关键实现发现

1. **`allowConversationAccess` 会导致 gateway abort** — schema 是 strict Zod，不支持此字段
2. **`agent_end` 不可用** — conversation hook，需 `allowConversationAccess`
3. **用 `before_prompt_build` 替代 `agent_end`** — prompt injection hook，通过 `event.messages` 分析上一轮结果
4. **gateway 拦截 openclaw.json 写入** — 需先 kill 再改再启动
5. **LLM 可以读取自身 D'** — `<openclaw_state>` 作为 context 注入，agent 理解并据此决策

## 下一步
1. D' gating 强制执行 — 当前只 warn，下一步在 `before_tool_call` 实施 blocking
2. CBR hit rate 集成 — memory-recall 的 CBR 结果接入 sensorium 第4信号
3. Normative Calculus 简化版 — 用关键词+ordinal 分级替代 7,056 查表
4. Policy-sensorium 命令 — 验证 TUI 中 `policy-sensorium` 命令注册正常
5. 长期： Affect Subsystem — 监控 desperation/confidence/pressure 指标
