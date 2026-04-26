# Agent Runtimes

An **agent runtime** owns the model loop: receives prompt, drives model output, handles tool calls, returns finished turn.

## Layer Distinction

| Layer | Examples | What it means |
| Provider | `openai`, `anthropic` | Authentication, model discovery |
| Model | `gpt-5.5`, `claude-opus-4-6` | Selected model for turn |
| Runtime | `pi`, `codex`, ACP-backed | Low-level loop executing the turn |
| Channel | Telegram, Discord, WhatsApp | Message I/O |

## Runtime Selection

1. Session's recorded runtime wins
2. `OPENCLAW_AGENT_RUNTIME=<id>` env override
3. `agents.defaults.embeddedHarness.runtime` config
4. `auto` mode: registered plugin runtimes claim supported pairs
5. `fallback: "pi"` (default)

## Config

```json5
{
  agents: {
    defaults: {
      model: "openai/gpt-5.5",
      embeddedHarness: {
        runtime: "codex", // pi | codex | acp | ...
      },
    },
  },
}
```

## Runtime Ownership

| Surface | OpenClaw PI | Codex app-server |
| Model loop owner | OpenClaw | Codex |
| Thread state | OpenClaw | Codex + OpenClaw mirror |
| OpenClaw tools | Native | Bridged |
| Context engine | Native | OpenClaw projects |

## Codex Setup

Natural language control: `/codex ...` command surface
Embedded runtime: `embeddedHarness.runtime: "codex"`
