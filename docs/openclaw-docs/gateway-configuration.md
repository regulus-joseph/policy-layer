# Configuration

OpenClaw reads an optional JSON5 config from `~/.openclaw/openclaw.json`. If missing, safe defaults apply.

## Quick Setup

```bash
openclaw onboard       # Full onboarding flow
openclaw configure     # Config wizard
```

## Config Methods

| Method | Command |
| `openclaw config set <path> <value>` | Set individual fields |
| `openclaw config get <path>` | Get a value |
| `openclaw config unset <path>` | Remove a field |
| Edit raw `~/.openclaw/openclaw.json` | Direct edit with hot reload |

## Config Hot Reload

| Mode | Behavior |
| `hybrid` (default) | Hot-apply safe changes, auto-restart for critical ones |
| `hot` | Hot-apply only, log warning for restart-needed changes |
| `restart` | Restart on any change |
| `off` | Manual restart only |

```json5
{ gateway: { reload: { mode: "hybrid", debounceMs: 300 } } }
```

## Environment Variables

- `.env` from current directory or `~/.openclaw/.env`
- Inline env: `"${VAR_NAME}"` substitution in config strings
- Secrets: `{ source: "env", id: "KEY_NAME" }` for sensitive values

## $include

Split config into multiple files:

```json5
{
  gateway: { port: 18789 },
  agents: { $include: "./agents.json5" },
  plugins: { $include: ["./clients/a.json5", "./clients/b.json5"] },
}
```

## Strict Validation

- Gateway refuses to start with invalid config
- Invalid config is saved as `.clobbered.*`, last-known-good is restored
- `openclaw config schema` prints the JSON Schema
- `openclaw doctor --fix` auto-repairs issues

## Common Tasks

- **Channels**: `channels.<provider>` config (discord, telegram, slack, etc.)
- **Models**: `agents.defaults.model.primary` + `agents.defaults.model.fallbacks`
- **Access control**: `dmPolicy` / `groupPolicy` per channel
- **Multi-agent**: `agents.list[]` + `bindings[]`
- **Cron**: `cron.enabled: true`
- **Hooks**: `hooks.enabled: true` + `hooks.mappings[]`
- **Sandboxing**: `agents.defaults.sandbox.mode: "non-main"`

Full reference: [Configuration Reference](/gateway/configuration-reference)
