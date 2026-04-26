# Pairing

OpenClaw uses explicit pairing for two purposes: **DM access** and **node device pairing**.

## DM Pairing

When a channel has `dmPolicy: "pairing"`, unknown senders get a one-time code. Messages are not processed until you approve.

### Approve

```bash
openclaw pairing list <channel>
openclaw pairing approve <channel> <CODE>
```

### Pairing Codes

- 8 characters, uppercase, no ambiguous chars
- Expires after 1 hour
- Max 3 pending requests per channel

### State Storage

- Pending: `~/.openclaw/credentials/<channel>-pairing.json`
- Approved: `~/.openclaw/credentials/<channel>-allowFrom.json`

## Node Device Pairing

Nodes (iOS/Android/macOS/headless) connect to the Gateway as paired devices.

### Pair via Telegram (recommended for iOS)

1. `/pair` in Telegram → get setup code
2. Paste in OpenClaw app → Settings → Gateway
3. `/pair pending` → review request
4. `/pair approve <requestId>`

### Approve via CLI

```bash
openclaw devices list
openclaw devices approve <requestId>
openclaw devices reject <requestId>
```

### Auto-Approve Nodes (CIDR)

```json5
{
  gateway: {
    nodes: {
      pairing: {
        autoApproveCidrs: ["192.168.1.0/24"],
      },
    },
  },
}
```

Only for first-time `role: node` with no scopes. Does not auto-approve role/scope upgrades.

### State Storage

- Pending: `~/.openclaw/devices/pending.json`
- Paired: `~/.openclaw/devices/paired.json`
