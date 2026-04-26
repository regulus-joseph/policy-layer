# Configuration Reference

Core config reference for `~/.openclaw/openclaw.json` (JSON5 format).

## Top-Level Sections

### Channels
`channels.*` — per-channel config (Discord, Telegram, Slack, WhatsApp, etc.)

### Agents
`agents.defaults.*` — workspace, model, thinking, heartbeat, memory, media, skills, sandbox
`agents.list[]` — multiple agents with separate workspaces

### Sessions
`session.*` — lifecycle, compaction, pruning, DM isolation

### Tools
`tools.*` — profile, deny/allow lists, elevated mode, exec policy, sandbox

### Gateway
`gateway.*` — port, bind, auth, TLS, remote, trusted proxies, health checks

### Plugins
`plugins.*` — enabled plugins, allow/deny lists, per-plugin config

### Skills
`skills.*` — bundled allowlist, extra dirs, install prefs, per-skill config

### Memory
`memory.backend` — `builtin` (default) or `qmd`
`agents.defaults.memorySearch.*` — embedding provider, hybrid search, MMR

### MCP
`mcp.*` — server definitions

### Browser
`browser.*` — profiles, SSRF policy, sandbox browser

### UI
`ui.*` — seam color, assistant identity

### Hooks
`hooks.*` — enabled, token, path, mappings, Gmail integration

### Canvas
`canvasHost.*` — root, live reload

### Discovery
`discovery.mdns.*` — mDNS mode (minimal/full/off)

### Environment
`env.*` — inline env vars, shell env import

### Secrets
`secrets.providers.*` — env/file/exec providers

### Auth
`auth.profiles.*` — OAuth + API key profiles
`auth.order.*` — profile rotation order
`auth.cooldowns.*` — billing/auth cooldown tuning

### Logging
`logging.*` — level, file, console style, redaction

### Diagnostics
`diagnostics.*` — flags, OTEL export, cache trace

### Update
`update.*` — channel, auto-update

### ACP
`acp.*` — enabled, dispatch, stream, runtime

### CLI
`cli.*` — banner style

## Quick Links

- [Channels config](/gateway/config-channels)
- [Agents config](/gateway/config-agents)
- [Tools config](/gateway/config-tools)
- [Memory config](/reference/memory-config)
- [Slash commands](/tools/slash-commands)
