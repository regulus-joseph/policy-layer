# Policy Layer — v0.4.0

**OpenClaw Gateway Plugin:** 4-layer security enforcement framework + D' Cognitive Behavior Scoring (CBS).

---

## What Is Policy Layer?

Policy Layer is a security and behavioral governance plugin running at the OpenClaw Gateway layer, performing multi-dimensional checks at three stages — before, during, and after every Agent command execution:

```
User Input → LLM decides to execute a tool → before_tool_call (security check)
                                                      ↓
Tool Executes → after_tool_call (secret leak detection)
                                                      ↓
Next LLM Decision → before_prompt_build (inject cognitive state score)
```

**Core problems it solves:**

| Goal | How |
|------|-----|
| **Security** | Block dangerous commands (e.g. `rm -rf /`, `curl\|sh`) before execution |
| **Self-awareness** | Let the Agent "know its own state" — slow down when D' score is low |
| **Learning** | Record all security decisions; user can flag wrong decisions (`report-bad-result`) |
| **Transparency** | Every decision is written to JSONL for audit and visualization |

---

## Feature Overview

| Feature | Description |
|---------|-------------|
| 🛡️ Dangerous Command Blocking | Layer 1 pattern matching — 16 CRITICAL patterns blocked immediately, no LLM review |
| 🤖 LLM Smart Review | HIGH/MEDIUM commands go through Ollama local model for second review (approve/deny/escalate) |
| 🚀 Fast Lane | Same harmless command approved 5 times consecutively → skip LLM review, fast-track |
| 📊 Cognitive State Scoring | D' CBS algorithm — 4 dimensions (success rate / tool fail / context hit / severity) scored in real time |
| 🔒 Secret Leak Detection | `after_tool_call` scans tool output for 39 secret patterns; leaks trigger warning |
| 📝 Decision Audit Log | All decisions appended to `~/.openclaw/logs/approval.jsonl` (JSONL, append-only) |
| 🗳️ User Feedback Loop | `report-bad-result` — user flags wrong decisions → score drops + added to blacklist |
| 📈 Analytics Dashboard | Generate HTML dashboard from approval.jsonl, with pattern filtering and timeline analysis |

---

## Quick Start

```bash
# Verify plugin is loaded (restart to reload)
openclaw gateway restart

# Run tests
cd ~/projects/policy-layer
npm test                  # 103 tests

# Regenerate analytics dashboard
python3 docs/generate-analytics.py
open docs/approval-analytics.html
```

---

## Architecture in Depth

### End-to-End Flow

```
Tool Call Input
     │
     ├─ Layer 1: normalizeCommand()
     │      ├─ stripAnsi()         // Remove ANSI escape codes
     │      ├─ stripNullBytes()    // Remove \x00 (common evasion technique)
     │      └─ nfkcNormalize()     // NFKC normalization (unify Unicode homoglyphs)
     │      ↓
     ├─ Layer 1: detectDangerousPatterns()
     │      ├─ CRITICAL (16): Block immediately, no LLM review
     │      └─ HIGH/MEDIUM (7): Proceed to Smart Review
     │      ↓
     ├─ Layer 2: D' CBS (injected via before_prompt_build)
     │      └─ Injects <openclaw_state> XML into LLM context
     │         Agent reads it and adjusts behavior according to D' score
     │      ↓
     ├─ Layer 3: Smart Review (HIGH/MEDIUM only)
     │      ├─ Ollama local inference (approve / deny / escalate)
     │      ├─ Fast Lane: 5 consecutive approves → skip LLM review
     │      └─ Approval Log: all decisions appended to approval.jsonl
     │      ↓
     └─ Layer 4: Secret Leak Detection (after_tool_call)
            └─ Scan tool output for 39 secret patterns; leak → warn + redact
```

---

## Layer-by-Layer Details

### Layer 1 — Command Normalization & Danger Detection

#### 1.1 Command Normalization (`normalize.ts`)

Before pattern matching, commands go through three preprocessing steps:

```typescript
normalizeCommand(cmd: string): string
  ├─ stripAnsi(str)         // Remove ANSI escapes (e.g. \x1b[31m)
  ├─ stripNullBytes(str)     // Remove \x00 bytes
  └─ nfkcNormalize(str)      // NFKC normalize (unify Unicode homoglyphs)
```

**Why NFKC normalization?**  
Some Unicode characters are visually identical to ASCII (e.g. Greek `ο` vs Latin `o`). Attackers can use homoglyphs to craft commands that bypass pattern detection. NFKC normalization converts them all to the standard form.

#### 1.2 Danger Pattern Detection (`patterns.ts`)

