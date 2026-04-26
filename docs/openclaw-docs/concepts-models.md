# Models CLI

Model selection in OpenClaw. Model refs: `provider/model` (e.g. `anthropic/claude-sonnet-4-6`).

## How Selection Works

1. **Primary**: `agents.defaults.model.primary`
2. **Fallbacks**: `agents.defaults.model.fallbacks[]`
3. **Provider auth failover**: inside a provider before next model

## Config Keys

- `agents.defaults.model.primary` + `fallbacks`
- `agents.defaults.imageModel` — for image inputs
- `agents.defaults.imageGenerationModel` — `image_generate` tool
- `agents.defaults.videoGenerationModel` — `video_generate` tool
- `agents.defaults.musicGenerationModel` — `music_generate` tool
- `agents.defaults.pdfModel` — PDF tool
- `agents.defaults.models` — allowlist + aliases

## Slash Commands

```
/model              # Show picker
/model list         # Compact list
/model 3            # Select by number
/model openai/gpt-5.4  # By ref
/model status       # Detailed view
```

## CLI

```bash
openclaw models list
openclaw models status
openclaw models set <provider/model>
openclaw models set-image <provider/model>

openclaw models scan --all    # OpenRouter free models
openclaw models scan --set-default  # Auto-configure

openclaw models fallbacks list
openclaw models fallbacks add <model>
openclaw models fallbacks remove <model>
```

## Model Allowlist

If `agents.defaults.models` is set, it becomes an allowlist for `/model`.
Unknown models rejected with "Model is not allowed."

Safe additive edits:
```bash
openclaw config set agents.defaults.models '{}' --strict-json --merge
```

## OpenRouter Free Models

```bash
openclaw models scan --all --provider openrouter --set-default
```

## Onboarding

```bash
openclaw onboard
```
Sets up model + auth for common providers including OpenAI Code (OAuth) and Anthropic.
