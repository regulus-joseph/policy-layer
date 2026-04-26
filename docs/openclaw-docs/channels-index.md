# Channel Reference

Channels are how the gateway connects to the outside world.

## Supported Channels

| Channel | Package | Commands |
| `discord` | `openclaw-plugin-discord` | `openclaw channels discord` |
| `telegram` | `openclaw-plugin-telegram` | `openclaw channels telegram` |
| `slack` | `openclaw-plugin-slack` | `openclaw channels slack` |
| `whatsapp` | `openclaw-plugin-whatsapp` | `openclaw channels whatsapp` |
| `matrix` | `openclaw-plugin-matrix` | `openclaw channels matrix` |
| `email` | `openclaw-plugin-email` | `openclaw channels email` |
| `sms` | `openclaw-plugin-twilio` | `openclaw channels twilio` |

## Configuration

```json5
{
  channels: {
    enabled: true,
    entries: {
      discord: {
        enabled: true,
        botToken: { source: "env", id: "DISCORD_BOT_TOKEN" },
        config: {
          guild: "auto",
          voice: false,
        },
      },
    },
  },
}
```

## Commands

```bash
openclaw channels list           # List configured channels
openclaw channels info <name>    # Channel details
openclaw channels test <name>   # Send test message
openclaw channels disable <name> # Disable channel
openclaw channels enable <name>  # Enable channel
```

## Channel Capabilities

| Channel | Text | Voice | Media | Groups | Threads |
| Discord | Yes | Yes | Yes | Yes | Yes |
| Telegram | Yes | Yes | Yes | Yes | Yes |
| Slack | Yes | No | Yes | Yes | Yes |
| WhatsApp | Yes | Yes | Yes | No | No |
| Matrix | Yes | Yes | Yes | Yes | Yes |
