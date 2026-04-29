# Plugin Latency Benchmarks

**Date:** 2026-04-29
**Method:** Warm state measurement — gateway restart, wait 30s, discard first run, measure second run.
**Target:** `echo "safe"` — simple LLM call for baseline comparison.

## Raw Results

| Configuration | Cold (first run) | Warm (second run) | Notes |
|---------------|-------------------|-------------------|-------|
| PS only | — | 12.24s | Baseline: minimax cloud LLM |
| PS + SAI | — | 13.15s | SAI overhead: +0.91s |
| PS + MR | 57s | 15.7s | MR cold: +44.76s; MR warm: +3.46s |
| All 3 | 58s | 14.6s | — |

## Breakdown

### Warm State (per-turn, realistic usage)

```
minimax cloud LLM:   12.24s   ← 84% of total (largest single factor)
memory-recall:         3.46s   ← per-turn LLM call in MR
skill-auto-injection:  0.91s   ← per-turn bge-m3 embedding
policy-sensorium:      <0.1s   ← pure memory compute
─────────────────────────────────────────────────────────
Total warm:           ~14.6s   ← user-perceived latency
```

### Cold State (gateway restart, worker cold start)

```
minimax cloud LLM:   12.24s
memory-recall cold:  44.76s   ← MR Python worker cold start (import + LanceDB init)
skill-auto-injection:  0.91s
policy-sensorium:      <0.1s
─────────────────────────────────────────────────────────
Total cold:           ~58s     ← gateway restart penalty
```

## Per-Component Analysis

### 1. minimax cloud LLM (~12s warm, ~12s cold)
- Dominates total latency at 84% of warm state
- Stable across runs (12.24s baseline)
- Question: does latency scale with prompt token count? Needs further testing

### 2. memory-recall (~3.5s warm, ~45s cold)
- **Cold:** Python worker spawn + import (httpx, LanceDB, NetworkX, etc.) — blocking gateway
- **Warm:** Per-turn LLM call (likely `_llm_extract` via Ollama) + LanceDB query
- **Root cause of gateway restart slowness:** worker cold start blocks gateway entirely
- **Solution:** Keep worker warm — avoid restarting gateway frequently

### 3. skill-auto-injection (~0.9s warm, ~0.9s cold)
- **Warm:** `getEmbedding(userPrompt)` via Ollama bge-m3 (~250ms) + cosine similarity
- **Cold:** Same — skill embeddings cached on disk in `skill-meta.json`, no recomputation
- **Optimization already done:** `skill-meta.json` caches skill embeddings by SHA256 hash

### 4. policy-sensorium (<0.1s)
- Pure in-memory computation
- DCycleStore writes to `~/.openclaw/logs/dcycles.jsonl` (async, non-blocking)
- Negligible impact

## Minimax LLM Latency Scales with Content

| Prompt | Warm time | Notes |
|--------|-----------|-------|
| `"echo safe"` | 12.24s | Short English, minimal reasoning |
| `"老人与海的故事精简版"` | ~15s | Longer Chinese, more reasoning |

**+3s for more complex content** — modest scaling with prompt complexity/token count.

Cold state (58s) vs warm state (14.6s) = **43s penalty per gateway restart.**

Action items:
1. MR worker should survive gateway config reload (currently killed on restart)
2. Consider lazy-loading MR or running worker as standalone service
3. SAI and PS overhead is acceptable (<5s combined)

## Test Method

```bash
# 1. Change plugin config in ~/.openclaw/openclaw.json
# 2. openclaw gateway restart
# 3. Wait 30s for worker warmup
# 4. Run "echo safe" TWICE — first triggers init, second measures real per-turn
# 5. Record second run time
```
