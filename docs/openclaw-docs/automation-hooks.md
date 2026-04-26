# Internal Hooks

Hooks are small scripts that run when something happens inside the Gateway.

## Two Types of Hooks

1. **Internal hooks** (this page): run inside the Gateway for agent events like `/new`, `/reset`, `/stop`
2. **Plugin hooks**: in-process extension points for deeper integration

## Quick Start

```bash
openclaw hooks list
openclaw hooks enable session-memory
openclaw hooks check
openclaw hooks info session-memory
```

## Event Types

| Event | When it fires |
| `command:new` | `/new` command issued |
| `command:reset` | `/reset` command issued |
| `command:stop` | `/stop` command issued |
| `command` | Any command event |
| `session:compact:before` | Before compaction |
| `session:compact:after` | After compaction |
| `session:patch` | Session properties modified |
| `agent:bootstrap` | Before workspace bootstrap |
| `gateway:startup` | After channels start |
| `message:received` | Inbound message |
| `message:transcribed` | Audio transcription completes |
| `message:preprocessed` | Media/link understanding completes |
| `message:sent` | Outbound message delivered |

## Hook Structure

Each hook is a directory:
```
my-hook/
├── HOOK.md          # Metadata + documentation
└── handler.ts       # Handler implementation
```

### HOOK.md Format
```markdown
---
name: my-hook
description: "Short description"
metadata:
  { "openclaw": { "emoji": "🔗", "events": ["command:new"], "requires": { "bins": ["node"] } }
---

# My Hook

Detailed documentation.
```

### Handler Implementation
```typescript
const handler = async (event) => {
  if (event.type !== "command" || event.action !== "new") return;
  console.log(`[my-hook] New command triggered`);
  event.messages.push("Hook executed!");
};
export default handler;
```

## Bundled Hooks

| Hook | Events | What it does |
| `session-memory` | `command:new`, `command:reset` | Saves session context to `memory/` |
| `bootstrap-extra-files` | `agent:bootstrap` | Injects additional bootstrap files |
| `command-logger` | `command` | Logs commands to `commands.log` |
| `boot-md` | `gateway:startup` | Runs `BOOT.md` on startup |

## Configuration

```json
{
  "hooks": {
    "internal": {
      "enabled": true,
      "entries": {
        "session-memory": { "enabled": true },
        "command-logger": { "enabled": false }
      }
    }
  }
}
```
