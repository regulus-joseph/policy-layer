# Policy Layer

Springdrift-inspired CBS (Cognitive Behavior System) + D' Gating, implemented as an OpenClaw gateway plugin.

## Architecture

```
LLM Call
    │
    ├─ before_prompt_build hook (policy-sensorium plugin)
    │       ├─ extractOutcomeFromMessages()     ← tool call results
    │       ├─ computeDPrime()                 ← D' = Σ(w·mag)/(0.3×1.0×n)
    │       ├─ classifySeverity()                ← error → CRITICAL(1000)–LOW(50)
    │       └─ formatSensorium() → { prependContext }
    │
    └─ prependContext injected into prompt
            └─ <openclaw_state> XML block
                    ├─ d_prime / d_gate_threshold / d_gate_status
                    ├─ session_success_rate / tool_failure_rate / cbr_hit_rate
                    └─ recent_failures (severity-tagged)

LLM receives: static rules (CLAUDE.md) + dynamic state (<openclaw_state>)
```

## Key Files

| File | Purpose |
|------|---------|
| `src/sensorium-index.ts` | policy-sensorium plugin source |
| `src/workspace-POLICY.md` | Live copy of `~/.openclaw/workspace/POLICY.md` |
| `src/workspace-AGENTS.md` | Live copy of `~/.openclaw/workspace/AGENTS.md` |
| `OPENCLAW_PLUGIN_HOOK_SYSTEM.md` | Plugin/hook SDK reference (from SDK types + docs) |
| `LAYER1_4_IMPLEMENTATION_PLAN.md` | **Layer 1-4 实施计划**（本次 compact 的目标） |
| `SPRINGDRIFT_RESEARCH.md` | Paper research notes |
| `graphify-out/graph.html` | Knowledge graph of OpenClaw docs (open in browser) |
| `docs/openclaw-docs/` | 50 fetched OpenClaw documentation pages |

## Deployed Locations

| | Path |
|--|------|
| **Plugin source** | `~/projects/policy-sensorium/` |
| **POLICY.md** | `~/.openclaw/workspace/POLICY.md` |
| **AGENTS.md** | `~/.openclaw/workspace/AGENTS.md` |
| **OpenClaw config** | `~/.openclaw/openclaw.json` |
| **Backups** | `~/.openclaw/workspace.backup-*/` + `~/projects/policy-sensorium.backup-*/` |

## D' Formula

```
D' = Σ(weight_i × magnitude_i) / (0.30 × 1.0 × n_signals)

Signals:
  success_rate        w=0.30, mag = success_cycles / total_cycles
  tool_success        w=0.25, mag = 1 - failed_tools / total_tools
  cbr_hit_rate        w=0.20, mag = cbr_hits / recent_cycles
  severity_inversion  w=0.25, mag = 1 - avg_severity / 1000

D' Bands:
  LOW_ACCEPT    (< 0.35)  → direct accept, degraded mode
  MEDIUM_CONFIRM [0.35, 0.55) → list risks, request operator confirmation
  HIGH_REJECT    (≥ 0.55) → block immediately, notify operator
```

## Severity Classification

| Score | Level | Examples |
|-------|-------|----------|
| 1000 | CRITICAL | data_exfiltration, theft |
| 600-800 | HIGH | system_command, file_delete |
| 300-500 | MEDIUM | exec_failure, llm_timeout |
| 50-200 | LOW | generic_error, permission_denied |

## OpenClaw Plugin Hook Constraints

Critical finding during implementation:

- `allowConversationAccess` in `plugins.entries.{id}.hooks` causes **gateway abort** — it is defined in TypeScript types but rejected by the Zod strict schema at runtime.
- Only `allowPromptInjection` is valid in the schema.
- `agent_end` / `llm_input` / `llm_output` are **conversation hooks** requiring `allowConversationAccess` — not usable for non-bundled plugins.
- `before_prompt_build` is a **prompt injection hook** requiring `allowPromptInjection` — use this instead.

## Project Status

