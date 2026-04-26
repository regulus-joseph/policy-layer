# Session Management

Sessions organize conversations. Each message routes to a session based on its source.

## Routing

| Source | Session |
| Direct messages | Shared by default |
| Group chats | Isolated per group |
| Rooms/channels | Isolated per room |
| Cron jobs | Fresh per run |
| Webhooks | Isolated per hook |

## DM Isolation

Default: all DMs share one session (`dmScope: "main"`). For multi-user: use `dmScope: "per-channel-peer"` to isolate by sender.

```json5
{
  session: {
    dmScope: "per-channel-peer", // per-channel-peer | per-peer | per-account-channel-peer | main
  },
}
```

## Session Lifecycle

| Reset Type | Config | Trigger |
| Daily reset | `session.reset.mode: "daily"` + `atHour: 4` | 4am local time |
| Idle reset | `session.reset.idleMinutes: 120` | After N minutes inactive |
| Manual | `/new` or `/reset` | User command |

Both daily + idle: whichever expires first wins.

## State Location

- Store: `~/.openclaw/agents/<agentId>/sessions/sessions.json`
- Transcripts: `~/.openclaw/agents/<agentId>/sessions/<sessionId>.jsonl`

## Maintenance

```json5
{
  session: {
    maintenance: {
      mode: "enforce",
      pruneAfter: "30d",
      maxEntries: 500,
    },
  },
}
```

Preview: `openclaw sessions cleanup --dry-run`

## Commands

```bash
openclaw sessions list
openclaw sessions cleanup
openclaw sessions show <session-id>
```
