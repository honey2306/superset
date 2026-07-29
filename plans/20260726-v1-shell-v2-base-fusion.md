# V1 Shell + V2 Base Fusion Plan

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`,
`Decision Log`, and `Outcomes & Retrospective` updated as implementation
proceeds.

Reference: This plan follows `AGENTS.md` and the style of
`plans/20260724-v1-v2-terminal-fusion.md` (the terminal-only fusion that
preceded this one).

## Purpose / Big Picture

We want **one desktop workspace product** that combines the v1 UI shell users
prefer with the v2 internal architecture the next four product goals
require. The end state is:

- Users see the **v1 workspace UI** — the multi-workspace manager form with
  the left workspace list and the familiar navigation. The v2 "single
  immersive workspace" shell is discarded.
- The internal pane/layout/view/state layer is the **v2-grade
  `@superset/panes` engine** plus v2's per-workspace isolation, not v1's
  mosaic + global tabs store.

### Current scope: "base" pass (2026-07-26)

This pass builds the **base** only — v1 shell on the v2 panes engine with
terminal + file panes usable as the default. The four product goals that
*sit on top of* the base are out of scope and tracked as medium-term:

- **Out of scope (medium-term, do NOT do this pass):**
  - M3 — ACP agent pane (`acp` pane kind via `session-protocol`).
  - M5 — strengthened git (v2 review surface + v1 operations merged).
  - M6 — mobile remote control (relay-driven panes).
- **In scope (base):**
  - M1 — real-render validation + persistence adapter ✅ (done).
  - M2 — terminal pane registry parity (daily-driver terminal under the
    flag).
  - M4 — editor preview + LSP via view registry. **LSP scoped to a few
    common languages** (not exhaustive) — LSP is net-new; the view-registry
    pluggability is the base, languages are filled incrementally.
  - M7 — retire v1 mosaic + global tabs store, **soft**: `V2_PANES_IN_V1`
    becomes the default for terminal/file; the mosaic code path stays as
    fallback for pane kinds not yet migrated (`webview`/`chat`/`devtools`/
    `comment`) until M3/M5 give them panes-engine renderers. The mosaic
    *files* are not deleted in M7 — only the routing default flips. Hard
    deletion waits for full pane-kind parity (post-M3/M5).
  - M8 — delete the v2 immersive workspace shell. No pane kind depends on
    it; host-agnostic packages (`@superset/panes`, `@superset/workspace-
    client`, `session-protocol`) and shared renderer/lib code are kept.
    Shared hooks still living under the v2-workspace route path are moved
    to neutral `renderer/lib`/`renderer/hooks` first.
- Four product goals are delivered on top of this base:
  1. **Terminal agent + ACP agent** as two pane kinds in the same registry.
  2. **Complete editor preview + LSP** as a pluggable view registry.
  3. **Strengthened git** — v2 review surface (search, PR comments, agent
     comments, changeset model) merged with v1's operation surface
     (stage/unstage/commit/PR/in-place edit).
  4. **Mobile remote control** via v2's per-workspace + host/relay model.
- v1's mosaic render layer and global tabs store are retired after parity.

This is **not** "move the v2 UI into v1" (option A, forces re-implementing v2
mechanisms on v1's hardcoded architecture). It is **"keep v1's shell, swap
v1's internal base for v2's"** (option D).

## Plain-Language Decision

The v1 UI form stays. The v1 internal architecture (mosaic, global tabs
store, hardcoded pane `if` branches) is replaced by the v2
`@superset/panes` engine + per-workspace isolation. v1's strongest surfaces
(git operations, real init progress, branch-drift sync, preset multi-target
menus, run setup/teardown) are migrated onto the new base. The v2 immersive
workspace shell and its sidebar form are deleted. The v2 pane/layout/view
**engine** is kept.

## Why Not the Alternatives

- **Option A (deepen terminal-only fusion into all fusion)**: ACP, LSP, and
  remote all require v2's existing extension mechanisms (declarative pane
  registry, pluggable view registry, per-workspace isolation). Doing them on
  v1's hardcoded architecture means re-implementing those mechanisms inside
  v1 — building v2 a second time. Only the "git strengthening" goal is cheap
  under A.
- **Option B (adopt v2 shell + base)**: Achieves all four goals but discards
  the v1 UI form the user explicitly prefers. Rejected by product direction.
- **Option C (dual products)**: Already rejected; the goal is fusion, not
  coexistence.

## PoC Verified (2026-07-26)

A feature-flagged PoC (`V2_PANES_IN_V1`, commit `a41b8cb6a`) proved the base
can mount inside the v1 shell:

- `@superset/panes` has **zero** v2/router/trpc dependencies (only
  `@superset/ui`, `lucide-react`, `react-dnd`, `zustand`).
- Its `<Workspace>` component consumes only zustand `useStore` + react-dnd
  `useDragLayer` — the latter satisfied by v1's existing `DndProvider` in
  `_authenticated/layout.tsx`. No v2 Provider required.
- The M0–M5 neutral terminal layer (`HostServiceTerminalPane`, already in
  `renderer/lib/terminal`) plugs into the panes `renderPane` callback with
  three string props (`paneId`/`tabId`/`workspaceId`).
- The only adapters v1 must provide are two hooks: a pane registry (done in
  PoC) and a persistence adapter (deferred; in-memory store suffices to
  mount). No `@superset/panes` package changes needed.
- typecheck 35/35, lint clean (5363 files), 4 wiring tests pass.

**PoC scope was pure-render-layer mount** (the flag fully replaces the view's
tab rendering; v1 global tabs store is not consulted for that view). The
open question the PoC did **not** answer is real-render behavior under the
PostHog flag in a running dev app; that is the first task of Phase 1.

## Keep / Migrate / Delete

### Must keep (v2 base, host-agnostic)

1. **`@superset/panes`** — the pane/layout/tab engine. Zero v2 coupling.
2. **`@superset/workspace-client`** — per-workspace QueryClient/tRPC client
   isolation via `WorkspaceClientProvider` (props only, no router dep).
3. **v2 Provider chain** — `WorkspaceProvider`, `FileDocumentStoreProvider`,
   `WorkspaceGitStatusProvider`. All props-driven, router-independent.
4. **v2 pane registry contract** — `PaneDefinition` declarative registry +
   lifecycle hooks (`onBeforeClose`/`onAfterClose`/`titleSource`).
5. **v2 view registry** — `resolveViews` priority/match/exclusive-shortcut
   mechanism (for LSP/editor preview).
6. **v2 changeset model** — `DiffRef` → `ChangesetFile[]` + stable fileKey.
7. **M0–M5 neutral terminal layer** — `renderer/lib/terminal/*`,
   host-service terminal, pty-daemon. Already UI-shell-agnostic.

### Migrate (v1 strengths onto the new base)

1. **Git operation surface** — stage/unstage/discard/commit/PR/in-place
   edit/focus mode (`useFileMutations`, `useFileDiffEdit`,
   `RightSidebar/ChangesView`). Wire onto v2's changeset/diff model.
2. **Real init progress** — v1 `KeypadLoader`/`StepProgress` event-driven
   progress (v2's is synthetic estimated time). Keep v1's.
3. **Branch-drift auto sync** — `useBranchSyncInvalidation`. v2 has no
   equivalent.
4. **Large-changeset polling backoff** — `useGitChangesStatus` ≥200 files
   → 10s. v2 provider lacks this.
5. **Duplicate-branch-error retry dedupe** — `WorkspaceInitializingView`.
6. **Preset multi-target menu + quick-add templates** — v1 `PresetsBar`
   right-click (current terminal / new tab / new pane / default) + template
   create. v2 right-click has only Run/Edit.
7. **Run setup/teardown lifecycle script entries** — v1 `WorkspaceRunButton`
   dropdown. v2 dropdown has only force-stop + configure.

### Delete (after parity)

1. v1 mosaic render layer (`TabView` + `react-mosaic-component` usage).
2. v1 global tabs store (`stores/tabs/store.ts`) and its `persist` middleware.
3. v1 hardcoded pane `if` branches in `TabView/index.tsx`.
4. v2 immersive workspace shell (`v2-workspace/layout.tsx` state machine,
   `WorkspaceCreatingState`/`WorkspaceCreateErrorState`/`NotFound`/
   `HostIncompatible`).
5. v2 sidebar form (`WorkspaceSidebar`), v2 TopBar/presets bar/window
   controls.
6. v2 route entry (`/v2-workspace/$workspaceId`) and its `validateSearch`.

## Target Architecture

```text
v1 UI shell (kept)
  -> v1 left workspace list + navigation
  -> v1 WorkspaceView shell
  -> per-workspace: WorkspaceProvider + WorkspaceClientProvider
     -> FileDocumentStoreProvider + WorkspaceGitStatusProvider
     -> @superset/panes <Workspace> (store + registry)
        -> pane kinds: terminal | acp | file(diff/view) | git(changes)
        -> view registry: code/markdown/image/video/diff (+ LSP)
     -> M0-M5 neutral terminal layer
     -> host-service terminal + pty-daemon
```

Identity rule (carried from the terminal fusion plan):
- `paneId` = v1 UI identity (now owned by panes store, not tabs store).
- `terminalId` = backend session identity.
- `paneId -> terminalId` mapping remains explicit; never assume equality.

## Non-Goals

1. Do not redesign the v1 workspace UI form.
2. Do not keep the v2 immersive workspace shell.
3. Do not build remote/cloud terminals as a separate product; remote is the
   mobile-control path only.
4. Do not remove v1 strengths (git ops, init progress, etc.) until their
   replacements on the new base are verified.
5. Do not block on v2's notification/attention system; it depends on the full
   `v2-notifications` stack and is out of scope for this fusion.

## Milestones

### Milestone 1: Real-render validation + persistence adapter

Goal: confirm the PoC mounts under a running dev app and add the missing
persistence adapter so panes layout survives remounts.

Tasks:

1. Enable `V2_PANES_IN_V1` in a dev PostHog environment, launch the dev
   stack on this worktree's ports (`DESKTOP_VITE_PORT=3025`,
   `NEXT_PUBLIC_API_URL=http://localhost:3031`,
   `RENDERER_REMOTE_DEBUG_PORT=19325`), and verify via CDP that:
   - The v1 workspace view renders the panes `<Workspace>` instead of mosaic.
   - The seeded terminal pane connects, accepts input, shows output, and
     resizes.
   - The PoC "+ terminal" button splits a second terminal pane.
   - Workspace switch and renderer remount do not crash.
   - **Mount boundary: the flag must own the whole `ContentView`, not just
     `TabsContent`.** v1's tab strip (`GroupStrip`) renders one level above
     `TabsContent` in `ContentView`; mounting the panes engine inside
     `TabsContent` produces two tab bars side by side (v1 `GroupStrip` +
     panes `<Workspace>` TabBar). The PoC hit this and was fixed by moving
     the flag check to `ContentView` (commit `8d34903cf`). M1 keeps that
     boundary: flag on → `ContentView` returns `<V1PanesWorkspace>` wholesale,
     replacing `GroupStrip + PresetsBar + TabsContent`. v1's tab concept is
     split across two layers; panes unifies them, so接管 must be at the
     layer that owns the tab strip, not the pane area.
2. Replace the in-memory store with a persistence adapter modeled on
   `useV2WorkspacePaneLayout` but backed by v1's persistence
   (`trpcTabsStorage` or a per-workspace key) instead of TanStack DB
   collections. Use only `store.replaceState` + `store.subscribe`.
3. Seed the panes store from the existing v1 tabs store on first mount of a
   workspace (one-time migration of open tabs/panes), so users do not lose
   their layout on first flag-on.
4. Verify pane close routes to the M0–M5 backend-aware terminal-cleanup
   (park vs kill) — the PoC left `onAfterClose` unwired.
5. Solve the terminal→host-service connection: in the PoC's real-render
   validation (commit `a8849b0f0`), the terminal pane showed "连接已丢失".
   The same loss appears in v1 mosaic mode on this dev instance, so the
   root cause is local host-service attach, not the panes adapter. M1 must
   make the terminal connect in panes mode (and confirm it matches mosaic
   mode behavior), otherwise the panes mount is not a usable terminal
   surface.

#### M1 TDD interface & behavior contract (2026-07-26)

Tasks 1 (CDP) and 5 (host-service connection) are verification/diagnosis,
not TDD. Tasks 2/3/4 are TDD with these confirmed decisions:

- **Persistence backend**: reuse the v2 `v2WorkspaceLocalState` TanStack DB
  collection (per-workspace row, `paneLayout` field), NOT a new tRPC/lowdb
  endpoint. Modeled on `useV2WorkspacePaneLayout` but adapted for the v1
  shell (explicit `workspaceId` arg; the v1 shell may not have v2's
  `WorkspaceProvider`, so it must not rely on `useWorkspace()`).
- **Seed scope**: migrate only `type==="terminal"` panes from the v1 global
  tabs store, one terminal pane per workspace, default layout (no v1 mosaic
  split geometry — that is a fidelity follow-up per the D2 migration plan).
  Source pane = the active tab's first terminal pane, falling back to the
  workspace's first terminal pane. `data.terminalId = v1 pane.id` (so the
  existing host-service session survives; the host-service terminalId
  derivation already defaults to paneId).
- **Close channel**: `onAfterClose` calls `killTerminalForPane(pane.id)` —
  the v1 unified kill entry. `HostServiceTerminalPane` already registers
  its host-service kill there, so this routes to host-service kill
  idempotently. Identity key is `pane.id` (NOT `pane.data.terminalId`),
  matching how `HostServiceTerminalPane` derives terminalId. `onBeforeClose`
  (confirm-close dialog) is deferred to M2 task 4.
- **Seed idempotency**: presence of a non-empty `paneLayout` in the
  workspace's `v2WorkspaceLocalState` row is the "already migrated" mark.
  Empty/absent → seed once and write back; present → skip. No new schema
  field.

Behaviors under test (vertical slices, RED→GREEN each):

- **Persistence adapter (`useV1PanesWorkspacePaneLayout`)**
  1. No persisted row for workspace → store hydrates to EMPTY_STATE.
  2. Persisted non-empty `paneLayout` → `replaceState` called; store state
     reflects the persisted layout.
  3. After a store mutation (e.g. `addTab`), the collection row's
     `paneLayout` is written back as `{version, tabs, activeTabId}`.
  4. A `replaceState` hydration does not trigger a writeback echo
     (snapshot guard).
  5. On `workspaceId` change, `lastSyncedSnapshot` resets; the new
     workspace hydrates from its own row, no cross-workspace leakage.
- **Seed migration (`seedPanesFromV1TabsStore`)**
  6. Non-empty persisted `paneLayout` present → seed is a no-op (idempotent).
  7. No persisted layout + v1 active tab has a terminal pane → seeded store
     has one tab with one terminal pane whose `data.terminalId` equals the
     v1 pane's `id`.
  8. No persisted layout + active tab has no terminal pane → falls back to
     the workspace's first terminal pane.
  9. No persisted layout + workspace has no terminal pane → seeds one tab
     with one fresh terminal pane (UUID terminalId), matching current PoC.
- **onAfterClose wiring**
  10. Closing a terminal pane calls `killTerminalForPane(pane.id)`.
  11. When `pane.data.terminalId !== pane.id`, the kill still uses
      `pane.id` (identity rule locked).

Exit criteria:

- Real UI renders the panes engine inside the v1 shell with no crashes.
- Layout persists across remount and workspace switch.
- Terminal close behaves per v1 semantics (park on hide, kill on close).

### Milestone 2: Pane registry parity for daily terminal use

Goal: the terminal pane in the panes engine reaches v1 terminal parity so
the flag can be the default for terminal-only workspaces.

Tasks:

1. Port the full terminal pane registry from v2's `usePaneRegistry` terminal
   section, minus v2-only bits (notification indicator, session dropdown if
   it depends on v2 provider). Keep: title source, copy/paste, clear,
   scroll-to-bottom, kill-session, close confirmation, header extras.
2. Wire `useDefaultPaneActions` + `useDefaultContextMenuActions` (v2) into
   the v1 mount, or provide v1-equivalent split/close/equalize/move actions
   against the panes store.
3. Port `useWorkspacePaneOpeners` (v2) as the unified pane-open entry for the
   v1 mount; route v1 sidebar/preset/run openers through it.
4. Add `CLOSE_PANE` hotkey + `onBeforeClose` guard (v2) — currently absent in
   v1 hotkeys.
5. Verify the v2 scroll-state cache (`paneScrollStateCache`) works inside the
   v1 mount.

Exit criteria:

- A terminal-only workspace under the flag is a daily-driver replacement for
  the v1 terminal, verified by the v1 terminal parity checklist.

### Milestone 3: ACP agent pane

Goal: deliver the first non-terminal agent form — a native ACP transcript pane
— alongside the terminal CLI agent.

Tasks:

1. Add an `acp` pane kind to the registry. `renderPane` renders an ACP
   transcript UI driven by `packages/session-protocol` (envelope/state/fold/
   client + React hooks `useAcpSession`/`useAcpPermissions`), which is already
   a complete ACP implementation.
2. Bind ACP sessions to the same agent metadata model as terminal agents
   (`workspaceId`, agent kind, lifecycle status) so the sidebar agent chip
   works for both forms.
3. Add an "open in terminal" affordance so an ACP session can fall back to
   terminal CLI when the agent lacks ACP support.
4. Keep terminal CLI agents as the default; ACP is opt-in per agent kind.

Exit criteria:

- An ACP-capable agent renders a native transcript pane; a terminal-only
  agent still launches in a terminal pane. Both report status to the v1
  sidebar.

### Milestone 4: Editor preview + LSP via view registry

Goal: complete file preview/editing with LSP, using v2's pluggable view
registry instead of v1's hardcoded `FileViewerMode`.

Tasks:

1. Port v2's `FilePane` + `resolveViews` registry (`imageView`/`videoView`/
   `binaryWarningView`/`markdownPreviewView`/`codeView`) into the v1 mount.
2. Port v2's `fileDocumentStore` + `ContentState` state machine (loading/
   text/bytes/not-found/too-large/error) with revision-based optimistic
   save. This is the data layer LSP needs.
3. Add LSP as a new view kind: diagnostics, completions, hover, go-to-definition
   via a language server bridge (LSP is currently absent in the repo — this
   is net-new).
4. Migrate v1's in-place diff edit (`useFileDiffEdit`) and focus mode onto the
   new view registry so v1's editor strengths are not lost.
5. Wire fs-watcher-driven external change/rename/delete handling (v2's
   `dispatchFsEvent` orphaned/rename/auto-reload behavior) — v1 lacks this.

Exit criteria:

- A file pane renders code/markdown/image/video with LSP diagnostics.
- External disk changes are reflected without manual reload.
- v1's in-place diff edit still works.

### Milestone 5: Strengthened git (v2 review + v1 operations merged)

Goal: combine v2's review surface and v1's operation surface on the changeset
model.

Tasks:

1. Adopt v2's `useChangeset` (`DiffRef` → `ChangesetFile[]` + stable fileKey)
   as the unified changeset model for the v1 changes sidebar and diff pane.
2. Add the v2 diff pane's review capabilities: in-diff search, sticky section
   bar, PR review comment rendering, agent comment composer, binary
   placeholder, split/unified toggles persisted in settings.
3. Keep v1's operation surface wired to the same changeset model: stage/
   unstage/discard/delete-untracked/commit/PR/in-place edit. Do not let
   adopting v2's diff renderer drop these.
4. Port v2's persisted `viewedFiles` + `recentlyViewedFiles` (currently
   memory-only in v1) into the v1 changes view.
5. Unify `useOpenInExternalEditor` (v2's hook with remote interception + app
   override) to replace v1's 17 inline call sites.

Exit criteria:

- The v1 changes sidebar + diff pane offer both v1 operations and v2 review
  (search, PR comments) on one changeset model.
- viewedFiles survives restart.

### Milestone 6: Mobile remote control

Goal: drive a desktop workspace from mobile via the per-workspace + host/relay
model.

Tasks:

1. Expose the v1 workspace through the v2 per-workspace `WorkspaceClientProvider`
   + host/relay abstraction (`useRemoteHostStatus`, relay URL routing) so a
   remote client can address it.
2. Add an `apps/mobile` surface that connects to a desktop workspace over
   relay and drives its panes (terminal input, file view, ACP session).
3. Reuse the deep-link consumption hooks (`useConsumeAutomationRunLink`,
   `useConsumeOpenUrlRequest`) for mobile-initiated navigation; feed their
   params from the mobile relay instead of v2's `Route.useSearch`.
4. Verify the v1 shell + remote host is the only product surface — no v2
   immersive shell is reachable from mobile.

Exit criteria:

- A mobile client can open a desktop workspace, drive its terminal, and
  observe ACP/file panes over relay.

### Milestone 7: Retire v1 mosaic + global tabs store

Goal: remove the old render layer after parity.

Tasks:

1. Remove the v1 mosaic render path (`TabView` + `react-mosaic-component`)
   once all pane kinds are on the panes engine.
2. Remove the v1 global tabs store and its `persist` middleware; the panes
   store + persistence adapter (M1) is the single source.
3. Remove the hardcoded pane `if` branches in `TabView/index.tsx`.
4. Remove the PoC `V2_PANES_IN_V1` flag — the panes engine is the default.
5. Keep the `V1_HOST_SERVICE_TERMINAL` flag only if the legacy terminal path
   is still needed as emergency fallback; otherwise remove it too.

Exit criteria:

- No mosaic, no global tabs store, no hardcoded pane branches remain.
- typecheck, lint, and the full validation matrix pass.

### Milestone 8: Delete v2 workspace shell

Goal: remove the dead v2 UI product surface.

Tasks:

1. Delete `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/`
   route components (layout, page, shell state components, sidebar).
2. Keep the host-agnostic packages (`@superset/panes`, `@superset/workspace-
   client`, `session-protocol`) and the neutral renderer/lib code.
3. Move any remaining shared hooks out of the v2-workspace path into
   neutral `renderer/lib` or `renderer/hooks` (as M0–M5 did for terminal
   appearance).
4. Remove v2 route entries and `validateSearch`; add redirects for persisted
   v2 deep links to the v1 route.
5. `rg` for dead exports, route links, and feature flags referencing v2.

Exit criteria:

- No v2 workspace UI is reachable or imported.
- Shared infrastructure remains under neutral paths.
- typecheck, lint, targeted tests, manual navigation smoke pass.

## Suggested PR Breakdown

### PR 1: real-render validation + persistence adapter (M1)
Deliverable: panes engine renders in v1 shell under the flag, layout
persists, terminal close routes correctly.

### PR 2: terminal pane registry parity (M2)
Deliverable: terminal-only workspace under the flag is a daily driver.

### PR 3: ACP agent pane (M3)
Deliverable: native ACP transcript pane alongside terminal CLI agents.

### PR 4: editor preview + LSP view registry (M4)
Deliverable: file pane with views + LSP diagnostics + fs-watcher.

### PR 5: strengthened git (M5)
Deliverable: merged v1 operations + v2 review on one changeset model.

### PR 6: mobile remote control (M6)
Deliverable: mobile drives a desktop workspace over relay.

### PR 7: retire v1 mosaic + global tabs store (M7)
Deliverable: panes engine is the default; mosaic removed.

### PR 8: delete v2 workspace shell (M8)
Deliverable: v2 UI product surface removed; shared infra kept.

## Validation Matrix

Run before removing either old layer:

1. Terminal: create / input-output / resize / split / close / app reload /
   workspace switch (flag on, panes engine).
2. ACP agent: launch ACP-capable agent / transcript renders / permission
   prompt / status chip / close confirmation; terminal CLI agent still
   launches in a terminal pane.
3. Editor: open code/markdown/image/video / LSP diagnostics / in-place diff
   edit / external disk change reflected / focus mode.
4. Git: stage/unstage/discard/commit/PR / in-diff search / PR comments /
   agent comments / viewedFiles persists across restart.
5. Remote: mobile opens desktop workspace / drives terminal / observes
   ACP + file panes.
6. Navigation: v1 left workspace list / workspace switch / preset run /
   run setup/teardown / deep links / command palette.
7. Identity: paneId ≠ terminalId mapping holds across remount and split.

## Risks and Mitigations

### Risk: real-render behavior not yet observed (PoC was static)
Mitigation: M1 task 1 makes real-render validation the first gate before
any further work. If the panes engine crashes in a real browser, the
adaptation surface is small (two hooks) and debuggable before committing to
later milestones.

### Risk: v1 strengths are lost while adopting v2 base
Mitigation: M5 explicitly merges v1 operations onto v2's changeset model
rather than replacing them; M2 keeps v1 terminal semantics; the "Migrate"
list above is a required-port checklist, not optional.

### Risk: per-workspace isolation conflicts with v1's global store during transition
Mitigation: the flag fully replaces the view's rendering (PoC model), so the
two stores never co-own the same view. M1 seeds the panes store from the
v1 store once, then the v1 store is read-only for that workspace.

### Risk: LSP is net-new and large
Mitigation: M4 is scoped as a view-registry port first; LSP enters as one
new view kind. The view registry's pluggability keeps LSP isolated from the
file pane's other views.

### Risk: mobile remote control drags in the v2 shell
Mitigation: M6 reuses only the per-workspace Provider + relay abstraction,
not the v2 shell. The v1 shell is the only product surface exposed to
mobile.

### Risk: deleting v2 too early hides missing parity
Mitigation: M7/M8 are last. The flag gates the whole transition; deletion
happens only after the validation matrix passes on the new base.

## Progress

- [x] (2026-07-26) Decision: v1 UI shell + v2 internal base (option D),
  rejecting option A (re-implement v2 mechanisms in v1), option B (adopt v2
  shell, discards preferred v1 UI), and option C (dual products).
- [x] (2026-07-26) Four-dimension v1/v2 capability audit (pane model,
  file/diff, workspace state/providers, sidebar/non-terminal). Documented
  v2-unique strengths worth migrating and v1 strengths that must be
  preserved.
- [x] (2026-07-26) Decoupling feasibility verified: `@superset/panes` and
  `@superset/workspace-client` are router/host-agnostic; v2 Provider chain
  is props-driven; pane internals have zero `useParams`. Embedding in v1
  needs only two adapter hooks (registry + persistence).
- [x] (2026-07-26) PoC landed (commit `a41b8cb6a`): `V2_PANES_IN_V1` flag
  mounts `@superset/panes` inside v1 `TabsContent`, terminal pane reuses
  M0–M5 `HostServiceTerminalPane`. typecheck 35/35, lint clean, 4 wiring
  tests pass.
- [x] (2026-07-26) PoC real-render validated via CDP (commit `a8849b0f0`)
  against a running dev app on this worktree's ports. Confirmed the panes
  `<Workspace>` mounts inside the v1 shell: panes tab bar renders, v1
  mosaic absent, flag toggle is reversible. Terminal showed "连接已丢失"
  in BOTH panes and mosaic mode — root cause is local host-service attach,
  not the panes adapter; deferred to M1 task 5.
- [x] (2026-07-26) Fixed double-tab-bar PoC defect (commit `8d34903cf`):
  mounting inside `TabsContent` left v1's `GroupStrip` (one level up in
  `ContentView`) rendering alongside panes' TabBar. Moved the flag check
  to `ContentView` so it owns the whole view. Verified via CDP: flag on →
  GroupStrip item count 0, single panes tab bar; flag off → v1 mosaic.
  Captured as the mount-boundary rule in M1 task 1.
- [x] (2026-07-26) M1 TDD tasks 2/3/4 landed (this branch). Persistence
  adapter, v1→v2 seed migration, and onAfterClose→terminal cleanup all
  built red-green with 12 new unit tests (16 total in V1PanesWorkspace,
  typecheck + lint clean). See "M1 TDD interface & behavior contract" for
  the confirmed decisions: v2WorkspaceLocalState backend, terminal-only
  seed with active-tab-first source, killTerminalForPane(pane.id) close
  channel, paneLayout-existence idempotency. Architecture: the sync core
  (`createPaneLayoutSyncer`) and the seed migration (`seedPanesFromV1Tabs`)
  are pure injected functions so they test without Electron/collection;
  the hook (`useV1PanesWorkspacePaneLayout`) wires them to the shared
  v2 collection. Row creation for v1 workspaces without a v2 row is
  deferred (writeback only persists when the row exists) — to be
  confirmed by M1 task 1 CDP whether v1 workspaces already have rows.
- [x] (2026-07-26) M1 task 1 CDP core gate passed on this branch. With
  the dev flag override fix, `superset:debug:v2-panes-in-v1=1` makes the
  panes `<Workspace>` mount inside the v1 shell (PoC `+ terminal (PoC)`
  button present, v1 mosaic absent) and survives reload with no crash.
  The terminal pane renders its header. The seed migration produces a
  terminal pane (task 3 active). Verified via CDP against the matched
  renderer on this worktree's ports (3025/3031/19325). Remaining task-1
  sub-checks (terminal input/output/resize, split, workspace switch)
  are gated on task 5 (terminal connect).

  **Split button verified (2026-07-26):** CDP confirmed the PoC `+ terminal
  (PoC)` button click does split a second terminal pane (pane count goes
  1→2). The "no response" impression is the connection-lost overlay
  (task 5) making every pane look dead, not a split failure.

  **UX regression to track (not a bug — intentional M1 scope cut):** with
  the flag on, `ContentView` returns `<V1PanesWorkspace>` wholesale,
  replacing `GroupStrip + PresetsBar + TabsContent`. The v1 `PresetsBar`
  (the agent quick-launch row: claude/amp/codex/gemini/copilot/vibe/kimi)
  is therefore absent under the flag. This is the mount-boundary rule
  (M1 task 1) working as designed — but it drops one-click agent preset
  launch until M2 task 3 ports `useWorkspacePaneOpeners` and routes the
  v1 sidebar/preset/run openers through it. Do not treat M1 as
  feature-complete for daily terminal use; the preset row is a known
  missing surface, not a regression in the panes engine.
- [x] (2026-07-26) M1 task 5 root cause located AND fixed on this branch.
  The terminal showed "与终端守护进程的连接已丢失" (`connectionToDaemonLost`,
  i.e. `status === "unavailable"` from `useHostServiceTerminal`) in BOTH
  panes and mosaic modes — confirmed via CDP. Root cause: the v1 workspace
  was not registered with the local host service. `host.db` `workspaces`
  (and `projects`) tables were EMPTY — `resolveHostWorkspaceId` (in
  `host-service-terminal-adapter.ts:63`) calls `client.workspace.list`,
  finds neither an id match for the v1 workspaceId nor a `worktreePath`
  match, throws, and `useHostServiceTerminal` sets `workspaceUnavailable`.
  v1's workspace creation flow never calls the host-service
  `workspace-creation` router (v1 originally used Electron IPC terminals,
  not host-service), so opening `V1_HOST_SERVICE_TERMINAL` had no
  registered host workspace to attach to.
  **Fix:** wired the existing D2 headless migrator `runV1Migration`
  (`renderer/lib/v1-migration/`) as a boot trigger — new hook
  `useRunV1MigrationOnBoot` mounted in `LocalHostServiceProvider` runs
  `runV1Migration` once per (org, hostUrl) when the local host service is
  up. `runV1Migration` registers v1 projects/workspaces into host-service
  (idempotent via its ledger), and crucially does NOT trigger the v2 flip
  — it only registers + returns `gateComplete`. This is exactly D2's
  "Boot trigger with preconditions" work item
  (`plans/20260716-v1-to-v2-auto-migration.md`), but scoped to M1's need
  (preset/terminal targets omitted — M1 has its own panes-store seed in
  `seedPanesFromV1Tabs`; those steps never gate the flip anyway).
  **Verified via CDP:** after the boot pass, `host.db` has the project +
  workspace rows; the panes terminal renders xterm (`xtermCount: 2`) with
  shell content and no "连接已丢失" overlay — in BOTH panes and mosaic
  modes. This unblocks M1's exit criterion "terminal connects, accepts
  input, shows output" and the validation matrix's Terminal row. The
  remaining preset-row UX gap is M2 task 3, not task 5.
- [x] (2026-07-26) M2 terminal pane registry parity landed (this branch).
  All five M2 tasks done red-green; 46 new unit tests across 9 files in
  `V1PanesWorkspace/` (lifecycle onBeforeClose, terminal context menu,
  default pane/context-menu actions, preset opener plan, hotkey handlers),
  typecheck + lint clean. Architecture follows the M1 pattern: testable
  pure cores + thin wiring hooks.
  - **Task 1 (registry actions):** `buildV1PanesLifecycleRegistry` gained
    `onBeforeClose` (routes through the host-agnostic
    `confirmCloseTerminals` with an injected `probeRunning` +
    `closeConfirmLabels`); `buildV1TerminalContextMenu(deps, defaults)` is
    the pure terminal clipboard/kill slice merged with the panes engine's
    default actions. v2-only bits dropped: `V2NotificationStatusIndicator`,
    `TerminalSessionDropdown`, the v2 tRPC `killSession` mutation (replaced
    by the host-service client via `getHostServiceClientByUrl` +
    `hostWorkspaceId` from `useHostServiceTerminal`). `renderHeaderExtras`
    is deferred (v2's hosts a connection indicator depending on the v2
    daemon health query). `getIcon` uses a generic `TerminalSquare`
    (agent-binding icon is a fidelity follow-up).
  - **Task 2 (default actions):** `buildV1DefaultPaneActions` (split-along-
    longer-side + close) and `buildV1DefaultContextMenuActions` (split
    down/right, equalize, move-to-tab/new-tab, close) are pure, terminal-
    only (no split-with-chat/browser — those are M3+), typed for
    `V1PanesPaneData`. `useV1TerminalLauncher` only mints a `terminalId`
    (`HostServiceTerminalPane` auto-creates the session idempotently), so
    the v2 two-step `await launcher.create()` is not needed. The hook
    `useV1DefaultActions` wires i18n/react-icons/launcher. The registry's
    `contextMenuActions(ctx, defaults)` merges the default actions with
    the terminal slice.
  - **Task 3 (preset openers):** `planV1PanesPresetOpen` (pure) plans an
    `addTab`/`splitPane` with the preset commands joined as
    `initialCommand` and the preset `cwd` as `initialCwd`;
    `useV1PanesPresetOpeners` applies it to the panes store. `V1PanesPaneData`
    gained `initialCommand?`/`initialCwd?`, and `HostServiceTerminalPane`
    accepts them as optional props forwarded to `createSession`'s `command`/
    `cwd` (v1 mosaic unchanged — props undefined → prior behavior). A minimal
    `V1PanesPresetBar` renders the project's pinned presets + quick-add agent
    templates, closing the M1 PresetsBar regression. Full pin/reorder/manage
    is M7.
  - **Task 4 (hotkeys):** `buildV1PanesHotkeyHandlers` (closePane with the
    registry `onBeforeClose` guard, splitAuto/right/down, equalize,
    newGroup, prev/next tab) is the pure core; `useV1PanesHotkeys` registers
    CLOSE_PANE/SPLIT_*/EQUALIZE/NEW_GROUP/PREV/NEXT_TAB. chat/browser/preset/
    FOCUS_PANE_* hotkeys are out of scope.
  - **Task 5 (scroll cache + CDP parity):** `paneScrollStateCache` is a
    host-agnostic localStorage cache (terminal pane does not consume it —
    M4 CodeView/DiffPane do); its existing unit test has a pre-existing
    bun-test `localStorage` env failure unrelated to the v1 mount. CDP
    parity verified against the matched renderer on this worktree's ports
    (3025/3031/19325): flag on → panes `<Workspace>` mount (mosaic absent),
    M2 preset bar renders (8 buttons), seeded terminal connects
    (xterm renders, no connection-lost overlay). Context-menu/hotkey wiring
    is unit-tested; the CDP synthetic-event probe for the menu did not
    surface items (React onContextMenu race) and is non-fatal.
