# Policy Layer — v0.4.0

OpenClaw gateway plugin: 4-layer security enforcement + D' Cognitive Behavior System (CBS).

**Loaded at:** `~/projects/policy-layer/` (gateway plugin)
**Status:** Gateway running, plugin active ✅
**Tests:** 103/103 passing ✅

---

## Quick Start

```bash
# Verify plugin is loaded
openclaw gateway restart   # restart to reload
openclaw acp              # test in ACP session

# Run tests
cd ~/projects/policy-layer
npm test                  # 103 tests

# Update analytics dashboard
python3 docs/generate-analytics.py
open docs/approval-analytics.html
```

---

## Deployment

### Files Loaded by Gateway

| File                   | Purpose                                  | Gateway Path                                   |
| ---------------------- | ---------------------------------------- | ---------------------------------------------- |
| `src/index.ts`         | Plugin entry: 3 hooks + 4 commands       | `~/projects/policy-layer/src/index.ts`         |
| `src/security/*.ts`    | Layer 1/3/4 security modules (9 files)  | `~/projects/policy-layer/src/security/`        |
| `openclaw.plugin.json` | Plugin manifest                          | `~/projects/policy-layer/openclaw.plugin.json` |
| `config/openclaw.json` | Gateway config (deploy to `~/.openclaw/`)| —                                              |
| `scripts/deploy.sh`    | Deployment script                        | —                                              |

### One-Click Deployment

```bash
# Dry run (no writes)
./scripts/deploy.sh --dry-run

# Actual deployment
./scripts/deploy.sh

# Verify
cat ~/.openclaw/exec-approvals.json | grep ask
openclaw logs --tail 20
```

### Deployment Details

| File                   | Changes                                                                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openclaw.json`        | Removed duplicate acpx config; added telegram to `plugins.allow`; added policy-layer to `plugins.entries`, `plugins.installs`, and `plugins.load.paths`                |
| `devices/pending.json` | Cleared to stop device reconnect loop logs                                                                                                                             |
| `devices/paired.json`  | Preserved, no changes                                                                                                                                                   |

**Note:** `exec-approvals.json` is no longer used. OpenClaw defaults to `ask: "off"` + `security: "full"`, fully delegating to the plugin.

### Gateway Config

Plugin is registered at path `~/projects/policy-layer` in `~/.openclaw/openclaw.json` under `plugins.load.paths`.

```bash
# To reload after editing plugin code:
openclaw gateway restart

# To verify loaded:
openclaw acp  # any session
```

---

## Architecture

```
Tool Call
  │
  ├─ Layer 1: normalizeCommand(cmd)
  │     → ANSI strip / null bytes / NFKC normalize
  │
  ├─ Layer 1: detectDangerousPatterns()
  │     → 23 regex patterns
  │         CRITICAL (16): rm -rf /, curl|sh, kill -9 -1, fork bomb,
  │                        chmod 777 /, pkill gateway, killall gateway,
  │                        openclaw gateway stop, /dev/tcp, chmod +x|bash...
  │         HIGH (7):      git reset --hard, /dev/tcp, SQL DROP,
  │                        kill -TERM -1...
  │
  ├─ Layer 2: D' CBS
  │     → before_prompt_build: inject <openclaw_state> XML
  │     → 4 signals: success_rate(w=0.30), tool_fail(w=0.25),
  │                  cbr_hit(w=0.20), severity_inv(w=0.25)
  │     → D' = Σ(w·m) / (0.30×1.0×n)
  │
  ├─ Layer 3: Smart Review
  │     → CRITICAL → block immediately
  │     → HIGH/MEDIUM → smartReview() via Ollama
  │         APPROVE  → fast-lane counter++
  │         DENY     → block
  │         ESCALATE → requireApproval (human)
  │
  ├─ Layer 3: Fast Lane
  │     → 5 consecutive APPROVE → bypass LLM review
  │
  ├─ Layer 3: Approval Log
  │     → ~/.openclaw/logs/approval.jsonl (JSONL, append-only)
  │
  └─ Layer 4: Secret Leak Detection
        → after_tool_call: redactSecrets(output)
        → warn if any of 39 secret patterns found in tool output
