# OAuth

OpenClaw supports OAuth for providers that offer it (notably OpenAI Codex).

## Token Storage

Per-agent auth profiles: `~/.openclaw/agents/<agentId>/agent/auth-profiles.json`

Legacy: `~/.openclaw/credentials/oauth.json`

## Supported Flows

### OpenAI Codex OAuth

PKCE flow:
1. Generate PKCE verifier/challenge + state
2. Open browser to authorize
3. Capture callback on `http://127.0.0.1:1455/auth/callback` (or paste redirect URL)
4. Exchange at `https://auth.openai.com/oauth/token`
5. Store `{ access, refresh, expires, accountId }`

### Anthropic

- API key: normal billing
- Claude CLI reuse: supported

## Multiple Accounts

Two patterns:

1. **Separate agents** (preferred): isolate personal + work completely
2. **Multiple profiles**: `auth-profiles.json` supports multiple profile IDs per provider

Profile routing:
- Global: `auth.order[provider]`
- Per-session: `/model ...@<profileId>`

## CLI Commands

```bash
openclaw models auth login --provider <id>
openclaw models status    # Shows OAuth expiry
```

## Refresh

Automatic. Profiles store `expires` timestamp. Expired → auto-refresh under file lock.

## Related

- [Model Failover](/concepts/model-failover) — rotation + cooldowns
- [Secrets](/gateway/secrets) — credential storage
