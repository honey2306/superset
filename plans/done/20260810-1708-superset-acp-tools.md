# Superset-native ACP tools

## Goal

Give every ACP harness a portable Superset tool surface for session context,
continuation, and delegation, including best-effort opening of a continued
conversation in a new Desktop tab.

## Decisions

- Use a bundled stdio MCP server because MCP declarations already work across
  Claude, Codex, Pi, and MyFlicker adapters.
- Create MCP declarations per session so source identity is host-supplied.
- Execute semantics in the detached ACP daemon, which owns the authoritative
  session registry and survives Desktop restarts.
- Derive workspace scope from the source session; never accept workspace IDs
  from model tool arguments.
- Send a semantic `acp-session:open-requested` event to Desktop instead of
  exposing pane-store primitives to the agent.
- Treat UI opening as best-effort and child session execution as authoritative.

## Shipped scope

- `get_context`
- `list_sessions`
- `get_session_status`
- `send_message`
- `continue_in_new_session`
- `delegate`
- Session-scoped MCP injection for new and resumed ACP sessions
- Daemon-to-host-to-renderer open-request event
- Strict schemas, same-workspace authorization, bounded inputs, and
  source-scoped in-memory idempotency
- Unit tests, package typechecks, MCP bundle build, and stdio handshake smoke
  verification

## Deferred

- Durable parent/child session relationships
- Durable/acknowledged presentation commands and multi-window targeting
- Resource opening, attention notifications, result collection, and workspace
  creation/delegation
