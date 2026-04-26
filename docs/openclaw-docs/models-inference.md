# Inference

Model inference in OpenClaw.

## Providers

OpenClaw supports multiple LLM providers. Register via plugin or config.

### Config-based Providers

```json5
{
  providers: {
    entries: {
      myOpenAI: {
        enabled: true,
        provider: "openai",
        model: "gpt-4.5",
        apiKey: { source: "env", id: "OPENAI_API_KEY" },
        baseUrl: "https://api.openai.com/v1",
      },
      myAnthropic: {
        enabled: true,
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        apiKey: { source: "env", id: "ANTHROPIC_API_KEY" },
      },
      myOllama: {
        enabled: true,
        provider: "ollama",
        model: "llama3.3:latest",
        baseUrl: "http://localhost:11434",
      },
    },
  },
}
```

## Commands

```bash
openclaw models list                  # List available models
openclaw models list --provider <p>  # List models by provider
openclaw models switch <model>       # Switch default model
openclaw infer <prompt>              # Run inference
openclaw capability                 # Check model capabilities
```

## Provider Capabilities

Each provider declares capabilities:
- `tools` — tool calling
- `streaming` — streaming responses
- `vision` — image understanding
- `function_calling` — function/tool calling
- `json_mode` — structured JSON output
- `thinking` — extended thinking / reasoning
