# Plugin Hooks

Plugin hooks are in-process extension points for OpenClaw plugins.

## Quick Start

```typescript
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

export default definePluginEntry({
  id: "tool-preflight",
  name: "Tool Preflight",
  register(api) {
    api.on(
      "before_tool_call",
      async (event) => {
        if (event.toolName !== "web_search") return;
        return {
          requireApproval: {
            title: "Run web search",
            description: `Allow search query: ${String(event.params.query ?? "")}`,
            severity: "info",
            timeoutMs: 60_000,
            timeoutBehavior: "deny",
          },
        };
      },
      { priority: 50 },
    );
  },
});
```

## Hook Catalog

### Agent Turn
- `before_model_resolve` — override provider or model
- `before_prompt_build` — add context or system-prompt text
- **`before_agent_reply`** — short-circuit with synthetic reply or silence
- **`before_agent_finalize`** — request another model pass
- `agent_end` — observe final messages

### Conversation Observation
- `model_call_started` / `model_call_ended` — sanitized provider call metadata
- `llm_input` — observe provider input
- `llm_output` — observe provider output

### Tools
- **`before_tool_call`** — rewrite, block, or require approval
- `after_tool_call` — observe tool results
- **`tool_result_persist`** — rewrite assistant message
- **`before_message_write`** — inspect/block message write

### Messages
- **`inbound_claim`** — claim message before routing
- `message_received` — observe inbound content
- **`message_sending`** — rewrite or cancel delivery
- `message_sent` — observe delivery outcome
- **`before_dispatch`** — inspect outbound dispatch
- **`reply_dispatch`** — participate in reply pipeline

### Sessions
- `session_start` / `session_end`
- `before_compaction` / `after_compaction`
- `before_reset`

### Subagents
- `subagent_spawning` / `subagent_delivery_target` / `subagent_spawned` / `subagent_ended`

### Lifecycle
- `gateway_start` / `gateway_stop`
- **`before_install`** — inspect/block installs

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
    onResolution?: (decision: "allow-once" | "allow-always" | "deny" | "timeout" | "cancelled") => Promise<void> | void;
  };
};
```

## Important Notes

- `block: true` is terminal and skips lower-priority handlers
- Non-bundled plugins need `hooks.allowConversationAccess: true` for `llm_input`, `llm_output`, `before_agent_finalize`, `agent_end`
- Prompt-mutating hooks can be disabled per plugin with `plugins.entries.<id>.hooks.allowPromptInjection=false`
