# WhatsApp Channel

Connect OpenClaw to WhatsApp via WhatsApp Web (Baileys).

## Quick Setup

```bash
openclaw channels login --channel whatsapp
```

First time prompts to install the WhatsApp plugin automatically.

## Config

```json5
{
  channels: {
    whatsapp: {
      dmPolicy: "pairing",
      allowFrom: ["+15551234567"],
      groupPolicy: "allowlist",
      groupAllowFrom: ["+15551234567"],
    },
  },
}
```

## DM Policy

- `pairing` (default)
- `allowlist` — E.164 numbers in `allowFrom`
- `open` — requires `allowFrom: ["*"]`
- `disabled`

## Group Policy

- `groupPolicy: "allowlist"` (default)
- Add groups under `channels.whatsapp.groups`
- `requireMention: true` by default
- `groupAllowFrom` filters senders

## Features

- Voice notes (TTS as PTT)
- Media placeholders
- Read receipts
- Reply quoting
- Reaction level control
- Multi-account via `channels.whatsapp.accounts`
- Per-group/per-direct system prompts
- Plugin hooks (opt-in for privacy)

## Message Actions

`react`, `send`, `read`, etc.

## Troubleshooting

| Issue | Fix |
| Not linked | `openclaw channels login --channel whatsapp` |
| Disconnected | `openclaw doctor`, check logs |
| Group ignored | Check `groupPolicy`, `groupAllowFrom`, `requireMention` |