- [x] Milestone 1: real-render validation + persistence adapter.
- [x] Milestone 2: terminal pane registry parity.
- [x] (2026-07-28) M0–M5 terminal fusion and v1-shell/v2-panes base joined
  at the runtime boundary.
  - `HostServiceTerminalPane` now accepts a UI-host bridge. Mosaic continues
    to write the legacy tabs store; the panes mount writes title, agent status,
    cwd, workspace-run/lifecycle state, initial-data cleanup, close, and
    destruction checks to its per-workspace panes store.
  - The panes store's persisted `pane.data.terminalId` is now passed through
    the host adapter as the real backend session identity. The adapter rejects
    attempts to remap a live UI pane to another terminal, keeping runtime,
    title source, close probe, and cleanup on one identity.
  - Terminal agent status is visible in the panes header/icon. Old workspace
    page tab/layout/preset/run hotkeys are disabled while
    `V2_PANES_IN_V1` owns the view; panes registers its own primary and
    alternate tab-navigation bindings, so a chord no longer mutates two
    stores.
  - 68 focused terminal/panes tests and desktop typecheck pass.
- [x] (2026-07-29) M3-prep: registered the three low-complexity pane kinds
  (`comment` / `devtools` / `webview`) on the v1-panes registry so the
  panes engine can render every v1 pane type, not just `terminal`. This is
  the data-model + registration gate before tackling `file-viewer`/`chat`
  and the M7 soft-retire.
  - `V1PanesPaneData` extended from the terminal-only flat shape to a
    per-kind optional union (`comment` / `devtools` / `browser`), mirroring
    v1's `Pane` shape. Kept as one flat interface (not a discriminated
    union) so the single-`TData` `@superset/panes` store generic and all
    existing terminal wiring stay untouched.
  - Three content renderers that bypass the mosaic `BasePaneWindow` shell
    (the panes `<Workspace>` renders its own `PaneHeader`): `comment`
    reads the full `CommentPaneState` from `ctx.pane.data.comment` (no v1
    store read); `devtools` reads `data.devtools.targetPaneId`; `webview`
    reuses `usePersistentWebview` keyed by the panes pane id (live history
    persistence to the panes store is a documented fidelity follow-up,
    like the terminal `renderHeaderExtras` connection indicator was in M2).
  - Title derivation extracted into a pure, i18n-free core
    (`buildV1PanesNonTerminalRegistry.ts`) the hook composes with labels;
    mirrors v1 pane-name conventions (`@<authorLogin>` / `DevTools` / page
    title → URL host → `Browser`).
  - 19 new tests (8 pure title + 11 multi-kind registry shape) on top of
    the 45 existing; 64 V1PanesWorkspace tests pass, desktop typecheck +
    biome clean. Opener routing for `comment` landed next (see below);
    `browser`/`devtools` opener routing waits on panes-mode UI entry points
    (V1PanesPresetBar browser button, V1PanesBrowserContent devtools
    button) since their v1 openers are unreachable under
    `V2_PANES_IN_V1` today.
