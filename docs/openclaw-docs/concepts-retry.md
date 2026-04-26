# Retry Policy

## Defaults

- Attempts: 3
- Max delay: 30000ms
- Jitter: 0.1 (10%)
- Provider min delays: Telegram 400ms, Discord 500ms

## Model Providers

- OpenClaw lets provider SDKs handle normal short retries
- For Anthropic/OpenAI (Stainless SDKs): caps SDK `retry-after` waits at 60s, then surfaces error for model failover
- Override: `OPENCLAW_SDK_RETRY_MAX_WAIT_SECONDS=0` to let SDKs honor long waits

## Per-Channel Config

```json5
{
  channels: {
    telegram: {
      retry: {
        attempts: 3,
        minDelayMs: 400,
        maxDelayMs: 30000,
        jitter: 0.1,
      },
    },
    discord: {
      retry: {
        attempts: 3,
        minDelayMs: 500,
        maxDelayMs: 30000,
        jitter: 0.1,
      },
    },
  },
}
```

## Notes

- Retries per request, not per multi-step flow
- Composite flows don't retry completed steps
- Markdown parse errors → fall back to plain text (not retried)
