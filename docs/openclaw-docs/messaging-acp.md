# ACP Reference

ACP (Agent Communication Protocol) is the gateway's TCP protocol for agent-to-agent communication.

## Overview

- Transport: TCP (default port 18790)
- Protocol: ACP (Agent Communication Protocol)
- Routing: Sessions, agents, and channels
- Encryption: TLS on loopback by default

## ACP URLs

```bash
acp://localhost          # Local gateway (default)
acp://localhost:18790   # Explicit port
acp://host:port           # Remote gateway
```

## ACP Commands

```bash
openclaw acp --help
openclaw acp connect <url>   # Connect to peer gateway
openclaw acp disconnect <id> # Disconnect peer
openclaw acp list            # List peers
openclaw acp send <peer> --message "hello"
openclaw acp status          # Connection status
```

## ACP over TLS

```bash
openclaw acp connect tls://gateway.example.com:18790 \
  --cert /path/to/ca.crt
```

## Tunnel Mode

```bash
openclaw acp tunnel --serve --port 18790
openclaw acp tunnel --connect gateway.example.com:18790
```
