# Memory Search

`memory_search` finds relevant notes using embeddings and keyword matching.

## How It Works

Two retrieval paths run in parallel and merge:
1. **Vector search** — semantic similarity (embedding model)
2. **BM25 keyword search** — exact term matching

If only one path is available, it runs alone.

## Providers

| Provider | API Key | Auto-detect |
| OpenAI | Yes | Yes |
| Gemini | Yes | Yes (multimodal) |
| Voyage | Yes | Yes |
| Mistral | Yes | Yes |
| GitHub Copilot | No | Yes |
| Ollama | No | No (local) |
| Local | No | No (GGUF) |
| Bedrock | No | Yes (AWS creds) |

## Improving Quality

### Temporal Decay
Old notes lose ranking weight so recent info surfaces first. Half-life: 30 days.

```json5
{
  agents: {
    defaults: {
      memorySearch: {
        query: { hybrid: { temporalDecay: { enabled: true } } },
      },
    },
  },
}
```

### MMR (Diversity)
Reduces redundant results. Ensures top results cover different topics.

```json5
{
  agents: {
    defaults: {
      memorySearch: {
        query: { hybrid: { mmr: { enabled: true } } },
      },
    },
  },
}
```

## Multimodal Memory
Gemini Embedding 2 can index images and audio alongside Markdown. Search queries remain text but match visual/audio content.

## CLI

```bash
openclaw memory status          # Check index
openclaw memory index --force    # Rebuild index
```
