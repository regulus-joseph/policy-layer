# Sigmoid Parameter Optimization Plan

## Status: NOT YET IMPLEMENTED

---

## Overview

The sigmoid function gates whether a command is auto-accepted, requires approval, or is auto-rejected based on the trust score D'. Currently the parameters are hard-coded defaults. This document describes the planned learning system.

---

## Current Sigmoid Config (hard-coded defaults)

```typescript
const DEFAULT_SIGMOID = {
  midpoint: 0.58,     // D' midpoint: risk sigmoid transitions here
  steepness: 0.10,    // Sigmoid steepness (smaller = sharper transition)
  acceptBelow: 0.15,  // risk < this → AUTO_ACCEPT
  rejectAbove: 0.85,  // risk > this → AUTO_REJECT
};
```

### Current Logic

```
D' computed from trust signals
    ↓
risk = sigmoid((D' - midpoint) / steepness)
    ↓
risk < acceptBelow (0.15) → AUTO_ACCEPT  (if also in whitelist)
risk > rejectAbove (0.85) → AUTO_REJECT
otherwise                  → REQUIRE_APPROVAL
```

---

## Desired Feedback-Driven Learning

```
Agent behavior events → collect in approval.jsonl/dcycles.jsonl
                                    ↓
                          offline optimization job
                                    ↓
                          optimal (midpoint, steepness, acceptBelow, rejectAbove)
                                    ↓
                          security-admin reviews diff
                                    ↓
                          apply to plugin config (via PR)
```

---

## Event Log Schema (for learning)

Each tool call cycle should log this additional fields to `dcycles.jsonl`:

```typescript
interface LearningEvent {
  cycleId: string;
  sessionId: string;
  timestamp: string;
  dPrimeBefore: number;           // D' score BEFORE this command
  riskBefore: number;              // risk score BEFORE this command
  command: string;
  matchedPatterns: string[];
  severity: 'critical' | 'high' | 'medium';
  gateDecision: 'AUTO_ACCEPT' | 'AUTO_REJECT' | 'REQUIRE_APPROVAL';
  userDecision?: 'allow-once' | 'allow-always' | 'deny' | 'timeout' | 'cancelled';
  executionOutcome?: 'success' | 'failure' | 'bad_user_feedback';
  severityOutcome?: number;        // severity score if failure
}
```

---

## Loss Function

For a given sigmoid parameter set `θ = (midpoint, steepness, acceptBelow, rejectAbove)`:

```typescript
function loss(θ, historicalEvents: LearningEvent[]) {
  let friction = 0;   // unnecessary approval burden
  let risk = 0;       //放行了坏命令

  for (const event of historicalEvents) {
    const decision = gateDecision(event.dPrimeBefore, θ);

    // Friction: required approval but user said allow
    if (decision === 'REQUIRE_APPROVAL' && event.userDecision === 'allow-once') {
      friction++;
    }

    // Friction: required approval but user said allow-always
    if (decision === 'REQUIRE_APPROVAL' && event.userDecision === 'allow-always') {
      friction += 0.5; // less friction than allow-once
    }

    // Risk: auto-accepted but turned out bad
    if (decision === 'AUTO_ACCEPT' && event.executionOutcome === 'failure') {
      risk += event.severityOutcome ?? 100;
    }

    // Risk: auto-accepted but user gave bad feedback
    if (decision === 'AUTO_ACCEPT' && event.executionOutcome === 'bad_user_feedback') {
      risk += 500; // high penalty for user nudging
    }
  }

  const α = CONFIG.frictionWeight ?? 1.0;
  const β = CONFIG.riskWeight ?? 10.0;  // security weight 10x friction

  return α * friction + β * risk;
}
```

---

## Optimization Algorithm

**Method**: Grid search over parameter space (simple, safe for production)

```
Parameters to tune:
  - midpoint: [0.3, 0.4, 0.5, 0.6, 0.7]
  - steepness: [0.05, 0.10, 0.15, 0.20]
  - acceptBelow: [0.05, 0.10, 0.15, 0.20]
  - rejectAbove: [0.80, 0.85, 0.90, 0.95]

Total combinations: 5 × 4 × 4 × 4 = 320

For each combination:
  1. Compute loss over historical data
  2. Sort by loss
  3. Output top-5 parameter sets
```

**Why grid search instead of gradient descent**:
- Parameter space is small (320 combos)
- Non-convex loss surface possible
- Grid search is auditable and reproducible
- security-admin can review before applying

---

## Implementation Phases

### Phase 1: Data Collection (low effort, high value)
- [x] Already logging: `dcycles.jsonl` has dPrime, decision, signals
- [ ] Add `userDecision` field to dcycles log
- [ ] Add `executionOutcome` field populated from after_tool_call
- [ ] CLI tool to replay historical commands through current policy

### Phase 2: Offline Optimization CLI
- [ ] Load historical dcycles.jsonl
- [ ] Implement loss function
- [ ] Grid search over parameter space
- [ ] Output top-5 parameter sets with loss scores
- [ ] Generate diff vs current config

### Phase 3: Admin Workflow
- [ ] Script that auto-runs weekly
- [ ] Generates PR-ready config patch
- [ ] Notifications to security-admin (optional)
- [ ] Human review required before apply

### Phase 4: Auto-tune (optional, default off)
- [ ] Config flag: `autoTune: false`
- [ ] If enabled: auto-apply top params if loss improved >10%
- [ ] Always log what changed

---

## Weight Configuration (α/β)

Controllable via plugin config:

```json
{
  "policyLayer": {
    "learning": {
      "enabled": false,
      "autoApply": false,
      "frictionWeight": 1.0,
      "riskWeight": 10.0,
      "minImprovementThreshold": 0.10
    }
  }
}
```

- `frictionWeight` (α): Higher = fewer false positives, more approvals needed
- `riskWeight` (β): Higher = stricter security, fewer auto-accepts
- Default: α=1.0, β=10.0 (security 10x more important than convenience)

---

## Open Questions

1. **How much historical data is enough?**
   - Suggestion: minimum 1000 cycles before first tune
   - More data = better parameter estimates

2. **How to handle session boundaries?**
   - D' is per-session. Should we tune per-session or global?
   - Suggestion: global for now, per-session in v2

3. **What if loss is flat across all param sets?**
   - Indicates: not enough signal diversity
   - Suggestion: wait for more data

4. **Who approves the new parameters?**
   - Single security-admin OR code owner?
   - Suggestion: PR review required, same as any config change

---

## References

- Current sigmoid implementation: `src/index.ts` → `sigmoidRisk()`
- Current trust signals: `src/index.ts` → `computeTrustScore()`
- Historical log: `~/.openclaw/logs/dcycles.jsonl`