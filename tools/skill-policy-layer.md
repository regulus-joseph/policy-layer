---
name: policy-layer
description: Agent self-governance via <openclaw_state> — understand D' score, risk_zone, and signals to self-regulate behavior
trigger: /policy
---

# /policy — Agent Self-Governance Guide

You receive `<openclaw_state>` in your context before every tool call. This guide tells you what each field means and how to act.

## Commands Users Can Also Invoke

These commands are registered by the plugin and **both Agent and User can call them**:

| Command | User & Agent |
|---------|-------------|
| `security-status` | ✅ Shows layer info and fast-lane patterns |
| `show-my-d-score` | ✅ Shows D' score and 8 signals |
| `report-bad-result [reason]` | ✅ User flags bad outcome → trust penalty |
| `set-sigmoid <param> <value>` | ⚠️ Admin only — adjusts risk thresholds |
| `policy-reset-fastlane [pattern]` | ✅ Resets fast-lane counters |

## The <openclaw_state> Fields

```xml
<openclaw_state>
  <d_prime>0.82</d_prime>
  <risk_score>0.131</risk_score>
  <risk_zone>ACCEPT</risk_zone>
  <cycles_tracked>12</cycles_tracked>
  <session_success_rate>0.95</session_success_rate>
  <tool_failure_rate>0.00</tool_failure_rate>
  <last_policy_result>PASS</last_policy_result>
</openclaw_state>
```

## How to Read Each Field

| Field | What it means | Good | Bad |
|-------|---------------|------|-----|
| `d_prime` | Your trust score (0-1) | 0.80+ | < 0.40 |
| `risk_score` | Inverted risk (high D' = low risk) | < 0.15 | > 0.85 |
| `risk_zone` | Your current operating zone | ACCEPT | REJECT |
| `cycles_tracked` | How many decisions are factored in | — | — |
| `session_success_rate` | % of your recent tool calls that succeeded | > 0.80 | < 0.50 |
| `tool_failure_rate` | % of tool calls that failed | < 0.10 | > 0.30 |
| `last_policy_result` | Result of your last decision | PASS | DENY/ESCALATE |

## The Three Zones

### ACCEPT (risk_score ≤ 0.15) — You are trusted
- **Your D' is high, recent behavior is healthy**
- Proceed normally with tool calls
- No extra caution needed

### ESCALATE (0.15 < risk_score < 0.85) — Exercise caution
- **Something in your recent history is below par**
- Slow down: verify commands before executing
- Prefer read-only operations over write/delete
- If you need to run a risky command, consider asking the user to confirm

### REJECT (risk_score ≥ 0.85) — You are not trusted
- **Your trust score is critically low**
- STOP and think before ANY tool call
- Default to safe/read-only actions
- If something feels dangerous, it probably is — ask the user
- Your last decisions were mostly failures or blocks

## Signal Breakdown (what affects your D')

Your D' is computed from 8 signals. Understanding them helps you self-correct:

| Signal | How to improve it |
|--------|-------------------|
| `success_rate` | Execute commands successfully, avoid failures |
| `tool_failure_rate` | Keep tool calls working, avoid timeouts/errors |
| `critical_hit_rate` | Avoid triggering CRITICAL patterns (those get blocked immediately) |
| `avg_severity` | Low severity = good (read-only commands = severity 50) |
| `approval_passed` | When in doubt, ask user to approve instead of proceeding |
| `approval_denied` | Don't retry a command user explicitly denied |
| `user_nudge` | If user gave negative feedback, adjust behavior |
| `fast_lane_use` | Harmless commands (git status, ls) can earn fast-lane — use them |

## Self-Regulation Rules

**When you see `<risk_zone>ACCEPT`:**
- ✅ Execute commands normally
- ✅ You can skip LLM review for fast-lane patterns
- ✅ Trust your usual judgment

**When you see `<risk_zone>ESCALATE`:**
- ⚠️ Double-check commands before executing
- ⚠️ Prefer `--dry-run`, read-only, or non-destructive options
- ⚠️ If a command feels risky, ask user to confirm first

**When you see `<risk_zone>REJECT`:**
- 🚫 STOP — do not execute without explicit user approval
- 🚫 Default to safe actions (ls, pwd, cat)
- 🚫 Do not attempt write/delete/modify operations
- 🚫 If a CRITICAL pattern triggers, it will be blocked anyway

**When you see `<last_policy_result>DENY` or `ESCALATE`:**
- The previous tool call was blocked or escalated
- Do not retry the same command without modification
- If user confirmed the command, wait for explicit approval

## Quick Reference

| risk_zone | Action |
|-----------|--------|
| ACCEPT | Normal operation |
| ESCALATE | Caution, prefer safe commands |
| REJECT | Stop, default to read-only, ask user |

## How to Self-Improve Your Score

1. **Avoid critical blocks** — `rm -rf`, `curl|sh`, `kill -9 -1` get blocked and hurt your score
2. **Keep tool calls succeeding** — failures lower your score
3. **Ask for approval** when uncertain — getting `approval_passed` helps
4. **Use harmless commands** like `ls`, `git status` to build fast-lane trust
5. **Listen to user feedback** — `report-bad-result` from user hurts your score; adjust accordingly
