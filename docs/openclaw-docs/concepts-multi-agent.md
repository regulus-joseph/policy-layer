# Multi-Agent

Run multiple isolated agents — each with own workspace, auth, and session store — in one gateway. Bindings route inbound messages to agents.

## Agent Architecture

An **agent** = fully scoped brain:
- **Workspace**: files, AGENTS.md, SOUL.md, USER.md
- **agentDir**: `~/.openclaw/agents/<agentId>/agent/` — auth profiles, model registry, per-agent config
- **Session store**: `~/.openclaw/agents/<agentId>/sessions/`

## Quick Start

```bash
openclaw agents add coding
openclaw agents add social
```

Each agent gets its own workspace, agentDir, and session store.

## Bindings (routing)

Bindings map `(channel, accountId, peer)` to an agentId:

```json5
{
  bindings: [
    { agentId: "main", match: { channel: "whatsapp", accountId: "personal" } },
    { agentId: "work", match: { channel: "whatsapp", accountId: "biz" } },
  ],
}
```

Routing order (most-specific wins):
1. `peer` match (exact DM/group/channel id)
2. `parentPeer` (thread inheritance)
3. `guildId + roles` (Discord role routing)
4. `guildId` (Discord)
5. `teamId` (Slack)
6. `accountId` match
7. channel-level match
8. fallback to default agent

## Per-Agent Config

Each agent can have its own model, sandbox, and tool restrictions:

```json5
{
  agents: {
    list: [
      {
        id: "family",
        workspace: "~/.openclaw/workspace-family",
        sandbox: { mode: "all", scope: "agent" },
        tools: {
          allow: ["exec", "read", "sessions_list"],
          deny: ["write", "browser", "cron"],
        },
      },
    ],
  },
}
```

## Multi-Account Routing

Route different WhatsApp DMs to different agents by sender E.164:

```json5
{
  bindings: [
    { agentId: "alex", match: { channel: "whatsapp", peer: { kind: "direct", id: "+15551230001" } } },
    { agentId: "mia", match: { channel: "whatsapp", peer: { kind: "direct", id: "+15551230002" } } },
  ],
}
```

## Cross-Agent Memory Search

Share QMD session transcripts across agents:

```json5
{
  agents: {
    defaults: {
      memorySearch: {
        qmd: { extraCollections: [{ path: "~/agents/family/sessions", name: "family-sessions" }] },
      },
    },
  },
}
```

## Commands

```bash
openclaw agents list
openclaw agents add <name>
openclaw agents list --bindings
```
