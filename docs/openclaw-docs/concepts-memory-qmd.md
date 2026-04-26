# QMD Memory Engine

Local-first search sidecar with BM25 + vector search + reranking.

## What It Adds Over Builtin

- Reranking and query expansion for better recall
- Index extra directories (project docs, notes)
- Index session transcripts
- Fully local (no API keys)

## Setup

```bash
npm install -g @tobi/qlu
# Ensure SQLite allows extensions
```

Enable:
```json5
{
  memory: {
    backend: "qmd",
  },
}
```

OpenClaw manages the sidecar lifecycle automatically.

## Index Extra Paths

```json5
{
  memory: {
    backend: "qmd",
    qmd: {
      paths: [
        { name: "docs", path: "~/notes", pattern: "**/*.md" },
      ],
    },
  },
}
```

## Index Session Transcripts

```json5
{
  memory: {
    backend: "qmd",
    qmd: {
      sessions: { enabled: true },
    },
  },
}
```

## Search Scope

Default: direct + channel sessions only. Groups denied.

```json5
{
  memory: {
    qmd: {
      scope: {
        default: "deny",
        rules: [{ action: "allow", match: { chatType: "direct" } }],
      },
    },
  },
}
```

## Citations

```json5
{ memory: { citations: "on" } }  // Shows "Source: <path#line>"
```

## When to Use

Choose QMD when you need reranking, extra directories, or session transcript recall.
Built-in is simpler for basic needs.
