# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.5.0] — 2026-05-19

### Added

- **Learned whitelist** — `allow-always` 3次触发激活 pattern，持久化到 `~/.openclaw/logs/learned-whitelist.jsonl`（重启不丢失）
- **8 信号 D' trust score** — successRate(0.20), toolFailureRate(0.15), avgSeverity inverted(0.15), criticalHit(0.25), approvalPassed(0.10), approvalDenied(0.10), userNudge(0.20), fastLaneUse(0.05)
- **onResolution 持久化** — allow-once/allow-always/deny 写入 approval.jsonl
- **NEVER_WHITELIST_PATTERNS** — 9 个绝对 block pattern（rm -rf /, curl|sh, kill -9 -1, fork bombs 等）
- **`query_approval.py` 更新** — 支持 allow-once(🔵)/allow-always(🟢) 过滤和统计

### Changed

- **Severity 方向修正** — `1 - severity/1000`（severity 高 = trust 低）
- **report-bad-result** — 只施加 trust penalty，移除 auto-blacklist（需显式确认才加入黑名单）
- **LLM Smart Review model** — 切换为 `qwen2.5:3b`（本地 Ollama）
- **Fast lane 整合** — whitelist → fast-lane → critical block → smartReview → escalate 决策链

### Fixed

- **ACTIVATION_THRESHOLD** — whitelist 需要 3 次 allow-always 才激活（之前代码未实现）
- **`computeCriticalHitRate` 未导出** — 已添加到 export block

---

## [0.4.2] — 2026-05-17

### Changed

- **D' gating system** — Replaced fixed D' bands (LOW_ACCEPT/MEDIUM_CONFIRM/HIGH_REJECT) with sigmoid-based risk scoring. Three zones: ACCEPT (risk ≤ 0.15), ESCALATE (0.15 < risk < 0.85), REJECT (risk ≥ 0.85). Configurable via `sigmoidMidpoint`, `sigmoidSteepness`, `sigmoidAcceptBelow`, `sigmoidRejectAbove`.
- **Severity magnitude calculation** — Fixed `1 - avgSeverity` → `avgSeverity / 1000`. Severity now properly contributes to D' score as intended.
- **Pattern count** — Updated documentation to reflect actual count: 25 patterns (14 CRITICAL + 11 HIGH). Previously documented as 23.
- **README HIGH pattern table** — Expanded from 4 to 11 entries, accurately listing all HIGH severity patterns.
- **Analytics dashboard** — Fixed scrollbars for Top Patterns chart and Pattern Breakdown panel.

### Removed

- **`/dev/null redirect for output suppression`** — MEDIUM pattern removed. `2>/dev/null` is a common legitimate pattern and was triggering excessive escalations.
- **Old D' band thresholds** — `dGateThreshold` config option replaced by sigmoid parameters.

---

## [0.4.0] — 2026-05-10

### Added

- **`report-bad-result` command** — User can flag a command as producing bad outcome. Penalizes agent's D' score and blacklists the command.
- **User blacklist with persistence** — Commands marked bad via `report-bad-result` are added to `USER_BLACKLIST_PATTERNS` and persisted to `~/.openclaw/logs/blacklist.jsonl`. Auto-loaded on plugin startup.
- **`show-my-d-score` command** — Displays D' score, gate status, cycle count, signals breakdown, and recent decision history.

### Changed

- **D' scoring logic** — Success/failure now tracks policy decisions (not tool execution quality). Commands blocked by policy-layer = failure; approved commands = success.
- **Blacklist detection** — User-blacklisted commands are checked in `before_tool_call` alongside `DANGEROUS_PATTERNS`, treated as CRITICAL severity (immediate block).
- **README rewrite** — Full restructure with feature overview table, architecture diagram, security behavior guide, and Phase 2 plan.

### Fixed

- **Tool failure detection** — `extractOutcomeFromMessages()` was never receiving tool results in messages; bypassed entirely in favor of direct policy decision tracking.
- **JSON error in `config/openclaw.json`** — Duplicate `policy-layer` keys removed.
- **Hardcoded local paths** — All `/home/marlon-wei` references replaced with `$HOME` or generic paths.

### Removed

- **Generated HTML files** — `graph.html`, `graphify-out/graph.html`, `src/coverage/*.html` no longer tracked in git.
- **Research docs** — `GRAPH_REPORT.md`, `LAYER1_4_IMPLEMENTATION_PLAN.md`, `OPENCLAW_PLUGIN_HOOK_SYSTEM.md`, `SPRINGDRIFT_RESEARCH.md` removed.
- **OpenClaw reference docs** — `docs/openclaw-docs/` directory removed.
- **`docs/PERFORMANCE_BENCHMARKS.md`** — Removed.
- **`tests/TEST_REPORT.md`** — Removed.
- **`approval-analytics.html`** — Removed (regenerate with `python3 docs/generate-analytics.py`).

### Infrastructure

- **`tools/query_approval.py`** — New CLI for querying `approval.jsonl` with `--stats`, `--query`, `--pattern`, `--result`, `--export` options.
- **`scripts/deploy.sh`** — New deployment script with `--dry-run` support.

---

## [0.3.0] — 2026-04-27

### Added

- **D' CBS (Cognitive Behavior System)** — `before_prompt_build` hook injects `<openclaw_state>` XML with D' score, gate status, signals breakdown.
- **4 D' signals** — success_rate (w=0.30), tool_fail (w=0.25), cbr_hit (w=0.20), severity_inv (w=0.25).
- **D' gating thresholds** — LOW_ACCEPT (<0.35), MEDIUM_CONFIRM (0.35–0.55), HIGH_REJECT (≥0.55).
- **`dcycles.jsonl`** — Persistent log of D-cycle decisions with full signal breakdown.
- **Actionable interpretation** — `<openclaw_state>` includes interpretation text (e.g., "[HIGH_REJECT] Slow down...").

### Changed

- **`before_tool_call` result** — Now returns `{ block, blockReason, requireApproval }` structure instead of simple boolean.

---

## [0.2.0] — 2026-04-25

### Added

- **Layer 1** — `normalizeCommand()` (ANSI strip, null bytes, NFKC) + `detectDangerousPatterns()` (23 regex patterns).
- **Layer 3** — `smartReview()` via Ollama local LLM for HIGH/MEDIUM commands.
- **Layer 3** — `fastLane` mechanism: 5 consecutive APPROVE → bypass LLM review.
- **Layer 3** — `approval.jsonl` logging (append-only).
- **Layer 4** — Secret leak detection in `after_tool_call` (39 patterns: API keys, tokens, JWT, private keys, etc.).
- **`security-status` command** — Shows layer status and fast-lane patterns.
- **`policy-reset-fastlane` command** — Resets fast-lane counters.
- **103 tests** — 61 unit tests + 42 integration tests, 100% coverage.

### Fixed

- **Package.json scripts** — Fixed `build`, `test`, `clean` commands.
- **Vitest config** — Correct tsconfig resolution.

---

## [0.1.0] — 2026-04-10

### Added

- Initial plugin scaffold with OpenClaw hook system integration.
- `sensorium-index.ts` — Standalone D' computation module with tests.
