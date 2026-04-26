# Health Checks

Verify channel connectivity and gateway health.

## Commands

```bash
openclaw status              # Local summary
openclaw status --all       # Full diagnosis
openclaw status --deep      # Live health probe via gateway
openclaw health             # Gateway health snapshot
openclaw health --verbose   # Force live probe + gateway details
openclaw health --json     # Machine-readable output
```

## Health Monitor Config

```json5
{
  gateway: {
    channelHealthCheckMinutes: 5,       # How often to check (0=disabled)
    channelStaleEventThresholdMinutes: 30, # Idle threshold
    channelMaxRestartsPerHour: 10,
  },
}
```

Per-channel override: `channels.<provider>.healthMonitor.enabled`

## Quick Fixes

| Issue | Fix |
| `logged out` / status 409-515 | Relink: `openclaw channels logout && openclaw channels login` |
| Gateway unreachable | Start: `openclaw gateway --port 18789` |
| No inbound messages | Check `allowFrom`, group allowlist, mention rules |
