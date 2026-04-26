# Sandboxing

Run tools inside sandbox backends to reduce blast radius. Optional, controlled via config.

## Modes

| Mode | When |
| `off` | No sandboxing |
| `non-main` | Sandbox non-main sessions (default) |
| `all` | Every session in sandbox |

Scope: `agent` (one container/agent), `session` (one container/session), or `shared` (one container shared).

## Backends

| Backend | Where | Browser | Setup |
| Docker | Local container | Yes | `scripts/sandbox-setup.sh` |
| SSH | Remote machine | No | SSH key + host |
| OpenShell | Managed remote | No | OpenShell plugin |

## Workspace Access

- `"none"` (default): sandbox workspace under `~/.openclaw/sandboxes`
- `"ro"`: mounts agent workspace read-only at `/agent`
- `"rw"`: mounts agent workspace read/write at `/workspace`

## Bind Mounts

```json5
{
  agents: {
    defaults: {
      sandbox: {
        docker: {
          binds: ["/home/user/source:/source:ro", "/var/data:/data:ro"],
        },
      },
    },
  },
}
```

- Dangerous bind sources blocked (`docker.sock`, `/etc`, etc.)
- `:ro` recommended for sensitive mounts

## Custom Image

```bash
scripts/sandbox-setup.sh        # Default: openclaw-sandbox:bookworm-slim
scripts/sandbox-common-setup.sh # With curl, jq, nodejs, python3, git
scripts/sandbox-browser-setup.sh # With Chromium
```

## Quick Enable

```json5
{
  agents: {
    defaults: {
      sandbox: {
        mode: "non-main",
        scope: "session",
        workspaceAccess: "none",
      },
    },
  },
}
```

## Setup Command

`setupCommand` runs once after container creation:

```json5
{
  agents: {
    defaults: {
      sandbox: {
        docker: {
          setupCommand: "apt-get update && apt-get install -y curl jq",
        },
      },
    },
  },
}
```

Requires: writable root FS, root user, and network egress.