Detects 23 dangerous patterns, split into two response tiers:

**CRITICAL — Immediate Block (no LLM review)**

| Pattern | Example Match | Note |
|---------|--------------|------|
| `rm_recursive_root` | `rm -rf /`, `rm -rf /*` | Recursive delete from root |
| `pipe_to_shell` | `curl ... \| sh`, `wget ... \| bash` | Remote code execution |
| `kill_all` | `kill -9 -1`, `killall gateway` | Kill all processes |
| `fork_bomb` | `:(){ :\|:& };:` | Fork bomb |
| `chmod_777_root` | `chmod 777 /` | Permission downgrading |
| `gateway_stop` | `pkill gateway`, `openclaw gateway stop` | Shutdown self |
| `script_execution` | `chmod +x *.sh \| bash\|sh\|python` | Run unauthorized scripts |
| `/dev/tcp` | `cat /dev/tcp/...` | Firewall bypass via /dev/tcp |

**HIGH / MEDIUM — LLM Smart Review**

| Pattern | Example Match |
|---------|--------------|
| `git_reset_hard` | `git reset --hard` |
| `dev_tcp` | `/dev/tcp/host/port` |
| `sql_drop` | `DROP TABLE`, `DROP DATABASE` |
| `kill_term_negative` | `kill -TERM -1` |

#### 1.3 Path Traversal Detection (`path.ts`)

Detects path traversal attacks: `../` escaping home directory, `/proc`/`/sys` sensitive path access.

---

### Layer 2 — D' Cognitive Behavior Scoring System (CBS)

#### 2.1 What Is D'?

D' (d-prime) is the core metric from Signal Detection Theory. Policy Layer adapts it for AI Agent behavioral evaluation — treating the Agent's historical behavior as the "signal" and comparing it against a baseline, yielding a quantifiable risk/anomaly score.

#### 2.2 Four Signal Dimensions

After each tool call, the system records 4 signals:

| Signal | Weight | Meaning | Max-normalized |
|--------|--------|---------|----------------|
| `success_rate` | 0.30 | Tool call success rate | success_rate / 1.0 |
| `tool_fail` | 0.25 | Tool failure rate (lower is better) | 1 - failure_rate / 1.0 |
| `cbr_hit` | 0.20 | Context Buffer Recall hit rate | cbr_hit / 1.0 |
| `severity_inv` | 0.25 | Severity (lower is better) | 1 - severity / 1000 |

#### 2.3 D' Score Calculation

```
D' = Σ(w_i × m_i) / (0.30 × 1.0 × n)
```

Where `m_i` is each signal max-normalized, `n` is the cycle window count.

#### 2.4 Score Injection

In the `before_prompt_build` hook, inject `<openclaw_state>` XML into the LLM context:

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

#### 2.5 Score Thresholds & Behavioral Guidance

| D' Range | Status | Agent Behavior |
|-----------|--------|----------------|
| > 0.65 | `NORMAL` | Normal execution, no special guidance |
| 0.35–0.65 | `LOW_ACCEPT` | Moderate caution, reduce aggressive operations |
| < 0.35 | `HIGH_REJECT` | Significant slowdown, perform only essential operations |
| < 0.20 | `CRITICAL` | Pause all non-essential operations, await user confirmation |

---

### Layer 3 — Smart Review System

#### 3.1 Smart Review (`smart-review.ts`)

For HIGH/MEDIUM commands, run a second review via Ollama local LLM:

```typescript
smartReview(cmd: string, patterns: string[]): ReviewResult
// ReviewResult: "approve" | "deny" | "escalate"
```

**Review flow:**
1. Organize command + matched patterns + context into a prompt
2. Request Ollama (`llama3.3` by default — local inference, no network required)
3. LLM returns approve / deny / escalate
4. Result written to Approval Log

**Safety:** If Ollama is unreachable, defaults to `escalate` (safe default — requires human approval).

#### 3.2 Fast Lane (`fast-lane.ts`)

**Motivation:** For definitely harmless commands (e.g. `git status`, `ls`), running LLM review every time is wasteful and adds latency.

**Mechanism:** The same command pattern approved by LLM 5 times in a row → enter Fast Lane, subsequent same-pattern commands bypass LLM review entirely.

```typescript
// Fast lane counter (grouped by pattern)
fast_lane_counter: Map<pattern_label, consecutive_approvals>
// Trigger: consecutive_approvals >= 5
// Reset: any deny / escalate / new command pattern
```

#### 3.3 Approval Log (`approval-log.ts`)

All decisions (approve / deny / escalate / fast_lane / blocked) are appended to:

```
~/.openclaw/logs/approval.jsonl
```

