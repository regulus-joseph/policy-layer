# Exec Approvals

Safety interlock for running shell commands on the gateway or node host. Commands allowed only when policy + allowlist + user approval all agree.

## Policy Knobs

### Security
- `deny` — block all host exec
- `allowlist` — only allowlisted commands
- `full` — allow everything (skip approvals)

### Ask
- `off` — never prompt
- `on-miss` — prompt only when allowlist doesn't match
- `always` — prompt on every command

### Ask Fallback
When prompt needed but no UI reachable:
- `deny` — block
- `allowlist` — allow if matched
- `full` — allow

## Inline Eval Hardening

Enable `strictInlineEval` so inline eval forms (`python -c`, `node -e`, etc.) need approval even if interpreter is allowlisted.

## Allowlist (per agent)

```json
{
  "agents": {
    "main": {
      "security": "allowlist",
      "allowlist": [
        { "pattern": "~/Projects/**/bin/rg" }
      ]
    }
  }
}
```

## Safe Bins

Stdin-only binaries that run without approval by default: `cut`, `uniq`, `head`, `tail`, `tr`, `wc`

Do NOT add interpreters to safe bins.

## YOLO Mode

For no-approval host exec:
```bash
openclaw exec-policy preset yolo
```
Updates both config + local `exec-approvals.json`.

## Commands

```bash
openclaw approvals get          # Show effective policy
openclaw approvals set          # Set approvals config
openclaw exec-policy show       # Local merged view
openclaw exec-policy set        # Sync local policy
```

## Chat Approvals

Forward exec approval prompts to chat channels:

```json5
{
  approvals: {
    exec: {
      enabled: true,
      mode: "session",
      agentFilter: ["main"],
      targets: [
        { channel: "slack", to: "U12345678" },
        { channel: "telegram", to: "123456789" },
      ],
    },
  },
}
```

Approve with: `/approve <id> allow-once|allow-always|deny`
