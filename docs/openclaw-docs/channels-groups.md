# Groups

Group/room chat behavior across Discord, WhatsApp, Telegram, Signal, Slack, Matrix, iMessage, Microsoft Teams.

## Quick Pattern

```
groupPolicy? disabled → drop
groupPolicy? allowlist → group allowed? no → drop
requireMention? yes → mentioned? no → store for context only
otherwise → reply
```

## Group Policy Options

| Policy | Behavior |
| `disabled` | Block all group messages |
| `allowlist` | Only configured groups allowed |
| `open` | All groups allowed, mention gating still applies |

## DM vs Group Access

- **DM**: controlled by `dmPolicy` + `allowFrom`
- **Group**: controlled by `groupPolicy` + `groups.*` + `groupAllowFrom`

## Mention Gating

Groups require mention by default. Options:

```json5
{
  channels: {
    whatsapp: {
      groups: {
        "*": { requireMention: true },
        "123@g.us": { requireMention: false },
      },
    },
  },
}
```

## Session Isolation

Group sessions: `agent:<agentId>:<channel>:group:<id>`
Forum topics (Telegram): `:topic:<threadId>` appended

## Pattern: DMs on Host, Groups Sandboxed

```json5
{
  agents: {
    defaults: {
      sandbox: {
        mode: "non-main", // groups = non-main → sandboxed
        scope: "session",
        workspaceAccess: "none",
      },
    },
  },
  tools: {
    sandbox: {
      tools: {
        allow: ["group:messaging", "group:sessions"],
        deny: ["group:runtime", "group:fs", "nodes", "cron", "gateway"],
      },
    },
  },
}
```

## Activation

Owner can toggle: `/activation mention` or `/activation always`
