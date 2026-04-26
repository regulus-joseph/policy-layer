# Agent Workspace

The workspace is the agent's home directory for file tools and context.

## Default Location

- Default: `~/.openclaw/workspace`
- Override: `agents.defaults.workspace` in config

## Bootstrap Files

| File | Purpose |
| `AGENTS.md` | Operating instructions, loaded every session |
| `SOUL.md` | Persona, tone, boundaries |
| `USER.md` | Who the user is |
| `IDENTITY.md` | Agent name, emoji |
| `TOOLS.md` | Local tools and conventions |
| `HEARTBEAT.md` | Heartbeat checklist |
| `BOOT.md` | Startup checklist (when hooks enabled) |
| `memory/` | Daily memory files `YYYY-MM-DD.md` |
| `MEMORY.md` | Curated long-term memory |

## Git Backup

```bash
cd ~/.openclaw/workspace
git init
git add AGENTS.md SOUL.md TOOLS.md IDENTITY.md USER.md HEARTBEAT.md memory/
git commit -m "Initial"
# Add private remote (GitHub/GitLab)
git remote add origin <url>
git push -u origin main
```

## Not in Workspace

These live under `~/.openclaw/`:
- `openclaw.json` (config)
- `auth-profiles.json` (model credentials)
- `credentials/` (channel state)
- `sessions/` (transcripts)
- `skills/` (managed skills)

## Do NOT Commit

- API keys, tokens, passwords
- Anything under `~/.openclaw/`
- Raw chat dumps

## Moving Workspace

1. Clone repo to new path
2. Set `agents.defaults.workspace` to new path
3. Run `openclaw setup --workspace <path>`
4. Copy `sessions/` separately if needed
