# Model Failover

OpenClaw handles failures in two stages:
1. Auth profile rotation within current provider
2. Model fallback to next model in `agents.defaults.model.fallbacks`

## Runtime Flow

1. Resolve active session model + auth profile preference
2. Build model candidate chain
3. Try provider with auth-profile rotation/cooldown
4. If failover-worthy error → move to next model candidate
5. Persist fallback override before retry
6. If all candidates fail → throw `FallbackSummaryError`

## Auth Profiles

Secrets in `~/.openclaw/agents/<agentId>/agent/auth-profiles.json`:
- `type: "api_key"` → `{ provider, key }`
- `type: "oauth"` → `{ provider, access, refresh, expires, email? }`

Profile IDs: `provider:default` or `provider:<email>`

## Rotation Order

1. Explicit `auth.order[provider]` config
2. Configured `auth.profiles`
3. Stored `auth-profiles.json` entries

Within same tier: OAuth before API keys, then oldest `lastUsed` first.
Cooldown/disabled profiles → moved to end.

## Session Stickiness

Auth profile is **pinned per session** to keep caches warm. Not rotated on every request.
- Pin breaks on: `/new`, `/reset`, compaction, profile in cooldown
- Manual `/model …@<profileId>` → user override, not auto-rotated

## Cooldowns

Rate-limit/billing errors mark profile in cooldown with exponential backoff:
- 1 min → 5 min → 25 min → 1 hour (cap)
- State in `auth-state.json`

**Billing disables** (insufficient credits): longer backoff (5h → 24h cap).

## Model Fallback Chain

Requested model → configured fallbacks → primary (for override runs).

Rules:
- Explicit fallbacks deduplicated but not filtered by allowlist
- No appending unrelated cross-provider fallbacks
- Primary appended at end when run started from override

## Failover-Worthy Errors

Continue to next model:
- auth failures, rate limits, overloaded, timeout-shaped
- billing disables, LiveSessionModelSwitchError

Do NOT continue:
- context overflow errors (stay in compaction/retry)
- explicit aborts
- final unknown error with no candidates left
