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

## Git Commits

```
37b7bb9 feat: add POLICY.md + update sensorium D' formula
7b4701e docs: rewrite OPENCLAW_PLUGIN_HOOK_SYSTEM.md with accurate SDK reference
c1b9203 Initial commit: OpenClaw plugin system + policy-sensorium CBS plugin
```

## Next Steps

1. **D' gating enforcement** — currently logs warnings; next: actually block or defer LLM calls when D' < threshold
2. **CBR integration** — connect to memory-recall CBR hit rate for the 4th signal
3. **Normative Calculus (simplified)** — implement ordinal-level classification for tool call risk
4. **Policy-sensorium command** — verify command registration and `policy-sensorium` status command works in TUI
5. **Policy enforcement loop** — add `before_tool_call` hook to enforce risk classification schema
