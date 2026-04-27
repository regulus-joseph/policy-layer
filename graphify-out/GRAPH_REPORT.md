# Graph Report - docs/openclaw-docs  (2026-04-26)

## Corpus Check
- Corpus is ~11,878 words - fits in a single context window. You may not need a graph.

## Summary
- 262 nodes · 402 edges · 12 communities detected
- Extraction: 98% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.7)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_CLI & Core Commands|CLI & Core Commands]]
- [[_COMMUNITY_Gateway & Hooks|Gateway & Hooks]]
- [[_COMMUNITY_Memory & Workspace|Memory & Workspace]]
- [[_COMMUNITY_Channel System|Channel System]]
- [[_COMMUNITY_Memory Search & Vector|Memory Search & Vector]]
- [[_COMMUNITY_Scheduler & Background|Scheduler & Background]]
- [[_COMMUNITY_Plugin System|Plugin System]]
- [[_COMMUNITY_Model & Failover|Model & Failover]]
- [[_COMMUNITY_Pairing & Devices|Pairing & Devices]]
- [[_COMMUNITY_Runtime & Sandbox|Runtime & Sandbox]]
- [[_COMMUNITY_Model Allowlist|Model Allowlist]]
- [[_COMMUNITY_Hook Configuration|Hook Configuration]]

## God Nodes (most connected - your core abstractions)

## Surprising Connections (you probably didn't know these)
- `Plugin System` --enforces--> `Tiered Security Model`  [INFERRED]
  None → None  _Bridges community 6 → community 3_
- `Cron Scheduler` --exposes_via--> `Slash Commands`  [INFERRED]
  None → None  _Bridges community 5 → community 1_
- `openclaw (CLI)` --manages--> `Gateway`  [EXTRACTED]
  None → None  _Bridges community 0 → community 1_
- `Gateway` --uses--> `openclaw.json (config)`  [EXTRACTED]
  None → None  _Bridges community 1 → community 6_
- `Gateway` --manages--> `Channel System`  [EXTRACTED]
  None → None  _Bridges community 1 → community 3_

## Communities

### Community 0 - "CLI & Core Commands"
Cohesion: 0.04
Nodes (46): dashboard, backup, node, uninstall, message, skills, tui, capability (+38 more)

### Community 1 - "Gateway & Hooks"
Cohesion: 0.08
Nodes (38): Internal Hooks, ~/.openclaw/sessions/, command-logger (bundled hook), command:stop Event, /stop, Trusted Proxy Auth, hooks (CLI subcommand), compaction.mode (+30 more)

### Community 2 - "Memory & Workspace"
Cohesion: 0.07
Nodes (33): IDENTITY.md, ~/.openclaw/skills/, Dreaming Deep Phase, User Modeling, Honcho Memory Plugin, HEARTBEAT.md, honcho_search_messages (tool), memory (+25 more)

### Community 3 - "Channel System"
Cohesion: 0.12
Nodes (25): Tiered Channel Allowlist, SMS, DISCORD_BOT_TOKEN, Channel System, dmPolicy, groupPolicy, requireMention, Discord (+17 more)

### Community 4 - "Memory Search & Vector"
Cohesion: 0.09
Nodes (25): node-llama-cpp, Active Memory Plugin, BM25 Keyword Search, Vector Search, Ollama (embedding provider), SQLite, Voyage (embedding provider), /active-memory (+17 more)

### Community 5 - "Scheduler & Background"
Cohesion: 0.12
Nodes (17): QMD Memory Backend, Background Tasks, @tobi/qlu (QLU), AGENTS.md, runLog, sessionRetention, cron (CLI subcommand), Task Ledger (+9 more)

### Community 6 - "Plugin System"
Cohesion: 0.13
Nodes (19): Plugin Hooks, gateway_start (plugin hook), Schema Validation, before_tool_call (plugin hook), openclaw.plugin.json (manifest), session_start (plugin hook), $include Directive, Plugin System (+11 more)

### Community 7 - "Model & Failover"
Cohesion: 0.21
Nodes (12): /model, Model Allowlist, auth-profiles.json, Model Selection, Model System, models, FallbackSummaryError, Tiered Model Fallbacks (+4 more)

### Community 8 - "Pairing & Devices"
Cohesion: 0.15
Nodes (12): autoApproveCidrs, paired.json, pending.json, nodes, <channel>-pairing.json, ~/.openclaw/devices/, ~/.openclaw/credentials/, pairing (+4 more)

### Community 9 - "Runtime & Sandbox"
Cohesion: 0.22
Nodes (8): sandbox.mode, ACP Runtime, Sandbox, Agent Runtime, embeddedHarness, PI Runtime, Session Isolation, Codex Runtime

### Community 10 - "Model Allowlist"
Cohesion: 1.0
Nodes (1): Tiered Model Allowlist

### Community 11 - "Hook Configuration"
Cohesion: 1.0
Nodes (1): Tiered Hooks

## Ambiguous Edges - Review These
- `Telegram` → `OpenRouter`  [AMBIGUOUS]
   · relation: not_related_to

## Knowledge Gaps
- **Thin community `Model Allowlist`** (1 nodes): `Tiered Model Allowlist`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Hook Configuration`** (1 nodes): `Tiered Hooks`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Telegram` and `OpenRouter`?**
  _Edge tagged AMBIGUOUS (relation: not_related_to) - confidence is low._
- **Should `CLI & Core Commands` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `Gateway & Hooks` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Memory & Workspace` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Channel System` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._
- **Should `Memory Search & Vector` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Scheduler & Background` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._