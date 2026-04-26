# Automation & Tasks

OpenClaw runs background work through tasks, scheduled jobs, hooks, and standing instructions.

## Decision Guide

| What do you need? | Recommended |
| Schedule work? | Cron |
| Track detached work? | Background Tasks |
| Orchestrate multi-step flows? | Task Flow |
| React to lifecycle events? | Hooks |
| Give agent persistent instructions? | Standing Orders |

## Scheduled Tasks (Cron)

Precise timing with cron expressions.

```bash
# Add a one-shot reminder
openclaw cron add \
  --name "Reminder" \
  --at "2026-02-01T16:00:00Z" \
  --session main \
  --system-event "Check the docs draft"

# Recurring job
openclaw cron add \
  --name "Morning brief" \
  --cron "0 7 * * *" \
  --tz "America/Los_Angeles" \
  --session isolated \
  --message "Summarize overnight updates." \
  --announce --channel slack --to "channel:C1234567890"
```

## Background Tasks

Task ledger tracks all detached work.

```bash
openclaw tasks list
openclaw tasks audit
openclaw tasks show <task-id>
openclaw tasks cancel <task-id>
```

## Task Flow

Durable multi-step orchestration with revision tracking.

```bash
openclaw tasks flow list
openclaw tasks flow show <flow-id>
openclaw tasks flow cancel <flow-id>
```

## Hooks

Event-driven scripts triggered by lifecycle events.

```bash
openclaw hooks list
openclaw hooks enable session-memory
openclaw hooks info boot-md
```

## Standing Orders

Persistent instructions in workspace files (typically `AGENTS.md`).

## Heartbeat

Periodic main-session turns (default: every 30 min).

```json5
{
  agents: {
    defaults: {
      heartbeat: {
        every: "30m",
        model: "openai/gpt-5.4-mini",
        includeReasoning: false,
      },
    },
  },
}
```

## How They Work Together

- **Cron**: exact schedules, isolated executions
- **Heartbeat**: approximate monitoring, full session context
- **Hooks**: event-specific scripts
- **Standing orders**: persistent context and authority
- **Task Flow**: multi-step coordination
- **Tasks**: track all detached work
