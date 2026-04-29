# Policy Layer — v0.2.0

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

| File | Purpose | Gateway Path |
|------|---------|-------------|
| `src/index.ts` | Plugin entry: 3 hooks + 3 commands | `~/projects/policy-layer/src/index.ts` |
| `src/security/*.ts` | Layer 1/3/4 security modules (9 files) | `~/projects/policy-layer/src/security/` |
| `openclaw.plugin.json` | Plugin manifest | `~/projects/policy-layer/openclaw.plugin.json` |
| `config/openclaw.json` | Gateway config (deploy → `~/.openclaw/`) | — |
| `scripts/deploy.sh` | 部署脚本 | — |

### 一键部署

```bash
# 干跑（不写入）
./scripts/deploy.sh --dry-run

# 正式部署
./scripts/deploy.sh

# 验证
cat ~/.openclaw/exec-approvals.json | grep ask
openclaw logs --tail 20
```

### 部署内容说明

| 文件 | 更新内容 |
|------|---------|
| `openclaw.json` | 去除了 acpx 重复配置；`plugins.allow` 加入 telegram；`plugins.entries` 和 `plugins.installs` 加入 policy-sensorium；`plugins.load.paths` 加入 policy-layer |
| `devices/pending.json` | 清空，停止设备重连循环 log |
| `devices/paired.json` | 保留，不改动 |

**注意：`exec-approvals.json` 不再使用。** openclaw 默认值已经是 `ask: "off"` + `security: "full"`，完全放行给 plugin 处理。

### Gateway Config

Plugin is registered at path `/home/marlon-wei/projects/policy-layer` in `~/.openclaw/openclaw.json` under `plugins.load.paths`.

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

| Hook | Layer | Purpose |
|------|-------|---------|
| `before_prompt_build` | L2 | Inject `<openclaw_state>` D' CBS XML |
| `before_tool_call` | L1→L3 | Pattern match → smart review → block/approve/escalate |
| `after_tool_call` | L4 | Detect secret leaks in tool output |

### Commands

```
policy-security           Layer status + fast-lane patterns
policy-sensorium          D' CBS metrics (d_prime, cycles, success rate)
policy-reset-fastlane     Reset all fast-lane counters
policy-reset-fastlane <p> Reset fast-lane for specific pattern
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

## File Guide

```
policy-layer/
├── src/
│   ├── index.ts              ← Main plugin (hooks + commands)
│   ├── sensorium-index.ts   ← D' CBS (standalone test version)
│   ├── sensorium-index.test.ts  ← 42 D' unit tests
│   └── security/
│       ├── normalize.ts      ← ANSI strip, null strip, NFKC
│       ├── patterns.ts       ← 23 dangerous patterns + detectDangerousPatterns()
│       ├── path.ts           ← Path traversal validation
│       ├── smart-review.ts   ← Ollama LLM review
│       ├── approval-log.ts   ← JSONL append to ~/.openclaw/logs/
│       ├── fast-lane.ts      ← 5-approval fast-lane bypass
│       ├── secret-patterns.ts ← 39 secret patterns
│       ├── redact.ts         ← Secret redaction engine
│       └── url-redact.ts     ← URL + env var redaction
├── tests/
│   ├── unit/security.test.ts        ← 61 unit tests
│   ├── integration/hook-simulation.test.ts  ← 42 integration tests
│   └── TEST_REPORT.md               ← Full test report
├── docs/
│   ├── approval-analytics.html     ← Analytics dashboard (self-contained HTML)
│   └── generate-analytics.py        ← Regenerate dashboard from approval.jsonl
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

| Layer | Tests | Coverage |
|-------|-------|---------|
| L1 normalize | 6 | ANSI, null, NFKC, trim |
| L1 patterns | 23 | 16 critical(block) + 7 high/medium(review) |
| L1 path | 6 | traversal detection, valid paths |
| L3 fast-lane | 5 | 5-approval threshold, reset |
| L3 hook sim | 13 | critical=block, benign=pass, multi-pattern |
| L4 secrets | 17 | 9 secret types, URL, env |
| Gateway | 2 | HTTP health, WebSocket |
| **Total** | **103** | **100%** ✅ |

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
      "policy-sensorium": {
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

| Config | Default | Description |
|--------|---------|-----------|
| `reportToUser` | `true` | Agent 主动在对话里汇报 D' 状态；`false` 静默 |
| `sensoriumWindow` | 20 | Cycles to track for D' signals |
| `dGateThreshold` | 0.35 | D' below this → LOW_ACCEPT |
| `logLevel` | info | debug / info / warn |

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

## Maintenance (returning in 2 days)

### 1. Check if plugin is still running
```bash
openclaw acp --session test-check
# Type: policy-security
# Should show: "Layers 1-4 Active"
```

### 2. Check approval log has real data
```bash
wc -l ~/.openclaw/logs/approval.jsonl
# Should be > 0 if gateway has been used
```

### 3. Update analytics dashboard
```bash
python3 ~/projects/policy-layer/docs/generate-analytics.py
open ~/projects/policy-layer/docs/approval-analytics.html
```

### 4. Review deny/escalate events
Look at the dashboard — if deny rate > 10% of total events, review:
- Are benign commands being false-positively blocked?
- Is Ollama responding correctly in smart-review?

### 5. If issues found, restart gateway
```bash
openclaw gateway restart
```

### 6. Run tests after any code change
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

## Git Log

```
b25e05a feat: add approval analytics dashboard (self-contained HTML)
35c5369 chore: rename to policy-layer v0.2.0, update README
1cdea0a feat: merge policy-sensorium v0.2.0 — Layers 1-4 complete + 103 tests
5104ffb feat: Layer 1-4 security files + integration
```

---

## Next Steps (when you return)

1. **Check real approval.jsonl** — does it have actual events from gateway usage?
2. **Review dashboard** — are deny/escalate rates reasonable?
3. **Fast-lane effectiveness** — any pattern that should be fast-lane but isn't?
4. **Secret leak alerts** — did Layer 4 catch any tool output containing secrets?
5. **Consider**: path traversal wiring into before_tool_call, Zone-based isolation (Layer 2), CBR integration with memory-recall
