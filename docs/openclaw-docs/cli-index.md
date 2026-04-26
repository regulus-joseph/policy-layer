# OpenClaw CLI Reference - Main Index

`openclaw` is the main CLI entry point. Each core command has either a dedicated reference page or is documented with the command it aliases.

## Command Pages

| Area                 | Commands                                                                                                                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup and onboarding | `crestodian` · `setup` · `onboard` · `configure` · `config` · `completion` · `doctor` · `dashboard` |
| Reset and uninstall  | `backup` · `reset` · `uninstall` · `update` |
| Messaging and agents | `message` · `agent` · `agents` · `acp` · `mcp` |
| Health and sessions  | `status` · `health` · `sessions` |
| Gateway and logs     | `gateway` · `logs` · `system` |
| Models and inference | `models` · `infer` · `capability` · `memory` · `wiki` |
| Network and nodes    | `directory` · `nodes` · `devices` · `node` |
| Runtime and sandbox  | `approvals` · `exec-policy` · `sandbox` · `tui` · `chat`/`terminal` · `browser` |
| Automation           | `cron` · `tasks` · `hooks` · `webhooks` |
| Discovery and docs   | `dns` · `docs` |
| Pairing and channels | `pairing` · `qr` · `channels` |
| Security and plugins | `security` · `secrets` · `skills` · `plugins` · `proxy` |
| Legacy aliases       | `daemon` · `clawbot` |
| Plugins (optional)   | `voicecall` (if installed) |

## Global flags

| Flag | Purpose |
| `---` | `---` |
| `--dev` | Isolate state under `~/.openclaw-dev` and shift default ports |
| `--profile <name>` | Isolate state under `~/.openclaw-<name>` |
| `--container <name>` | Target a named container for execution |
| `--no-color` | Disable ANSI colors |
| `--update` | Shorthand for `openclaw update` |
| `-V`, `--version`, `-v` | Print version and exit |

## Output modes

- ANSI colors and progress indicators render only in TTY sessions
- OSC-8 hyperlinks render as clickable links where supported
- `--json` (and `--plain`) disables styling for clean output
- Long-running commands show a progress indicator (OSC 9;4 when supported)
