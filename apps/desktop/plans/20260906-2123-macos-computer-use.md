# macOS Computer Use for ACP Agents

## Goal

Give each local ACP conversation an explicit macOS desktop-control tool surface. The Agent should inspect the frontmost application through the Accessibility tree, use a screenshot when semantic data is insufficient, and then click, type, press keys, scroll, or focus an application. Browser work remains on Agent Browser/CDP; Computer Use is only for native desktop applications and whole-screen workflows.

## Scope

- macOS only.
- Accessibility-first observation with screenshot fallback.
- Automatic execution after the user asks the Agent to operate the computer; no per-action confirmation.
- Local Desktop host only. Remote/standalone hosts do not expose these tools.
- No hidden background enablement: tools report missing Accessibility or Screen Recording permissions clearly.
- No attempt to replace Agent Browser. Chromium/web interactions continue to use browser tools.

## Tool contract

Superset wraps Peekaboo's upstream MCP protocol rather than recreating individual command schemas. Allowed upstream tools keep their complete input schemas and are exposed with a `computer_` prefix:

- `computer_see`, `computer_inspect_ui`, `computer_image`, `computer_capture`, `computer_verify_state`
- `computer_click`, `computer_type`, `computer_press`, `computer_scroll`, `computer_drag`, `computer_move`
- `computer_action`, `computer_set_value`, `computer_paste`, `computer_clipboard`
- `computer_app`, `computer_window`, `computer_menu`, `computer_dialog`, `computer_dock`, `computer_space`
- `computer_permissions`, `computer_sleep`

Only three Peekaboo MCP tools are excluded:

- `agent`: Superset's ACP Agent owns planning and the tool loop.
- `analyze`: would create a second, separately configured model call inside Peekaboo.
- `browser`: website work remains isolated in Superset Agent Browser/CDP.

Tool calls are translated back to the original Peekaboo name without changing arguments. This preserves exact window targeting, snapshot receipts, background delivery, OCR, verification predicates, dialogs, menus, Spaces, clipboard, drag, capture, and future schema additions without reducing Peekaboo to a lowest-common-denominator API.

## Peekaboo PoC result

The preferred execution engine is now Peekaboo when a pinned `peekaboo` binary is available through `SUPERSET_PEEKABOO_PATH` or `PATH`. The existing JXA/System Events implementation remains a development fallback until the release bundle includes Peekaboo.

Verified end to end with Peekaboo 4.3.1:

- MIT licensed, signed and hardened universal Mach-O (`arm64` + `x86_64`).
- npm artifact is roughly 75 MB unpacked and includes a native CLI plus MCP launcher.
- `app list --json`, MCP initialization, and MCP tool discovery work.
- Native tool coverage includes `see`, `click`, `type`, `press`, `scroll`, app/window/menu/dialog control, screenshot capture, and permission reporting.
- The official signed `Peekaboo.app` GUI Bridge was granted Screen Recording, Accessibility, and Event Synthesizing access. The MCP proxy is pinned to its `bridge.sock`; an unprivileged local/on-demand daemon is not accepted as equivalent evidence.
- On startup, Superset discovers the separately installed official app and CLI, launches `Peekaboo.app` hidden when its bridge is absent, waits for `bridge.sock`, and exports the exact CLI/socket paths before starting Host Service. A cold-start run with a minimal GUI-style `PATH` confirmed `Peekaboo GUI Bridge ready after launch` and all three permissions remained granted.
- A fresh Claude ACP conversation launched from the real Superset Desktop UI called `computer_app`, `computer_see`, `computer_click`, `computer_type`, `computer_verify_state`, and `computer_inspect_ui`.
- The Agent created an untitled TextEdit document and entered `SUPERSET_PEEKABOO_E2E_20260906`. Both `computer_inspect_ui` and `computer_see` returned `elem_2` / `First Text View` with the exact value.
- Final evidence is stored in `apps/desktop/docs/artifacts/peekaboo-computer-use-e2e/textedit-verified.png` and `textedit-verified.json`.

The E2E run exposed and fixed three integration issues: Claude reserves the MCP server name `computer-use` (renamed to `desktop-control`), excluded tools must be filtered before Peekaboo initializes its MCP context, and the MCP must explicitly use the authorized GUI Bridge instead of an unprivileged on-demand daemon.

Superset keeps its namespaced `computer_*` contract rather than exposing raw Peekaboo names. The wrapper retains every allowed upstream tool and its full schema while providing a clear namespace, per-session lifecycle, explicit exclusion policy, and a future replacement seam.

## Architecture

1. At startup, Desktop discovers `/Applications/Peekaboo.app` (or `SUPERSET_PEEKABOO_APP_PATH`) and a pinned CLI from `SUPERSET_PEEKABOO_PATH`, `PATH`, or the standard Homebrew paths.
2. If `bridge.sock` is absent, Desktop launches the signed app hidden with Launch Services and waits for the GUI Bridge before starting Host Service. Missing components disable Computer Use without blocking Superset startup.
3. A session-scoped `desktop-control` MCP declaration launches Superset's `computer-use-mcp` proxy for each ACP conversation.
4. The proxy starts the pinned Peekaboo binary, disables `agent`, `analyze`, and `browser` before upstream initialization, and connects explicitly to the authorized Peekaboo GUI Bridge.
5. Peekaboo owns native Accessibility inspection, ScreenCaptureKit capture, input delivery, snapshot receipts, and operation verification.
6. Superset namespaces allowed tools with `computer_`, preserves their upstream schemas, and owns Agent planning, conversation lifecycle, cancellation, and future audit/policy controls.
7. `daemon-entry.ts` injects the MCP only when `process.platform === "darwin"`, the embedded Desktop capability flag is set, and a Peekaboo executable is available.
8. `electron.vite.config.ts` emits the proxy as a standalone Electron-as-Node entry.

## Safety and usability

- Model instructions distinguish browser tasks from native desktop tasks.
- Password/secure text values are never included in Accessibility state.
- State traversal has depth, element-count, and text-length limits.
- Screenshots are returned only when the Agent explicitly calls the screenshot tool.
- All actions are visible system input; there is no private API mutation.
- The user can stop an in-flight Agent with the existing ACP cancel/stop control. A dedicated global Computer Use kill switch is a follow-up if continuous/background workflows are added.

## Validation

- Unit-test MCP declaration, complete tool filtering/mapping, GUI Bridge selection, schema preservation, and process lifecycle behavior.
- Desktop and host-service typechecks.
- Real Desktop E2E: launch a fresh ACP conversation through the visible UI, have the Agent operate TextEdit exclusively through `computer_*`, and verify the exact value through both Accessibility state and a captured screenshot.

## Follow-ups

- Bundle and version-pin the Peekaboo CLI and signed GUI Bridge rather than depending on Homebrew/PATH.
- Persistent action audit timeline and dedicated emergency-stop indicator.
- Windows implementation behind a capability-based platform contract; do not reduce the macOS surface to a lowest-common-denominator API.
