# Gateway

The Gateway is the background service that powers OpenClaw.

## Commands

```bash
openclaw gateway start      # Start gateway (default: daemon mode)
openclaw gateway stop       # Stop gateway
openclaw gateway restart    # Restart gateway
openclaw gateway status     # Check if running
openclaw gateway logs       # View logs
openclaw gateway logs -f    # Follow logs
openclaw gateway logs --err # Errors only
openclaw gateway info       # Gateway info and health
```

## Architecture

The gateway exposes:
- A local HTTP server (default: `127.0.0.1:18789`)
- ACP (Agent Communication Protocol) over TCP (default: `127.0.0.1:18790`)
- WebSocket endpoint (default: `ws://127.0.0.1:18789/ws`)

## Health Endpoint

```bash
curl http://127.0.0.1:18789/health
```

## WebSocket

```bash
wscat --connect ws://127.0.0.1:18789/ws
```

## Configuration

```json5
{
  gateway: {
    mode: "local",
    port: 18789,
    bind: "loopback",
    auth: {
      mode: "token",
      token: "your-token",
      allowTailscale: true,
    },
  },
}
```

## Modes

| Mode | Description |
| `local` | Local-only access (default) |
| `network` | Accessible on LAN |
| `cloud` | Cloud-hosted |