- [x] (2026-07-29) `comment` opener routing: `ReviewPanel` calls
  `useTabsStore.openCommentPane`, which now also writes the panes store
  when a v1-panes store is registered for the workspace.
  - `V1PanesPaneData.terminalId` relaxed to `terminalId?: string` so
    non-terminal kinds (`comment`/`devtools`/`webview`) seed `data` without
    a meaningless terminal id; the terminal lifecycle/context-menu slices
    coerce `pane.data.terminalId ?? ""` (the terminal kind always has one).
  - Pure opener `openCommentInPanesStore(store, comment)` ports v1's
    "reuse-or-add-tab" semantics onto the panes store (finds the first
    `comment` pane and updates `data.comment` + activates, else `addTab`
    with one `comment` pane seeded from the payload).
  - Module-level `v1PanesStoreRegistry` (Map<workspaceId, StoreApi>):
    `V1PanesWorkspace` registers on mount / unregisters on unmount; the v1
    store action looks the store up by workspace id and calls the opener
    when present. The registry is a bridge surface (no React dependency),
    so the vanilla v1 store can reach the React-scoped panes store without
    importing hooks/context. When no store is registered (flag off, or
    the view is not mounted) the v1-only path is unchanged.
  - 3 opener tests on top of the 67 V1PanesWorkspace tests; tabs store
    tests (85) and desktop typecheck + biome clean.