```

### Hooks Used

| Hook                  | Layer | Purpose                                               |
| --------------------- | ----- | ----------------------------------------------------- |
| `before_prompt_build` | L2    | Inject `<openclaw_state>` D' CBS XML                  |
| `before_tool_call`    | L1→L3 | Pattern match → smart review → block/approve/escalate |
| `after_tool_call`     | L4    | Detect secret leaks in tool output                    |

### Commands

```
security-status            Layer status + fast-lane patterns
show-my-d-score [session]  D' CBS metrics (d_prime, cycles, success rate)
policy-reset-fastlane      Reset all fast-lane counters
policy-reset-fastlane <p>  Reset fast-lane for specific pattern
report-bad-result [reason] Mark last command as producing bad result (user feedback)
```

---

## Security Behavior

### Critical (immediate block, no review)
```
rm -rf /, rm -rf /*
curl http://... | sh
wget http://... | sh
kill -9 -1
fork bomb (:(){ :|:& };:)
chmod 777 /
pkill gateway, killall gateway, openclaw gateway stop
chmod +x ... | bash|sh|python
```

### High/Medium (smart-review via Ollama)
```
git reset --hard          → approve/deny/escalate
/dev/tcp/...             → approve/deny/escalate
SQL DROP TABLE/DATABASE   → approve/deny/escalate
kill -TERM -1            → approve/deny/escalate
```

### Benign (no match → pass)
```
rm -rf node_modules, rm -rf dist, rm -rf __pycache__
npm install, npm cache clean
git status, git commit
kill -9 <specific_pid>
chmod 755, chmod 644
ls, cat, grep, glob
```

---

## User Feedback Loop

When a command passes through policy-layer but produces a bad result, the user can report it:

```
report-bad-result 这条命令把文件删错了
```

This marks the last command as failed:
- Last cycle's `success` → false, `severity` → 600
- D' score drops → agent is penalized
- Command is added to `USER_BLACKLIST_PATTERNS` and persisted to `~/.openclaw/logs/blacklist.jsonl`
- On next startup, blacklist is auto-loaded

---

## File Guide

```
policy-layer/
├── src/
│   ├── index.ts              ← Main plugin (hooks + commands)
│   ├── sensorium-index.ts   ← D' CBS (standalone test version)
│   ├── sensorium-index.test.ts  ← 42 D' unit tests
│   └── security/
│       ├── normalize.ts      ← ANSI strip, null strip, NFKC
│       ├── patterns.ts       ← 23 dangerous patterns + user blacklist
│       ├── path.ts           ← Path traversal validation
│       ├── smart-review.ts   ← Ollama LLM review
│       ├── approval-log.ts   ← JSONL append to ~/.openclaw/logs/
│       ├── fast-lane.ts      ← 5-approval fast-lane bypass
│       ├── secret-patterns.ts ← 39 secret patterns
│       ├── redact.ts         ← Secret redaction engine
│       └── url-redact.ts     ← URL + env var redaction
├── tests/
│   ├── unit/security.test.ts        ← 61 unit tests
│   └── integration/hook-simulation.test.ts  ← 42 integration tests
├── docs/
│   └── generate-analytics.py        ← Regenerate dashboard from approval.jsonl
├── tools/
│   └── query_approval.py             ← CLI for querying approval.jsonl
├── scripts/
│   └── deploy.sh                     ← Deployment script
├── openclaw.plugin.json   ← Plugin manifest
├── package.json           ← npm scripts
├── vitest.config.ts       ← Test runner config
├── tsconfig.json          ← TypeScript config
└── README.md
```

---

## Testing

```bash
cd ~/projects/policy-layer
npm test                  # 103 tests (61 unit + 42 integration)
```

### Test Coverage

| Layer        | Tests   | Coverage                                   |
| ------------ | ------- | ------------------------------------------ |
| L1 normalize | 6       | ANSI, null, NFKC, trim                     |
| L1 patterns  | 23      | 16 critical(block) + 7 high/medium(review) |
| L1 path      | 6       | traversal detection, valid paths           |
| L3 fast-lane | 5       | 5-approval threshold, reset                |
| L3 hook sim  | 13      | critical=block, benign=pass, multi-pattern |
| L4 secrets   | 17      | 9 secret types, URL, env                   |
| Gateway      | 2       | HTTP health, WebSocket                     |
| **Total**    | **103** | **100%** ✅                                 |

---

## Analytics Dashboard

```bash
# Regenerate dashboard from latest approval.jsonl
python3 docs/generate-analytics.py

# Open in browser
open docs/approval-analytics.html
```

Dashboard shows:
- **Left sidebar**: result counts (deny/escalate/approve/fast_lane) — click to filter
- **Donut chart**: distribution of results
- **Bar chart**: top 8 patterns by frequency
- **Timeline**: hourly activity stacked by result type
- **Event table**: sortable, filterable event log (200 records max)
- **Pattern drilldown**: each pattern's deny/escalate/approve/fast_lane breakdown

Auto-refreshes every 30 seconds.

**Approval log location:** `~/.openclaw/logs/approval.jsonl`

---

## Configuration

In `~/.openclaw/openclaw.json` or `config/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "policy-layer": {
        "enabled": true,
        "hooks": {
          "allowPromptInjection": true
        },
        "config": {
          "reportToUser": true,
          "sensoriumWindow": 20,
          "dGateThreshold": 0.35,
          "logLevel": "info"
        }
      }
    }
  }
}
```

| Config            | Default | Description                                              |
| ----------------- | ------- | -------------------------------------------------------- |
| `reportToUser`    | `true`  | Agent actively reports D' status in conversation; `false` = silent |
| `sensoriumWindow` | 20      | Cycles to track for D' signals                            |
| `dGateThreshold`  | 0.35    | D' below this → LOW_ACCEPT                                |
| `logLevel`        | info    | debug / info / warn                                       |

---

## Gateway Self-Protection

These commands are blocked at Layer 1 (critical severity):

```bash
pkill gateway         → BLOCKED
pkill -9 gateway     → BLOCKED
killall gateway      → BLOCKED
openclaw gateway stop → BLOCKED
```

---

## Maintenance

### Step types

| Prefix       | Where                                           | How                                              |
| ------------ | ----------------------------------------------- | ------------------------------------------------ |
| **Terminal** | bash shell                                      | Run the command directly                          |
| **ACP session** | Inside TUI after `openclaw acp --session <name>` | Type the command directly (no JSON), or press `/` to browse commands |

### 1. ACP session — Verify plugin is running

```bash
# In bash: start an ACP session
openclaw acp --session <your-session>
```

Then inside the ACP TUI, type:
```
/security-status
```
Expected: `"Layers 1-4 Active"`

### 2. Terminal — Check approval log has data
```bash
wc -l ~/.openclaw/logs/approval.jsonl
```
Should be `> 0` if the gateway has processed tool calls.

### 3. Terminal — Update analytics dashboard
```bash
python3 ~/projects/policy-layer/docs/generate-analytics.py
open ~/projects/policy-layer/docs/approval-analytics.html
```

### 4. Review the dashboard

If deny rate > 10% of total events, investigate:
- Are benign commands being false-positively blocked?
- Is Ollama responding correctly in smart-review?

### 5. Terminal — Restart gateway if issues found
```bash
openclaw gateway restart
```

### 6. Terminal — Run tests after code changes
```bash
cd ~/projects/policy-layer
npm test
```

---

## Known Issues

1. **Smart review depends on Ollama**: When Ollama is unreachable, `smartReview()` defaults to `escalate` (safe default — requires human approval). This means HIGH/MEDIUM patterns always trigger approval when Ollama is down.

2. **Fast-lane counter does not grow on 'escalate'**: If a pattern keeps returning 'escalate', the fast-lane counter doesn't increment. This is intentional security design — repeated escalations indicate the pattern needs review, not fast-lane bypass.

3. **No path traversal blocking in bash tool**: `validatePath()` exists (Layer 1) but is not yet wired into `before_tool_call` for file-path arguments. Planned.

---

## Phase 2: Security Learning via Memory-Recall

### Goal
Enable agent to learn from past command decisions before executing tools.

### Flow
```
User input
  → memory-recall: extract 6w + category (LLM call)
  → LLM decides tool call
  → before_tool_call: policy-layer verdict (programmatic)
      → matched_patterns + security_result are already available
      → async write to LanceDB (no LLM call needed)
  → Command executes
```

### Payload schema (additional fields on top of memory-recall's 21 fields)
| Field | Source | Description |
|-------|--------|-------------|
| `security_result` | policy-layer verdict | approve / deny / escalate / fast_lane |
| `matched_patterns` | `detectDangerousPatterns()` output | List of triggered pattern labels |
| `risk_severity` | Derived | critical / high / medium / low |

### Implementation steps
1. **LanceDB writer** — async writer in `before_tool_call` that writes verdict records to a dedicated LanceDB table (`~/.policy-layer/verdicts.lance`)
2. **Query hook in `before_prompt_build`** — before LLM decides tool, query LanceDB for similar intent's past verdicts, inject summary into prompt
3. **Leverage memory-recall infrastructure** — reuse `bge-m3` embedding + L2 FTS + L3 graph expansion from memory-recall, but with isolated LanceDB namespace
4. **Data volume** — approval.jsonl has ~200 records; once Phase 2 is live, new records go to both JSONL + LanceDB; migrate historical records via `tools/query_approval.py --export`

### Why separate LanceDB?
- policy-layer verdict data has different schema (command + patterns + verdict) vs memory-recall (6w + category + conversation context)
- Keeps memory-recall unchanged for other projects that depend on it
- Enables future embedding-based retrieval of similar past commands without LLM calls