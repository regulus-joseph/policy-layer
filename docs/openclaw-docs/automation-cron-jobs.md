# Scheduled Tasks (Cron)

Cron is the Gateway's built-in scheduler for precise timing.

## Quick Start

```bash
# One-shot reminder
openclaw cron add \
  --name "Reminder" \
  --at "2026-02-01T16:00:00Z" \
  --session main \
  --system-event "Reminder: check the cron docs draft" \
  --wake now \
  --delete-after-run

# Recurring isolated job
openclaw cron add \
  --name "Morning brief" \
  --cron "0 7 * * *" \
  --tz "America/Los_Angeles" \
  --session isolated \
  --message "Summarize overnight updates." \
  --announce --channel slack --to "channel:C1234567890"
```

## Schedule Types

| Kind | Flag | Description |
| `at` | `--at` | One-shot timestamp |
| `every` | `--every` | Fixed interval |
| `cron` | `--cron` | Cron expression |

## Execution Styles

| Style | Session | Best for |
| `main` | Next heartbeat | Reminders |
| `isolated` | Fresh session | Reports, background chores |
| `current` | Bound at creation | Context-aware recurring |
| `session:xxx` | Persistent named | Workflows that build on history |

## Delivery Modes

| Mode | What happens |
| `announce` | Fallback-deliver to channel |
| `webhook` | POST to URL |
| `none` | No fallback delivery |

## Management

```bash
openclaw cron list
openclaw cron show <job-id>
openclaw cron runs --id <job-id>
openclaw cron edit <job-id> --message "Updated prompt"
openclaw cron rm <job-id>
openclaw cron run <job-id>
```

## Webhooks

```bash
openclaw webhooks gmail setup --account you@example.com
openclaw webhooks gmail run
```

### POST /hooks/wake
```bash
curl -X POST http://127.0.0.1:18789/hooks/wake \
  -H 'Authorization: Bearer SECRET' \
  -d '{"text":"New email received","mode":"now"}'
```

### POST /hooks/agent
```bash
curl -X POST http://127.0.0.1:18789/hooks/agent \
  -H 'Authorization: Bearer SECRET' \
  -d '{"message":"Summarize inbox","model":"openai/gpt-5.4"}'
```

## Configuration

```json5
{
  cron: {
    enabled: true,
    maxConcurrentRuns: 2,
    sessionRetention: "24h",
    runLog: { maxBytes: "2mb", keepLines: 2000 },
  },
}
```
