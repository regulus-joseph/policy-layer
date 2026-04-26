# Plugin SDK Overview

The plugin SDK is the typed contract between plugins and core.

## Import Convention

Always import from a specific subpath:
```typescript
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { defineChannelPluginEntry } from "openclaw/plugin-sdk/channel-core";
```

## Subpath Reference

### Plugin Entry
| Subpath | Key exports |
| `plugin-sdk/plugin-entry` | `definePluginEntry` |
| `plugin-sdk/core` | `defineChannelPluginEntry`, `createChatChannelPlugin`, `createChannelPluginBase` |
| `plugin-sdk/config-schema` | `OpenClawSchema` |
| `plugin-sdk/provider-entry` | `defineSingleProviderPluginEntry` |

## Plugin Capabilities

| Capability | Registration method |
| Text inference (LLM) | `api.registerProvider(...)` |
| CLI inference backend | `api.registerCliBackend(...)` |
| Channel / messaging | `api.registerChannel(...)` |
| Speech (TTS/STT) | `api.registerSpeechProvider(...)` |
| Realtime transcription | `api.registerRealtimeTranscriptionProvider(...)` |
| Realtime voice | `api.registerRealtimeVoiceProvider(...)` |
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

Key hooks available via `api.on(...)`:

### Agent Turn
- `before_model_resolve` — override provider or model before session messages load
- `before_prompt_build` — add dynamic context or system-prompt text
- `before_agent_reply` — short-circuit with synthetic reply
- `before_agent_finalize` — request one more model pass
- `agent_end` — observe final messages

### Tools
- `before_tool_call` — rewrite params, block, or require approval
- `after_tool_call` — observe tool results
- `tool_result_persist` — rewrite assistant message from tool result

### Messages
- `message_received` — observe inbound content
- `message_sending` — rewrite or cancel delivery
- `message_sent` — observe delivery success/failure

### Sessions
- `session_start` / `session_end`
- `before_compaction` / `after_compaction`
- `before_reset`

### Lifecycle
- `gateway_start` / `gateway_stop`
- `before_install` — inspect/block install scans