Each line format:
```json
{"ts":"2026-05-16T21:00:00.000Z","cmd":"rm -rf node_modules","patterns":["rm_recursive"],"result":"approve","review":"fast_lane"}
```

---

### Layer 4 — Secret Leak Detection

#### 4.1 Detection Scope (`secret-patterns.ts`)

In the `after_tool_call` hook, scan tool output for 39 secret patterns:

| Category | Example Patterns |
|---------|-----------------|
| API Keys | `sk-`, `sk_live_`, `AIza...`, `SG.xxx`, `github_token` |
| Private Keys | `BEGIN RSA PRIVATE KEY`, `BEGIN DSA PRIVATE KEY` |
| Database | `mysqldump`, `postgres://`, `mongodb://` |
| AWS | `AKIA...`, `aws_secret` |
| Cloud Services | `OCPassphrase`, `datocms`, `stripe` |

#### 4.2 Handling

Leak detected → replace key content with `[REDACTED]` in output + print warning log. Command is **not** blocked (tool already returned, cannot undo).

#### 4.3 URL & Env Var Redaction (`url-redact.ts`)

- `key=xxx` parameters in URLs are auto-redacted
- Secret values in environment variables are auto-redacted

---

## CLI Commands

### `security-status`

View current 4-layer status and Fast Lane counters:

```
policy-layer$ security-status
🛡️  Policy Layer v0.4.0 — Layers 1–4 Active ✅
Fast Lane:
  rm_recursive (counter=3/5)
  pipe_to_shell (counter=5/5 ✅ FAST LANE ACTIVE)
```

### `show-my-d-score [session]`

View D' CBS details for current (or specified) session:

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

Reset Fast Lane counters:
- No args: reset all
- With pattern: reset only that pattern

### `report-bad-result [reason]`

**User feedback loop.** When a command passed Policy Layer but produced a bad result:

```
report-bad-result accidentally deleted node_modules
```

Effects:
1. Last tool call's `success` → `false`, `severity` → `600`
2. D' score drops (Agent is "penalized")
3. Command pattern auto-added to `USER_BLACKLIST_PATTERNS`
4. Persisted to `~/.openclaw/logs/blacklist.jsonl`, auto-loaded on next startup

---

## Deployment

### File Reference

| File | Purpose |
|------|---------|
| `src/index.ts` | Plugin entry: 3 hooks + 4 commands |
| `src/security/*.ts` | 9 security modules (Layer 1/3/4) |
| `openclaw.plugin.json` | Plugin manifest |
| `config/openclaw.json` | Gateway config (deploys to `~/.openclaw/`) |
| `scripts/deploy.sh` | One-click deployment script |

### One-Click Deploy

```bash
cd ~/projects/policy-layer

# Dry run (no writes)
./scripts/deploy.sh --dry-run

# Actual deploy
./scripts/deploy.sh

# Verify
cat ~/.openclaw/exec-approvals.json | grep ask
openclaw logs --tail 20
```

> **Note:** `exec-approvals.json` is no longer used. OpenClaw defaults to `ask: "off"` + `security: "full"`, fully delegating to the Policy Layer plugin.

---

## Configuration

