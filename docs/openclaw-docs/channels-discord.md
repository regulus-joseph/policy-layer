# Discord Channel

Connect OpenClaw to Discord via a bot account.

## Quick Setup

1. Create Discord app + bot at https://discord.com/developers/applications
2. Enable **Message Content Intent** and **Server Members Intent**
3. Copy bot token → set as `DISCORD_BOT_TOKEN` env var or config
4. Configure:

```json5
{
  channels: {
    discord: {
      enabled: true,
      token: { source: "env", id: "DISCORD_BOT_TOKEN" },
      groupPolicy: "allowlist",
      guilds: {
        "YOUR_SERVER_ID": {
          requireMention: true,
          users: ["YOUR_USER_ID"],
        },
      },
    },
  },
}
```

5. Start gateway, DM the bot, get pairing code, approve with `openclaw pairing approve discord <CODE>`

## DM Policy

- `pairing` (default) — unknown users get one-time pairing code
- `allowlist` — only `allowFrom` senders
- `open` — requires `allowFrom: ["*"]`
- `disabled` — ignore DMs

## Guild Access

- `groupPolicy: "allowlist"` (secure default)
- Add guilds under `channels.discord.guilds`
- `requireMention: false` for no-mention responses
- Role-based routing via `bindings[].match.roles`

## Features

- Voice channels (realtime + voice messages)
- Forum/media channel threads
- Interactive components (buttons, selects, modals)
- Reaction notifications
- Presence/status control
- PluralKit support
- Exec approvals
- Thread-bound ACP sessions

## Commands

```bash
openclaw channels discord setup
openclaw channels discord test
```
