# Skills

AgentSkills-compatible skill folders that teach the agent how to use tools. Each skill is a directory with a `SKILL.md` containing YAML frontmatter + instructions.

## Locations (precedence)

1. `<workspace>/skills` (highest)
2. `<workspace>/.agents/skills`
3. `~/.agents/skills`
4. `~/.openclaw/skills`
5. Bundled skills
6. `skills.load.extraDirs` (lowest)

## Per-Agent Allowlists

```json5
{
  agents: {
    defaults: { skills: ["github", "weather"] },
    list: [
      { id: "writer" },          // inherits github, weather
      { id: "docs", skills: ["docs-search"] },  // replaces defaults
      { id: "locked", skills: [] },  // no skills
    ],
  },
}
```

## SKILL.md Format

```markdown
---
name: image-lab
description: Generate or edit images via provider workflow
metadata:
  {
    "openclaw": {
      "requires": { "bins": ["uv"], "env": ["GEMINI_API_KEY"] },
      "primaryEnv": "GEMINI_API_KEY",
    },
  }
---

Instructions here...
```

## Gating Fields

- `always: true` — always include
- `requires.bins` — PATH binaries needed
- `requires.env` — env vars needed
- `requires.config` — config paths needed
- `os` — platform filter

## Bundled Skills

`graphify`, `peekaboo`, and more. Install from ClawHub: `openclaw skills install <slug>`

## Config

```json5
{
  skills: {
    entries: {
      "image-lab": {
        enabled: true,
        apiKey: { source: "env", id: "GEMINI_API_KEY" },
      },
    },
  },
}
```