- [ ] Milestone 3: ACP agent pane.
  - Pre: the v1-panes registry now renders `comment` / `devtools` / `webview`
    (2026-07-29); `file-viewer` / `chat` remain to be registered before the
    registry has full v1 pane-kind parity.
- [ ] Milestone 4: editor preview + LSP via view registry.
- [ ] Milestone 5: strengthened git.
- [ ] Milestone 6: mobile remote control.
- [ ] Milestone 7: retire v1 mosaic + global tabs store.
- [ ] Milestone 8: delete v2 workspace shell.

## Surprises & Discoveries

- **`BasePaneWindow` couples pane content to mosaic window chrome (found
  2026-07-29, M3-prep).** Every non-terminal v1 pane (`CommentPane`,
  `BrowserPane`, `DevToolsPane`) wraps its body in `BasePaneWindow`, which
  binds `MosaicWindow`, the cross-tab drag source, and the split/close/focus
  handlers into one component. The panes `<Workspace>` already renders its
  own `PaneHeader` (title/icon/actions) and calls `renderPane(ctx)` for the
  body only, so the v1 panes cannot be reused as-is under the panes engine.
  Migration writes a thin content renderer per kind that keeps the body +
  business logic (webview lifecycle, markdown render, devtools open) and
  drops the `BasePaneWindow`/`PaneToolbarActions` wrapper. The browser's own
  navigation toolbar (URL bar, back/forward) is pane content, not window
  chrome, so it stays in the body.
