# Doctor

Repair + migration tool for OpenClaw.

## Commands

```bash
openclaw doctor           # Interactive
openclaw doctor --yes     # Accept defaults (including restart steps)
openclaw doctor --repair  # Apply repairs without prompting
openclaw doctor --fix     # Safe migrations only
openclaw doctor --deep    # Scan system services for extra installs
```

## What It Checks

1. Config normalization (legacy values → current schema)
2. OAuth TLS prerequisites
3. Legacy on-disk state migrations (sessions, agent dir, WhatsApp auth)
4. Legacy plugin manifest migrations
5. Legacy cron store migrations
6. Session lock cleanup (stale lock files)
7. Session transcript branch repair
8. State integrity (permissions, iCloud/mobile paths, SD cards)
9. Model auth health (OAuth expiry, cooldown states)
10. Sandbox image repair
11. Bundled plugin runtime deps
12. Gateway service migrations
13. Device pairing + auth drift
14. Security warnings (open policies, browser control exposure)
15. Gateway health check + restart
16. Memory search readiness
17. Channel status
18. Supervisor config audit (launchd/systemd/schtasks)
19. Gateway port diagnostics
20. Workspace bootstrap file size
21. Shell completion
22. Gateway auth (local token)
23. Source install checks (pnpm, tsx, UI assets)
24. Write updated config + wizard metadata

## Config Migrations (auto-applied)

- `routing.*` → top-level `channels`, `bindings`, `agents`
- `talk.*` → `talk.provider` + `talk.providers.<provider>`
- `plugins.entries.*` capability keys → `contracts`
- `browser.ssrfPolicy.allowPrivateNetwork` → `dangerouslyAllowPrivateNetwork`
- Legacy cron store fields
- Session lock cleanup