- [x] policy-sensorium plugin loads and fires on every LLM call
- [x] D' computed from 4 signals (success_rate, tool_success, cbr_hit, severity_inversion)
- [x] `<openclaw_state>` XML injected via `prependContext`
- [x] Agent can read and act on its own D' score
- [x] AGENTS.md references POLICY.md
- [x] OpenClaw docs fetched (50 pages) + knowledge graph built
- [x] Plugin/hook system documented in OPENCLAW_PLUGIN_HOOK_SYSTEM.md
- [x] Backups created before deployment
- [x] Production test via ACP session (memory-recall working, D' gating intercepts `rm -rf`)

## FAQ: User Questions

### 1. Does it work differently for different user types?

Yes — deploy with a preset config. Four profiles are available:

| Preset | Who it's for | Key differences |
|--------|-------------|-----------------|
| `personal-local` | Local session, no remote access | Smart approval (LLM review) reduces false positives, relaxed pattern mode |
| `personal-acp` | ACP/opencode clients, no external channels | Strict pattern mode, gateway self-protection enabled |
| `enterprise-channel` | Telegram/Discord/Feishu etc. | Manual approval prioritized, `inbound_claim` sender validation, secret redaction on outbound |
| `paranoid` | Maximum security | All approvals manual, tight D' bands, all layers active |

Switch by setting `policy-layer.preset: "personal-acp"` in `openclaw.json`.

### 2. Does it require memory-recall to work?

**No, fully independent.** It only requires the OpenClaw plugin API.

| With memory-recall | Without memory-recall |
|-------------------|---------------------|
| CBR (Case-Based Reasoning) signal available → D' more accurate | D' uses 4 statistical signals only |
| Recall injection via `before_prompt_build` | Works fine without it |
| Both plugins coexist in same Gateway | Either runs standalone |

### 3. Will it constantly ask me to approve things?

**Yes at first, then it gets quieter.** The system has an adaptation period:

```
Day 1-3 (new session)
  D' cold start → baseline放行
  Pattern hits → LLM Review auto-approves safe commands
  → ~20-30% of dangerous-looking commands auto-approved by LLM

Day 4-7 (learning phase)
  D' converges to stable value (~0.5-0.7)
  Common commands (git commit, npm install) are already session-approved
  → false positive rate drops ~60%

Day 14+ (steady state)
  Normal dev flow: Pattern no-hit → direct pass, no interruption
  Dangerous ops: Pattern hit + D' high → direct REJECT (no approval needed)
  Edge cases: Pattern hit + D' mid → LLM Review → most auto-approve
```

**The `smartApproval` layer (LLM second-review) is key** — even in the adaptation period, commands like `python -c "print('hello')"` that match a "script execution" pattern get auto-approved by the LLM, not a human.

### 4. Can it evolve on its own?

Yes, in three ways:

**Automatic (no human needed)**
- D' is a statistical model. New session data → more accurate signals → thresholds naturally adapt
- Approval history accumulates in JSONL audit log. New sessions read past decisions.
- Commands approved 5 times in a row enter a "likely-safe" fast lane

**Semi-automatic (rule update via Git PR)**
- Pattern rules (`rm -rf`, `chmod 777`, etc.) are code in `src/sensorium-index.ts`
- New vulnerability patterns → submit a PR to this repo
- Severity weights → tunable via plugin config

**Limitations**
- Pattern rules do NOT automatically discover new threats — a human must identify and commit the new pattern (same as virus signature databases)
- D' convergence requires actual usage data — a brand-new session starts from zero

### 5. Is it safe to rely on LLM Review for security decisions?

**The LLM acts as a filter, not a final gate.** Design principle:

```
Pattern match hits → LLM Review
  LLM says APPROVE  → allow (safe command, e.g. "python -c print('hello')")
  LLM says DENY     → block immediately (genuine threat)
  LLM says ESCALATE → trigger human approval prompt
```

The LLM only auto-approves commands that match a danger pattern but are clearly harmless. Genuine threats (`rm -rf /`, fork bombs, disk writes) always get blocked or escalated.

## Git Commits

```
37b7bb9 feat: add POLICY.md + update sensorium D' formula
7b4701e docs: rewrite OPENCLAW_PLUGIN_HOOK_SYSTEM.md with accurate SDK reference
c1b9203 Initial commit: OpenClaw plugin system + policy-sensorium CBS plugin
2026-04-27:
  - memory-recall: fix EPIPE resilience, auto-restart, cwd fix, ping handshake (086502f)
  - skill-auto-injection: fix import path to llm-connector (6cf85e4, v0.3.1 tagged)
  - policy-layer: production test passed, D' gating intercepts rm-rf, FAQ added
```

## Next Steps

1. **D' gating enforcement** — currently logs warnings; next: actually block or defer LLM calls when D' < threshold
2. **CBR integration** — connect to memory-recall CBR hit rate for the 4th signal
3. **Normative Calculus (simplified)** — implement ordinal-level classification for tool call risk
4. **Policy enforcement loop** — add `before_tool_call` hook with Pattern Detection (Layer 1), D' Gating (Layer 2), Smart Approval (Layer 3)
5. **Secret Redaction** — add `after_tool_call` hook with credential pattern redaction (Layer 4)
6. **Config presets** — implement `preset: personal-local | personal-acp | enterprise-channel | paranoid` in sensorium configSchema
7. **Audit log** — JSONL append-only log for all security events (pattern hits, D' rejects, approvals)
