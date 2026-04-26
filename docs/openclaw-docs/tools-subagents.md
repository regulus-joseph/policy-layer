# Sub-agents

Background agent runs spawned from an existing session. Each runs in its own session and announces results back to the requester.

## Slash Commands

```
/subagents list          # List active sub-agents
/subagents kill <id>    # Stop a sub-agent
/subagents log <id>     # View logs
/subagents info <id>    # Show metadata
/subagents spawn <agentId> <task>  # Spawn a new sub-agent
```

Thread binding commands (Discord):
```
/focus <target>         # Bind thread to sub-agent
/unfocus               # Remove binding
/agents                # Show active runs
/session idle <dur>   # Set inactivity timeout
/session max-age <dur> # Set hard age cap
```

## Tool

`sessions_spawn` starts a sub-agent. Key params:

| Param | Default | Description |
| `task` | required | Task description |
| `runtime` | `subagent` | `subagent` or `acp` |
| `model` | inherit | Override model |
| `runTimeoutSeconds` | from config | Abort after N seconds |
| `thread` | `false` | Bind to channel thread |
| `mode` | `run` | `run` or `session` |
| `cleanup` | `keep` | Delete transcript after |
| `sandbox` | `inherit` | Require sandbox? |
| `context` | `isolated` | `isolated` or `fork` |

## Context Modes

| Mode | Use when |
| `isolated` | Fresh research, independent work (default) |
| `fork` | Needs current conversation context |

## Nested Sub-agents

Enable with `maxSpawnDepth: 2` (orchestrator pattern):

```json5
{
  agents: {
    defaults: {
      subagents: {
        maxSpawnDepth: 2,
        maxChildrenPerAgent: 5,
        maxConcurrent: 8,
      },
    },
  },
}
```

Depth 1 → orchestrator, Depth 2 → leaf workers.

## Concurrency

Sub-agents use dedicated `subagent` queue lane. `maxConcurrent` default: 8.
