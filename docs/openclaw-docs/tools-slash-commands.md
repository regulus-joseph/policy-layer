# slash-commands

Slash commands are first-class agent primitives. Unlike tools, they let the agent directly call named subroutines — not just describe capabilities.

## Quick Reference

| Command | When agent uses it |
| `/new` | Start fresh |
| `/reset` | Reset and replay |
| `/stop` | Stop in-progress generation |
| `/retry` | Retry last turn |
| `/compact` | Compact conversation |
| `/undo` | Undo last N turns |
| `/edit <spec>` | Structured edit |
| `/browse` | Open browser |
| `/screenshot` | Take screenshot |
| `/clips` | List clipboard history |
| `/paste` | Paste from clipboard |
| `/ask` | Ask user a question |
| `/agent <name>` | Switch to named agent |
| `/model <model>` | Switch model |
| `/reason` | Toggle reasoning mode |
| `/codebase` | Search codebase |
| `/web` | Web search |
| `/reason` | Toggle extended thinking |
| `/wiki` | Query wiki knowledge base |
| `/memory` | Query memory system |
| `/exec <cmd>` | Run shell command |
| `/browse` | Open browser |
| `/tts` | Text-to-speech |
| `/stt` | Speech-to-text |
| `/canvas` | Canvas tool |
| `/image` | Image generation |

## Slash Command Syntax

```bash
/openclaw-new [opts] [--session <session-id>] [--message "prompt"] [--system-event "event"]
/openclaw-reset [opts] [--session <session-id>]
/openclaw-stop [opts] [--session <session-id>]
/openclaw-retry [opts] [--session <session-id>]
/openclaw-compact [opts] [--session <session-id>]
/openclaw-undo [opts] [--count N] [--session <session-id>]
/openclaw-edit [opts] --file <path> --diff <patch>
/openclaw-ask [opts] --message "question"
/openclaw-model [opts] --model <model-id>
/openclaw-agent [opts] --name <agent-name>
/openclaw-codebase [opts] --query <query>
/openclaw-web [opts] --query <query>
/openclaw-exec [opts] [--cwd <dir>] [--env <vars>] [--timeout <ms>] -- <cmd> [args...]
/openclaw-sandbox [opts] -- <cmd> [args...]
```

## Command Aliases

`/new`, `/reset`, `/stop`, `/retry`, `/compact`, `/undo` all have single-letter aliases: `/n`, `/r`, `/s`, `/R`, `/c`, `/u`.

## Standalone CLI equivalents

All slash commands are also available as standalone CLI commands:
- `openclaw message --new`
- `openclaw message --reset`
- `openclaw message --stop`
- `openclaw message --retry`
- `openclaw sessions compact`
- `openclaw sessions undo`
- `openclaw models switch`
- `openclaw agents switch`
