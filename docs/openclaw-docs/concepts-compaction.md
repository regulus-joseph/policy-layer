# Compaction

Summarizes older conversation into compact entries when the session nears the model's context window limit. Full history stays on disk.

## How It Works

1. Older turns summarized into compact entry
2. Summary saved in transcript
3. Recent messages kept intact

## Auto-Compaction

On by default. Triggers when:
- Session nears context limit
- Model returns context-overflow error

Before compaction: silent memory flush reminder to save important notes.

## Manual Compaction

```
/compact
/compact Focus on API design decisions
```

## Custom Compaction Model

```json5
{
  agents: {
    defaults: {
      compaction: {
        model: "openrouter/anthropic/claude-sonnet-4-6",
      },
    },
  },
}
```

## Compaction Notices

```json5
{
  agents: {
    defaults: {
      compaction: {
        notifyUser: true,
      },
    },
  },
}
```

## Configuration

```json5
{
  agents: {
    defaults: {
      compaction: {
        mode: "safeguard", // or "force"
        targetTokens: 30000,
        keepRecentTokens: 5000,
      },
    },
  },
}
```

## Compaction vs Pruning

| | Compaction | Pruning |
| | --- | --- |
| What | Summarizes conversation | Trims tool results |
| Saved to disk | Yes | No |
| Scope | Entire conversation | Tool results only |
