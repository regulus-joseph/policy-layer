# Telegram Channel

Connect OpenClaw to Telegram via a bot account.

## Quick Setup

1. Create bot via **@BotFather** in Telegram, save the token
2. Configure:

```json5
{
  channels: {
    telegram: {
      enabled: true,
      botToken: "123:abc",
      dmPolicy: "pairing",
      groups: { "*": { requireMention: true } },
    },
  },
}
```

3. Start gateway: `openclaw gateway`
4. DM the bot, get pairing code, approve: `openclaw pairing approve telegram <CODE>`

## DM Policy

- `pairing` (default)
- `allowlist` — requires `allowFrom` with numeric user IDs
- `open` — requires `allowFrom: ["*"]`
- `disabled`

## Group Policy

- `groupPolicy: "allowlist"` (default)
- Add groups under `channels.telegram.groups`
- `requireMention` controls mention gating
- Forum topics support per-topic agent routing via `topics[].agentId`

## Features

- Streaming previews (message edits as text arrives)
- Forum topics with per-topic agent routing
- Inline buttons and keyboard menus
- Voice notes and video messages
- Stickers (cached)
- Reaction notifications
- Thread behavior with `message_thread_id`
- Exec approvals
- Long polling (default) or webhook mode

## Message Actions

`sendMessage`, `react`, `deleteMessage`, `editMessage`, `createForumTopic`, `sticker`, `sticker-search`, `poll`

## Troubleshooting

- Bot not seeing group messages: check privacy mode (`/setprivacy` → Disable), bot needs to be admin or in same group
- Polling stalls: increase `pollingStallThresholdMs`, check DNS/IPv6, try `proxy` setting
