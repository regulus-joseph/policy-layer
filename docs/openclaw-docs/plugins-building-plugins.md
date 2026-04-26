# Building Plugins

Plugins extend OpenClaw with new capabilities: channels, model providers, speech, image generation, tools, hooks, and more.

## Quick Start: Tool Plugin

### 1. Create package and manifest

**package.json:**
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

**openclaw.plugin.json:**
```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "description": "Adds a custom tool to OpenClaw",
  "configSchema": {
    "type": "object",
    "additionalProperties": false
  }
}
```

### 2. Write entry point

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

### 3. Test and publish

```bash
clawhub package publish your-org/your-plugin
openclaw plugins install clawhub:@myorg/openclaw-my-plugin
```

## Plugin Capabilities

| Capability | Registration |
| Text inference | `api.registerProvider(...)` |
| Channel | `api.registerChannel(...)` |
| Speech | `api.registerSpeechProvider(...)` |
| Image generation | `api.registerImageGenerationProvider(...)` |
| Agent tools | `api.registerTool(...)` |
| Hooks | `api.on(...)` |
| HTTP routes | `api.registerHttpRoute(...)` |
| CLI subcommands | `api.registerCli(...)` |

## Registering Agent Tools

```typescript
// Required tool
api.registerTool({
  name: "my_tool",
  description: "Do a thing",
  parameters: Type.Object({ input: Type.String() }),
  async execute(_id, params) {
    return { content: [{ type: "text", text: params.input }] };
  },
});

// Optional tool (user must opt-in)
api.registerTool(
  {
    name: "workflow_tool",
    description: "Run a workflow",
    parameters: Type.Object({ pipeline: Type.String() }),
    async execute(_id, params) {
      return { content: [{ type: "text", text: params.pipeline }] };
    },
  },
  { optional: true },
);
```

## Configuration

```json5
{
  tools: { allow: ["workflow_tool"] },
}
```
