# Skills

Skills are optional agent capabilities that can be installed and managed.

## Commands

```bash
openclaw skills list              # List all skills
openclaw skills available         # List installable skills
openclaw skills install <name>    # Install a skill
openclaw skills uninstall <name> # Remove a skill
openclaw skills info <name>      # Show skill details
openclaw skills update <name>    # Update skill
openclaw skills update --all     # Update all
```

## Bundled Skills

| Skill | Description |
| `graphify` | Knowledge graph from any input |
| `peekaboo` | Screenshot capture tool |

## Configuration

```json5
{
  skills: {
    allowBundled: ["graphify", "peekaboo"],
    load: {
      extraDirs: ["~/Projects/agent-scripts/skills"],
    },
    install: {
      preferBrew: true,
      nodeManager: "npm",
    },
    entries: {
      "image-lab": {
        apiKey: { source: "env", provider: "default", id: "GEMINI_API_KEY" },
      },
      peekaboo: { enabled: true },
    },
  },
}
```

## Skill Manifest

Each skill has a `SKILL.md` at its root that declares:
- `name` — skill identifier
- `description` — what it does
- `triggers` — when it activates
- `commands` — available subcommands
