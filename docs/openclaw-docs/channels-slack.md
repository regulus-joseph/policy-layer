# Slack Channel

Connect OpenClaw to Slack via a Slack app.

## Quick Setup

1. Create app at https://api.slack.com/apps
2. Choose Socket Mode (default) or HTTP Request URLs
3. Generate App-Level Token (`xapp-...`) with `connections:write`
4. Install app, copy Bot Token (`xoxb-...`)
5. Configure:

```json5
{
  channels: {
    slack: {
      enabled: true,
      mode: "socket",
      appToken: "xapp-...",
      botToken: "xoxb-...",
    },
  },
}
```

Socket Mode env fallback: `SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`

## DM Policy

- `pairing` (default)
- `allowlist` — only `allowFrom` users
- `open` — requires `allowFrom: ["*"]`
- `disabled`

## Channel Policy

- `groupPolicy: "allowlist"` — list channels under `channels.slack.channels`
- `requireMention` controls mention gating
- Use channel IDs (stable) not names

## Features

- Native slash commands (opt-in per manifest)
- Text streaming (partial, block, progress modes)
- Thread sessions with history
- Interactive reply buttons (`[[slack_buttons:]]`)
- File uploads/downloads
- Reactions, pins, emoji
- Exec approvals with native button UI
- Interactive replies (opt-in)

## Streaming Modes

| Mode | Behavior |
| `off` | No preview |
| `partial` (default) | Edit preview message |
| `block` | Append chunked updates |
| `progress` | Show progress status |

## Manifest Scopes

Required: `app_mentions:read`, `channels:history`, `chat:write`, `files:read`, `files:write`, `groups:history`, `im:history`, `reactions:read`, `reactions:write`, `users:read`