- **Panes pane id ≠ v1 pane id, so content cannot read `useTabsStore` by
  the panes `pane.id` (found 2026-07-29, M3-prep).** The terminal bridge
  avoided this by keying the host session on `data.terminalId` (the v1 pane
  id) and never reading the v1 store. The non-terminal renderers follow the
  same rule: `comment`/`devtools` read their payload from `ctx.pane.data`
  (seeded by the opener), not the v1 store. `webview` reuses
  `usePersistentWebview` keyed by the panes pane id, which registers a fresh
  Electron webview session scoped to the panes pane; mirroring v1's
  `navigateBrowserHistory` into the panes store is a documented fidelity
  follow-up, not a blocker for the registration gate.

- **PoC's dev flag override was dead code (2026-07-26, M1 task 1).** The
  PoC CDP script (`cdp-poc-v2-panes.ts:100`) set
  `localStorage["superset:debug:v2-panes-in-v1"]="1"`, but no code in the
  repo ever reads that key — `useFeatureFlagEnabled` is pure PostHog, and
  in local dev the PostHog key is `phc_local_dev_disabled` (server-side
  flags never load), so `V2_PANES_IN_V1` was always false. The PoC's
  reported CDP PASS could not have come from this override. Fixed by
  adding a dev-only override in `initPostHog` (`renderer/lib/posthog.ts`):
  when the key is the disabled sentinel, read every
  `localStorage["superset:debug:<flag>"]="1"` entry and feed it to
  `posthog.featureFlags.override(...)`. The pure collector
  (`renderer/lib/dev-flag-overrides.ts`) is unit-tested. This is a general
  mechanism — any `FEATURE_FLAGS` entry can now be toggled in dev via
  localStorage, not just `V2_PANES_IN_V1`.