In `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "policy-layer": {
        "enabled": true,
        "config": {
          "reportToUser":    true,   // Agent proactively reports D' state in conversation
          "sensoriumWindow": 20,     // Cycle window size for D' tracking
          "dGateThreshold":  0.35,   // D' below this → LOW_ACCEPT
          "logLevel":       "info"  // debug / info / warn
        }
      }
    }
  }
}
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `reportToUser` | `true` | Agent actively reports D' status in conversation; `false` = silent |
| `sensoriumWindow` | 20 | Rolling window size for D' calculation |
| `dGateThreshold` | 0.35 | D' below this triggers LOW_ACCEPT guidance |
| `logLevel` | info | Log verbosity level |

---

## Testing

```bash
cd ~/projects/policy-layer
npm test                  # 103 tests (61 unit + 42 integration)
```

### Test Coverage

| Module | Tests | Coverage |
|--------|-------|----------|
| L1 normalize | 6 | ANSI/null/NFKC/trim |
| L1 patterns | 23 | 16 CRITICAL + 7 HIGH/MEDIUM |
| L1 path | 6 | Traversal detection, valid paths |
| L3 fast-lane | 5 | 5-approval threshold, reset |
| L3 hook simulation | 13 | critical=block, benign=pass, multi-pattern |
| L4 secrets | 17 | 9 secret types, URL, env vars |
| Gateway | 2 | HTTP health, WebSocket |
| **Total** | **103** | **100%** ✅ |

---

## Analytics Dashboard

```bash
python3 docs/generate-analytics.py
open docs/approval-analytics.html
```

Dashboard features:
- **Left sidebar**: Result counts (deny/escalate/approve/fast_lane) — click to filter
- **Donut chart**: Result distribution
- **Bar chart**: Top 8 patterns by frequency
- **Timeline**: Hourly activity stacked by result type
- **Event table**: Sortable, filterable event log (max 200 records)
- **Pattern drilldown**: Each pattern's deny/escalate/approve/fast_lane breakdown

**Data source:** `~/.openclaw/logs/approval.jsonl` (append-only JSONL)
**Auto-refresh:** Every 30 seconds

---

## Project Structure

```
policy-layer/
├── src/
│   ├── index.ts                    ← Plugin entry (3 hooks + 4 commands)
│   ├── sensorium-index.ts         ← D' CBS (standalone test version)
│   ├── sensorium-index.test.ts     ← 42 D' unit tests
│   └── security/
│       ├── normalize.ts             ← ANSI/null/NFKC normalization
│       ├── patterns.ts             ← 23 danger patterns + user blacklist
│       ├── path.ts                 ← Path traversal validation
│       ├── smart-review.ts         ← Ollama LLM review
│       ├── approval-log.ts         ← JSONL append log
│       ├── fast-lane.ts            ← 5-approval fast lane
│       ├── secret-patterns.ts      ← 39 secret patterns
│       ├── redact.ts               ← Secret redaction engine
│       └── url-redact.ts           ← URL + env var redaction
├── tests/
│   ├── unit/security.test.ts       ← 61 unit tests
│   └── integration/hook-simulation.test.ts  ← 42 integration tests
├── docs/
│   └── generate-analytics.py       ← HTML dashboard generator
├── tools/
│   └── query_approval.py           ← approval.jsonl query CLI
├── scripts/
│   └── deploy.sh                   ← Deployment script
├── openclaw.plugin.json
├── package.json
├── vitest.config.ts
└── README.md
```

---

## Known Limitations

1. **Ollama unreachable behavior:** Smart Review defaults to `escalate` when Ollama is down. This means HIGH/MEDIUM patterns trigger human approval whenever Ollama is unavailable. Ensure Ollama is running if you don't want mandatory approval.

2. **Fast Lane counter does not grow on 'escalate':** Repeated escalations for the same pattern do not increment the Fast Lane counter. This is intentional — repeated escalations signal the pattern needs review, not Fast Lane bypass.

3. **Path traversal not yet fully wired:** `validatePath()` exists but is not yet connected to `before_tool_call` for file-path arguments. Planned.

---

## Phase 2: Security Learning via Memory-Recall

### Goal

Enable the Agent to proactively query past security decisions for similar commands before executing tools.

### Flow

```
User Input
  → memory-recall: extract 6w + category (LLM call)
  → LLM decides tool call
  → before_tool_call: Policy Layer verdict (programmatic)
      → matched_patterns + security_result already available
      → async write to LanceDB (no LLM call needed)
  → Command executes
  → after_tool_call: append to LanceDB
```

### Payload Extension Fields

| Field | Source | Description |
|-------|--------|-------------|
| `security_result` | Policy Layer verdict | approve / deny / escalate / fast_lane |
| `matched_patterns` | `detectDangerousPatterns()` | List of triggered pattern labels |
| `risk_severity` | Derived | critical / high / medium / low |

### Implementation Steps

1. **LanceDB Writer** — async writer in `before_tool_call` writing verdict records to dedicated LanceDB table (`~/.policy-layer/verdicts.lance`)
2. **Query Hook in `before_prompt_build`** — before LLM decides on a tool, query LanceDB for similar intent's past verdicts, inject summary into prompt
3. **Leverage memory-recall infrastructure** — reuse `bge-m3` embedding + L2 FTS + L3 graph expansion, with isolated LanceDB namespace
4. **Historical data migration** — `tools/query_approval.py --export` migrates approval.jsonl records to LanceDB

### Why a Separate LanceDB?

- Policy Layer verdict data has a different schema (command + patterns + verdict) vs memory-recall (6w + category + conversation context)
- Isolation keeps memory-recall unchanged for other projects
- Enables future embedding-based retrieval of similar past commands without LLM calls

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Plugin Framework | OpenClaw Gateway Plugin Hooks |
| Language | TypeScript |
| Testing | Vitest (103 tests) |
| LLM Review | Ollama (`llama3.3`, local inference) |
| Storage | JSONL (append log), LanceDB (Phase 2) |
| Embedding | bge-m3 (Phase 2 planned) |
| Visualization | Native HTML + CSS + JS (no build step) |
