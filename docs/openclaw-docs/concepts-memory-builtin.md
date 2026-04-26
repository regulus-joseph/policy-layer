# Builtin Memory Engine

Default memory backend using SQLite. Works out of the box.

## Features

- **Keyword search** via FTS5 (BM25 scoring)
- **Vector search** via embeddings from any provider
- **Hybrid search** combining both
- **CJK support** via trigram tokenization
- **sqlite-vec** for in-database vector queries (optional)

## Auto-Detection

Auto-detects API keys for: OpenAI, Gemini, Voyage, Mistral. No config needed.

To set explicitly:

```json5
{
  agents: {
    defaults: {
      memorySearch: { provider: "openai" },
    },
  },
}
```

## Supported Providers

| Provider | Auto-detect | Notes |
| OpenAI | Yes | Default: text-embedding-3-small |
| Gemini | Yes | Multimodal (image + audio) |
| Voyage | Yes | |
| Mistral | Yes | |
| Ollama | No | Local, set explicitly |
| Local | Yes | Optional node-llama-cpp runtime |

## Indexing

- Location: `~/.openclaw/memory/<agentId>.sqlite`
- File watcher auto-reindexes on changes (1.5s debounce)
- Auto-reindex when config changes
- `openclaw memory index --force` for manual rebuild

## Local Embeddings

Install `node-llama-cpp`, then:

```json5
{
  agents: {
    defaults: {
      memorySearch: {
        provider: "local",
        local: { modelPath: "~/.node-llama-cpp/models/embedding.gguf" },
      },
    },
  },
}
```

## When to Use

Builtin is right for most users. Switch to QMD for reranking/query expansion or Honcho for cross-session memory.
