# Local embedded Agent Browser implementation plan

## Goal

Bind every local ACP conversation to one persistent browser session whose pages are real Electron `WebContentsView` instances embedded in the companion pane. The same page is controlled by both the user (native click, typing, scrolling, and login) and the Agent (Browser Use Python SDK over local CDP).

The browser runs in the background by default. Hiding or unmounting the companion pane only hides its active view; it does not destroy pages, cookies, or automation state. One conversation may own multiple pages.

Approved interaction prototype: `designs/agent-browser-prototype/index.html?variant=a`.

## Confirmed product decisions

- Ownership is ACP-conversation scoped, not workspace-, tab-, or pane-scoped.
- Browser pages never become Superset top-level tabs or independent mosaic panes.
- The fixed ACP toolbar Browser entry is the persistent presentation toggle.
- The companion pane is hidden by default and appears to the right of its ACP pane.
- Closing the companion pane hides presentation only.
- Closing the ACP conversation destroys its browser pages and automation sidecar.
- The first release is local Desktop only. Remote hosts retain the existing Browser Use MCP fallback.
- The final UI is a native `WebContentsView`, not `<webview>`, Live View, cloud streaming, or screenshot polling.
- Screenshots may remain an explicit Agent observation tool, but are not the user-facing rendering transport.

## Architecture

### Electron BrowserManager: lifecycle authority

Electron main owns a `BrowserManager` and is the only component allowed to create or destroy pages.

For each conversation it owns:

- a persistent, conversation-specific Electron partition;
- one or more `WebContentsView` pages;
- the active page id/index;
- each page's exact `webContents.getOrCreateDevToolsTargetId()` value;
- a target allowlist containing only that conversation's pages;
- the active presentation attachment, bounds, and visibility;
- navigation metadata and user-takeover/automation-cancellation state.

The manager exposes two local control surfaces:

1. Electron tRPC/IPC for the trusted renderer: attach/detach surface, update bounds, show/hide, list/select pages, and toolbar navigation.
2. An authenticated loopback/Unix-socket bridge for the detached ACP daemon and Browser Use sidecar: ensure/create/close/select pages and resolve the exact allowed target id.

`Target.createTarget` is never used. New and closed pages always go through BrowserManager.

### Browser Use SDK sidecar: automation engine

A conversation-scoped Python sidecar uses the published Browser Use SDK (`BrowserSession(cdp_url=...)`) for mature DOM cleanup, element indices, compressed state, actions, and recovery.

Before every exposed tool call, the Superset adapter:

1. asks BrowserManager for the conversation's active page and allowlist;
2. verifies the requested page belongs to that allowlist;
3. focuses the exact BrowserManager-provided CDP target id;
4. performs the Browser Use SDK action;
5. rejects any observed/focused target outside the allowlist.

The sidecar exposes only structured Superset operations such as `browser_get_state`, `browser_click`, `browser_type`, `browser_navigate`, and bounded scrolling. Tab create/close/switch calls bridge back to BrowserManager rather than Browser Use's default lifecycle.

### Thin MCP facade

ACP continues to receive a session-scoped local stdio MCP. It is transport only:

`ACP -> thin MCP -> ACP daemon -> Browser Use sidecar -> local CDP`

Tab lifecycle follows:

`ACP/renderer -> BrowserManager bridge -> WebContentsView`

The stock `browser-use --cli-mcp` remains only the fallback for hosts without the embedded capability. The stock `browser-use --mcp` lifecycle is not exposed for the embedded lane.

### Renderer

`PanesPaneData.agentBrowser = { sessionId }` remains the durable binding.

`AgentBrowserPane` renders toolbar chrome around an empty native surface anchor. A `ResizeObserver` sends the anchor's window-relative bounds through Electron tRPC; Electron positions the active `WebContentsView` over that rectangle. Visibility changes call show/hide without closing the page.

The renderer may query lightweight page metadata for URL/title/page selection. It must not request or poll screenshots.

## Delivery slices

1. **Native lifecycle foundation**
   - BrowserManager with conversation partitions, exact target ids, allowlists, page events, show/hide, and bounds.
   - Electron tRPC and authenticated local bridge.
   - Native companion surface replacing screenshot polling.
2. **Browser Use adapter**
   - Persistent Python sidecar process per active conversation.
   - CDP attach, exact-target focus guard, structured state/click/type/navigate/scroll.
   - BrowserManager-backed create/switch/close page operations.
3. **Lifecycle hardening**
   - User takeover cancels/interrupts in-flight automation safely.
   - Renderer reload and window recreation reattach views.
   - Hidden/background recovery, sidecar restart, and stale-target recovery.
   - Persistent login validation and partition cleanup policy.
4. **Security hardening**
   - Loopback-only CDP endpoint and unguessable bridge token.
   - Conversation target allowlist on every operation.
   - No renderer target is ever selected by default.
   - Evaluate a filtering CDP proxy or `webContents.debugger` bridge if endpoint-level isolation is required.

## Evidence gate

Do not call the feature verified until the same Desktop instance and route demonstrate all of the following with screenshots plus numeric/target evidence:

1. Agent action changes the embedded page and the pane updates synchronously.
2. Native user click/type/scroll changes that same page and the Agent reads the result.
3. Hiding and reopening the companion pane preserves target id and state.
4. Multiple pages are created/selected/closed only through BrowserManager.
5. Login cookies survive hide/show and renderer reload within the conversation partition.
6. A forced wrong target (including the Superset renderer) is rejected before action execution.

## Safety and limits

- Never expose an unauthenticated non-loopback bridge.
- Never let Browser Use choose the first page target.
- Never call Browser Use `new_tab` against Electron CDP.
- Never touch production DB or generated Drizzle migration files for this feature.
- Preserve unrelated worktree changes; run only targeted checks before repository-wide lint/typecheck.