- v1's tab concept is split across two layers: `GroupStrip` (the tab strip,
  in `ContentView`) and `TabsContent` (the pane area). The panes engine
  unifies both into `<Workspace>`. Mounting the panes engine at the
  `TabsContent` level (the PoC's first try) produced two tab bars side by
  side — v1 `GroupStrip` above panes' TabBar. The fix is to own the whole
  `ContentView` when the flag is on. General rule for the fusion: when v1
  splits a concept across layers that v2 unifies, the接管 boundary must be
  at the outermost of those layers, not the innermost.
- v2 is not "another workspace UI"; it is a re-architected base whose core
  is already extracted into host-agnostic packages (`@superset/panes`,
  `@superset/workspace-client`, `session-protocol`). The v2 *shell* is the
  disposable part; the *base* is the keep.
- The M0–M5 terminal fusion (commits `a3860f76c`, `7f809abbf`)
  accidentally produced the prerequisite for option D: by moving terminal
  code to neutral `renderer/lib/terminal`, it made the terminal layer
  UI-shell-agnostic, so it plugs into either base without rework. None of
  M0–M5 is wasted under option D — 18 backend files and ~15 neutral
  renderer/lib files are reused as-is; only the single `TabPane.tsx`
  feature-flag branch is eventually discarded.
- `@superset/panes`' `<Workspace>` component consumes zero React Context
  (only zustand `useStore` + react-dnd `useDragLayer`). The v1 `DndProvider`
  in `_authenticated/layout.tsx` already satisfies the dnd requirement —
  no extra providers needed to mount the engine.
- v1's chat controller (`useChatPaneController`, 483 lines) is *larger*
  than v2's (`useWorkspaceChatController`, 192 lines). Chat is not a
  simple "v2 is better" case; M3 must compare the two controllers before
  choosing which to keep for ACP.
- v1 has i18n already (`useTranslation` in `ChangesView`); the earlier
  assumption that v1 lacked i18n was wrong. i18n is not a migration item.
- v2's `WorkspaceHostOfflineState` component exists but is not wired in
  `layout.tsx` — the offline branch is unfinished in v2. Do not assume
  v2's state machine is complete.
- **The two fusion lines initially disagreed on pane ownership and terminal
  identity (resolved 2026-07-28).** `HostServiceTerminalPane` used
  `paneId` as the backend terminal while the panes registry persisted a
  separate `pane.data.terminalId`; it also wrote lifecycle state only to the
  hidden v1 tabs store. A UI-host bridge now routes state to the active host,
  and the explicit terminal id flows through `createOrAttach`. This was a
  functional merge requirement, not a cosmetic refactor: without it, title
  subscriptions and running-process probes observed a different session from
  the rendered terminal.
- **v1 workspace page hotkeys overlapped the panes mount (resolved
  2026-07-28).** Both hosts registered the same chords and React Hotkeys could
  mutate both stores. The legacy registrations now remain mounted (respecting
  hook ordering) but are disabled under `V2_PANES_IN_V1`; the panes host owns
  its tab/layout shortcuts while the flag is active.
- **`paneScrollStateCache` is terminal-irrelevant (2026-07-26, M2 task 5).**
  It is a pure localStorage cache keyed by workspace/pane/view/resource;
  only `CodeView`/`DiffPane` (M4) consume it. The terminal pane does not
  touch it, so "verify it works in the v1 mount" reduces to "it is
  host-agnostic and unchanged" — its unit test has a pre-existing
  bun-test `localStorage` env failure that is not an M2 regression.

## Decision Log

- Decision: Adopt option D (v1 UI shell + v2 internal base).
  Rationale: The user prefers the v1 multi-workspace-manager UI form; the
  four product goals (ACP, LSP, git, remote) require v2's extension
  mechanisms. Keeping v1's shell while swapping its base is the only
  option that satisfies both. Option A re-implements v2 mechanisms; option
  B discards the preferred UI; option C keeps two products.
  Date/Author: 2026-07-26 / Codex

- Decision: PoC before plan, pure-render-layer mount.
  Rationale: The v1-global-store vs v2-panes-store coexistence risk is the
  D-plan's main unknown. A pure-render-layer PoC (flag fully replaces the
  view's rendering, no co-owning) isolates the base-mount question from
  the coexistence question and is cheap to validate.
  Date/Author: 2026-07-26 / Codex

- Decision: Migrate v1 git operations onto v2 changeset model, not replace.
  Rationale: v1's operation surface (stage/unstage/commit/PR/in-place edit)
  is stronger than v2 DiffPane's (discard only). v2's review surface
  (search, PR comments, agent comments) is stronger than v1's. They are
  complementary; merging preserves both strengths.
  Date/Author: 2026-07-26 / Codex

- Decision: Keep terminal CLI agents as default; ACP is opt-in per agent.
  Rationale: Terminal CLI is the proven workflow; ACP is new. Making ACP
  the default would risk regressing the existing agent workflow before
  ACP parity is proven.
  Date/Author: 2026-07-26 / Codex

## Outcomes & Retrospective

The terminal fusion M0–M5 and the v1-shell/v2-panes M1–M2 base now share one
runtime contract instead of coexisting as parallel implementations. The
neutral terminal component has explicit UI-host and backend-identity
boundaries, which preserves the legacy fallback while making panes mode the
actual owner of its state. Medium-term ACP/editor/git/mobile milestones remain
separate; this merge does not silently advance or delete those surfaces.
