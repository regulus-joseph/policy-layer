# Security

OpenClaw assumes a **personal assistant trust model**: one trusted operator boundary per gateway.

## Quick Audit

```bash
openclaw security audit
openclaw security audit --deep
openclaw security audit --fix
```

## Hardened Baseline

```json5
{
  gateway: { mode: "local", bind: "loopback", auth: { mode: "token", token: "..." } },
  session: { dmScope: "per-channel-peer" },
  tools: {
    profile: "messaging",
    deny: ["group:automation", "group:runtime", "group:fs", "sessions_spawn", "sessions_send"],
    fs: { workspaceOnly: true },
    exec: { security: "deny", ask: "always" },
    elevated: { enabled: false },
  },
  channels: {
    whatsapp: { dmPolicy: "pairing", groups: { "*": { requireMention: true } } },
  },
}
```

## DM Policy Options

| Policy | Behavior |
| `pairing` | Unknown senders get one-time code (default) |
| `allowlist` | Only `allowFrom` senders |
| `open` | Requires `allowFrom: ["*"]` |
| `disabled` | Ignore DMs |

## Tool Blast Radius

- Run sensitive tools in sandbox (`agents.defaults.sandbox.mode: "all"`)
- Disable `exec`/`browser`/`web_fetch`/`web_search` unless needed
- Use strict tool allowlists per agent
- Prefer latest-generation instruction-hardened models for tool-enabled agents

## Gateway Auth

Token auth required by default. Generate with `openclaw doctor --generate-gateway-token`.

## Credential Storage

| Credential | Path |
| WhatsApp | `~/.openclaw/credentials/whatsapp/<accountId>/creds.json` |
| Model auth | `~/.openclaw/agents/<agentId>/agent/auth-profiles.json` |
| Pairing allowlists | `~/.openclaw/credentials/<channel>-allowFrom.json` |

## Key Rules

1. **Identity first**: lock down DMs (pairing/allowlists)
2. **Scope next**: sandbox, tool policy, mention gating
3. **Model last**: assume manipulation is possible; limit blast radius
4. Treat plugins as **trusted code** — only install from sources you trust
