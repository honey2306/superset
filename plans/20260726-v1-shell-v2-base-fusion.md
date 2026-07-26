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
2. Replace the in-memory store with a persistence adapter modeled on
   `useV2WorkspacePaneLayout` but backed by v1's persistence
   (`trpcTabsStorage` or a per-workspace key) instead of TanStack DB
   collections. Use only `store.replaceState` + `store.subscribe`.
3. Seed the panes store from the existing v1 tabs store on first mount of a
   workspace (one-time migration of open tabs/panes), so users do not lose
   their layout on first flag-on.
4. Verify pane close routes to the M0–M5 backend-aware terminal-cleanup
   (park vs kill) — the PoC left `onAfterClose` unwired.

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
- [ ] Milestone 1: real-render validation + persistence adapter.
- [ ] Milestone 2: terminal pane registry parity.
- [ ] Milestone 3: ACP agent pane.
- [ ] Milestone 4: editor preview + LSP via view registry.
- [ ] Milestone 5: strengthened git.
- [ ] Milestone 6: mobile remote control.
- [ ] Milestone 7: retire v1 mosaic + global tabs store.
- [ ] Milestone 8: delete v2 workspace shell.

## Surprises & Discoveries

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

(To be filled as milestones land. The terminal fusion M0–M5 outcomes are
recorded in `plans/20260724-v1-v2-terminal-fusion.md`; this plan builds on
that base and retires the v1 render layer and the v2 product shell in its
final milestones.)
