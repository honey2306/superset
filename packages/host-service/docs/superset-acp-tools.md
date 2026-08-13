# Superset tools for ACP sessions

Superset injects a bundled, session-scoped stdio MCP server into every ACP
session. The tools expose product semantics that an agent cannot implement with
filesystem or terminal access alone: understanding its Superset context,
coordinating sibling ACP sessions, handing work to a fresh conversation, and
requesting that Desktop present the new conversation.

## Current tool surface

| Tool | Purpose |
| --- | --- |
| `get_context` | Return the current workspace, cwd, source session, and sibling session summaries. |
| `list_sessions` | List ACP sessions in the source session's workspace. |
| `get_session_status` | Read one same-workspace session's status and summary. |
| `send_message` | Send or queue a message to a same-workspace session. |
| `continue_in_new_session` | Create a child conversation, seed it with a structured handoff, and open it in Desktop by default. |
| `delegate` | Create an independent child session and seed it with a task. It remains in the background by default. |

The surface deliberately uses semantic operations instead of UI primitives such
as `click`, `focus_pane`, or `open_tab`. Superset remains free to change its pane
implementation while the agent-facing contract stays stable.

## Runtime flow

```text
ACP harness
  -> session-scoped `superset` MCP stdio process
  -> detached ACP daemon socket (`supersetTool` request)
  -> SupersetToolController
  -> AcpSessionManager

continue/delegate with focus=true
  -> daemon `session-open-requested` event
  -> host-service EventBus (`acp-session:open-requested`)
  -> active Desktop workspace
  -> openAcpSessionInPanesStore
```

`AcpSessionManager.mcpServerFactory` creates the declaration separately for
each session. The declaration carries only the daemon socket path and source
session ID. The daemon derives the workspace from its authoritative session
registry; tool arguments cannot name an arbitrary workspace.

The MCP process is bundled as `superset-mcp.js` beside `acp-daemon.js`. It
implements MCP initialize, ping, tools/list, and tools/call over newline-delimited
JSON-RPC and translates tool calls to the daemon's local request protocol.

## Child-session behavior

`continue_in_new_session` and `delegate`:

1. Resolve the source session and inherit its workspace.
2. Select the requested harness, or inherit the source harness.
3. Create the child through `AcpSessionManager`.
4. Submit the handoff/task as the child's first prompt.
5. Optionally emit a best-effort Desktop open request.
6. Return the child `sessionId` immediately after prompt admission.

Callers should provide `idempotencyKey` when retrying creation. Keys are scoped
to the source session and tool name. Dedupe is daemon-memory-backed; it prevents
ordinary transport retries but intentionally does not claim durability across a
daemon replacement.

The open request is presentation-only. A child session continues running when
Desktop is closed, a different workspace is mounted, or the event is otherwise
missed. Session state remains discoverable through `list_sessions` and normal
Superset session lists.

## Security boundaries

- The daemon socket is local, application-scoped, and protected by owner-only
  filesystem permissions.
- Source identity comes from the MCP declaration, not a model-supplied tool
  argument.
- The daemon resolves the source session before every operation.
- Read/message targets must belong to the source workspace.
- No destructive session or workspace operations are exposed by the current
  MCP tool surface.
- Tool inputs are strict Zod schemas with bounded strings and list limits.

## Follow-up candidates

Potential additions should remain semantic and separately permissioned:

- `open_resource` for files, diffs, terminals, sessions, and URLs.
- `request_attention` for notifications and user decisions.
- Durable parent/child relationships and result collection.
- Workspace/worktree delegation.
- Acknowledged or durable presentation requests for multi-window workflows.
