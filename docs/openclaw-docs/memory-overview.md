# Memory

OpenClaw remembers things via plain Markdown files in the workspace.

## Memory Files

| File | Purpose |
| `MEMORY.md` | Long-term memory — loaded at start of every DM session |
| `memory/YYYY-MM-DD.md` | Daily notes — today + yesterday auto-loaded |
| `DREAMS.md` | Dream Diary for human review |

## Memory Tools

- **`memory_search`** — semantic search across memory
- **`memory_get`** — read specific file or line range

Both provided by the active memory plugin (default: `memory-core`).

## Memory Search

Hybrid search (vector similarity + keyword matching) when embedding provider is configured.
Auto-detects: OpenAI, Gemini, Voyage, Mistral API keys.

## Backends

| Backend | Description |
| Builtin (default) | SQLite-based, works out of the box |
| QMD | Local-first sidecar with reranking, query expansion |
| Honcho | AI-native cross-session memory, multi-agent awareness |

## Memory Wiki Plugin

Compiles durable memory into a wiki vault with structured claims, dashboards, and Obsidian-friendly workflows. Adds `wiki_search`, `wiki_get`, `wiki_apply`, `wiki_lint` tools.

## Automatic Memory Flush

Before compaction, OpenClaw silently reminds the agent to save important context to memory files.

## Dreaming

Opt-in background consolidation:
- Scheduled via `memory-core` cron job
- Scores and promotes qualified items to `MEMORY.md`
- Phase summaries written to `DREAMS.md` for review
- Gate: score, recall frequency, query diversity

## CLI

```bash
openclaw memory status          # Check index status
openclaw memory search "query"  # Search from CLI
openclaw memory index --force    # Rebuild index
```

## Configuration

See [Memory configuration reference](/reference/memory-config) for all config knobs.
