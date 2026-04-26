# Dreaming

Background memory consolidation system in `memory-core`. Moves short-term signals to durable memory.

**Opt-in** — disabled by default.

## Phases

| Phase | Purpose | Writes MEMORY.md? |
| Light | Sort and stage recent signals | No |
| Deep | Score and promote durable candidates | Yes |
| REM | Reflect on themes and patterns | No |

### Light Phase
- Ingests recent daily memory + recall traces
- Deduplicates and stages candidates
- Records reinforcement signals

### Deep Phase
- Ranks candidates with weighted scoring
- Requires: minScore + minRecallCount + minUniqueQueries gates
- Rehydrates snippets from live daily files
- Appends promoted entries to MEMORY.md
- Writes summary to DREAMS.md

### REM Phase
- Extracts patterns from short-term traces
- Writes theme summaries
- Records reinforcement for deep ranking

## Scoring Signals

| Signal | Weight | Description |
| Frequency | 0.24 | Short-term signal count |
| Relevance | 0.30 | Average retrieval quality |
| Query diversity | 0.15 | Distinct query contexts |
| Recency | 0.15 | Time-decayed freshness |
| Consolidation | 0.10 | Multi-day recurrence |
| Conceptual richness | 0.06 | Concept-tag density |

## Dream Diary

`DREAMS.md` stores phase summaries for human review. After each phase, a background subagent writes a short diary entry.

Grounded backfill: replay older notes into DREAMS.md for review without auto-promoting.

## Scheduling

Auto-manages one cron job for full dreaming sweep. Default: `0 3 * * *` (3am daily).

## Enable

```json
{
  "plugins": {
    "entries": {
      "memory-core": {
        "config": {
          "dreaming": { "enabled": true }
        }
      }
    }
  }
}
```

## CLI

```bash
openclaw memory promote          # Preview
openclaw memory promote --apply  # Apply
openclaw memory rem-harness       # Preview without writing
openclaw memory promote-explain "query"
```

## Slash Command

```
/dreaming status
/dreaming on
/dreaming off
```
