# Honcho Memory

[Honcho](https://honcho.dev) adds AI-native cross-session memory.

## What It Provides

- **Cross-session memory**: conversations persisted after every turn
- **User modeling**: automatic profiles for preferences, facts, communication style
- **Semantic search**: recall from past conversations
- **Multi-agent awareness**: parent agents track spawned sub-agents

## Tools

**Data retrieval (fast):**
- `honcho_context` — full user representation
- `honcho_search_conclusions` — semantic search over conclusions
- `honcho_search_messages` — find messages across sessions
- `honcho_session` — current session history

**Q&A (LLM-powered):**
- `honcho_ask` — ask about the user

## Setup

```bash
openclaw plugins install @honcho-ai/openclaw-honcho
openclaw honcho setup
openclaw gateway --force
```

## Configuration

```json5
{
  plugins: {
    entries: {
      "openclaw-honcho": {
        config: {
          apiKey: "your-api-key",  // omit for self-hosted
          workspaceId: "openclaw",
          baseUrl: "https://api.honcho.dev",  // or local server
        },
      },
    },
  },
}
```

## Migrating Existing Memory

`openclaw honcho setup` detects existing workspace files (`USER.md`, `MEMORY.md`, `IDENTITY.md`, etc.) and offers migration. Files are uploaded, originals never deleted.

## CLI

```bash
openclaw honcho status
openclaw honcho ask <question>
openclaw honcho search <query>
```

## Honcho vs Builtin

| | Builtin/QMD | Honcho |
| | --- | --- |
| Storage | Workspace Markdown | Dedicated service |
| Cross-session | Via memory files | Automatic |
| User modeling | Manual | Automatic |
| Search | Vector + keyword | Semantic |
| Multi-agent | Not tracked | Parent/child awareness |
