# OpenClaw Documentation Index

Fetch the complete documentation index at: https://docs.openclaw.ai/llms.txt

## CLI Reference Pages

All command reference pages are at https://docs.openclaw.ai/cli/*.md

## Plugin System Documentation

Key plugin SDK pages:
- https://docs.openclaw.ai/plugins/sdk-overview.md
- https://docs.openclaw.ai/plugins/sdk-entrypoints.md
- https://docs.openclaw.ai/plugins/sdk-runtime.md
- https://docs.openclaw.ai/plugins/sdk-channel-plugins.md
- https://docs.openclaw.ai/plugins/sdk-provider-plugins.md
- https://docs.openclaw.ai/plugins/sdk-setup.md
- https://docs.openclaw.ai/plugins/sdk-testing.md
- https://docs.openclaw.ai/plugins/sdk-migration.md
- https://docs.openclaw.ai/plugins/sdk-subpaths.md

Key plugin architecture pages:
- https://docs.openclaw.ai/plugins/architecture.md
- https://docs.openclaw.ai/plugins/architecture-internals.md
- https://docs.openclaw.ai/plugins/manifest.md
- https://docs.openclaw.ai/plugins/hooks.md
- https://docs.openclaw.ai/plugins/bundles.md
- https://docs.openclaw.ai/plugins/community.md
- https://docs.openclaw.ai/plugins/message-presentation.md

## Hook System Documentation

Internal hooks:
- https://docs.openclaw.ai/automation/hooks.md

CLI hooks command:
- https://docs.openclaw.ai/cli/hooks.md

## Configuration Reference

- https://docs.openclaw.ai/gateway/configuration.md
- https://docs.openclaw.ai/gateway/configuration-reference.md
- https://docs.openclaw.ai/gateway/config-agents.md
- https://docs.openclaw.ai/gateway/config-channels.md
- https://docs.openclaw.ai/gateway/config-tools.md

## API Reference

- https://docs.openclaw.ai/cli/infer.md
- https://docs.openclaw.ai/cli/mcp.md
- https://docs.openclaw.ai/cli/agents.md

## Tools and Plugins

- https://docs.openclaw.ai/tools/plugin.md
- https://docs.openclaw.ai/tools/slash-commands.md
- https://docs.openclaw.ai/tools/skills.md

## Key Findings Summary

### Plugin System
- OpenClaw uses a typed plugin SDK with focused subpath imports
- Plugin capabilities include: channels, model providers, tools, hooks, HTTP routes, CLI commands, services
- Plugin manifest (openclaw.plugin.json) is required for discovery and config validation
- 200+ SDK subpaths available under openclaw/plugin-sdk/*

### Hook System
Two types of hooks:
1. Internal hooks (this directory): small scripts for command/gateway events
2. Plugin hooks: in-process extension points for deep integration

Plugin hooks include: before_tool_call, before_agent_reply, llm_input, llm_output, message_received, message_sending, session_start/end, gateway_start/stop, etc.

### Configuration
- JSON5 format with strict schema validation
- Hot reload support with various modes (hybrid, hot, restart, off)
- $include for splitting config into multiple files
- Environment variable substitution with ${VAR} syntax
