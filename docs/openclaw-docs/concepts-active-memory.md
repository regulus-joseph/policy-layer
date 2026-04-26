# Active Memory

Optional plugin that runs a blocking memory sub-agent before the main reply to surface relevant memories.

## Quick Enable

```json5
{
  plugins: {
    entries: {
      "active-memory": {
        enabled: true,
        config: {
          enabled: true,
          agents: ["main"],
          allowedChatTypes: ["direct"],
          modelFallback: "google/gemini-3-flash",
          queryMode: "recent",
          promptStyle: "balanced",
          timeoutMs: 15000,
          maxSummaryChars: 220,
          persistTranscripts: false,
          logging: true,
        },
      },
    },
  },
}
```

## How It Works

User Message → Build Memory Query → Active Memory Sub-Agent → [relevant summary or NONE] → Main Reply

The sub-agent can only use `memory_search` and `memory_get`.

## Query Modes

| Mode | Context | Use case |
| `message` | Latest user message only | Fastest, strongest preference recall |
| `recent` | Message + recent tail | Balanced speed + grounding |
| `full` | Full conversation | Best quality, slower |

## Prompt Styles

`balanced` | `strict` | `contextual` | `recall-heavy` | `precision-heavy` | `preference-only`

## Session Toggle

```
/active-memory status
/active-memory off
/active-memory on
```

## Debugging

```
/verbose on   # Shows status line
/trace on     # Shows debug summary
/trace raw    # Shows raw prompt
```

## Speed Tips

- Leave `model` unset to use same model as chat
- Use dedicated fast model: `google/gemini-3-flash` or `cerebras/gpt-oss-120b`
- Lower `queryMode` for lower latency
