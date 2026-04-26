# OpenClaw Plugin SDK

## Plugin Structure

### package.json

```json
{
  "name": "@myorg/openclaw-my-plugin",
  "version": "1.0.0",
  "type": "module",
  "openclaw": {
    "extensions": ["./index.ts"],
    "compat": {
      "pluginApi": ">=2026.3.24-beta.2",
      "minGatewayVersion": "2026.3.24-beta.2"
    }
  }
}
```

### openclaw.plugin.json

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "description": "Adds a custom tool",
  "configSchema": { "type": "object" }
}
```

### Entry Point

```typescript
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

export default definePluginEntry({
  id: "my-plugin",
  name: "My Plugin",
  register(api) {
    api.registerTool({
      name: "my_tool",
      description: "Do a thing",
      parameters: Type.Object({ input: Type.String() }),
      async execute(_id, params) {
        return { content: [{ type: "text", text: `Got: ${params.input}` }] };
      },
    });
  },
});
```

## SDK Subpaths

| Subpath | Exports |
| `plugin-sdk/plugin-entry` | `definePluginEntry` |
| `plugin-sdk/core` | `defineChannelPluginEntry`, `createChatChannelPlugin`, `createChannelPluginBase` |
| `plugin-sdk/config-schema` | `OpenClawSchema` |
| `plugin-sdk/provider-entry` | `defineSingleProviderPluginEntry` |

## Plugin Capabilities

| Capability | Registration |
| Text inference | `api.registerProvider(...)` |
| CLI inference backend | `api.registerCliBackend(...)` |
| Channel / messaging | `api.registerChannel(...)` |
| Speech (TTS/STT) | `api.registerSpeechProvider(...)` |
| Media understanding | `api.registerMediaUnderstandingProvider(...)` |
| Image generation | `api.registerImageGenerationProvider(...)` |
| Music generation | `api.registerMusicGenerationProvider(...)` |
| Video generation | `api.registerVideoGenerationProvider(...)` |
| Web fetch | `api.registerWebFetchProvider(...)` |
| Web search | `api.registerWebSearchProvider(...)` |
| Agent tools | `api.registerTool(...)` |
| Custom commands | `api.registerCommand(...)` |
| Plugin hooks | `api.on(...)` |
| Internal event hooks | `api.registerHook(...)` |
| HTTP routes | `api.registerHttpRoute(...)` |
| CLI subcommands | `api.registerCli(...)` |

## Plugin Hooks

| Event | Purpose |
| `before_tool_call` | Rewrite params, block, or require approval |
| `after_tool_call` | Observe tool results |
| `tool_result_persist` | Rewrite assistant message |
| `before_agent_reply` | Short-circuit with synthetic reply |
| `before_agent_finalize` | Request another model pass |
| `agent_end` | Observe final messages |
| `llm_input` | Observe provider input |
| `llm_output` | Observe provider output |
| `before_message_write` | Inspect/block message write |
| `inbound_claim` | Claim message before routing |
| `message_received` | Observe inbound content |
| `message_sending` | Rewrite or cancel delivery |
| `before_dispatch` | Inspect outbound dispatch |
| `session_start` / `session_end` | Session lifecycle |
| `gateway_start` / `gateway_stop` | Gateway lifecycle |
| `before_install` | Inspect/block installs |

## Before Tool Call Result

```typescript
type BeforeToolCallResult = {
  params?: Record<string, unknown>;
  block?: boolean;
  blockReason?: string;
  requireApproval?: {
    title: string;
    description: string;
    severity?: "info" | "warning" | "critical";
    timeoutMs?: number;
    timeoutBehavior?: "allow" | "deny";
    pluginId?: string;
    onResolution?: (decision: string) => Promise<void> | void;
  };
};
```

## Publishing

```bash
clawhub package publish your-org/your-plugin
openclaw plugins install clawhub:@myorg/openclaw-my-plugin
```
