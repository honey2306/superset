# Code Context

## Files Retrieved

1. `packages/panes/src/react/components/Workspace/Workspace.tsx` (lines 153-178) - tab keep-alive lifecycle: visited tabs remain mounted; inactive tab wrappers receive Tailwind `hidden` (`display: none`), while `RendererContext.isActive` changes.
2. `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/components/PanesWorkspace/usePanesWorkspace.tsx` (lines 415-440) - ACP pane registry entry; forwards `ctx.isActive` as `AcpSessionPane.isFocused`.
3. `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/components/AcpSessionPane/AcpSessionPane.tsx` (lines 91-137, 417-430) - declares `isFocused`, defaults it false, and renders `AcpTimeline`. The current working tree newly forwards `isFocused` to the timeline at line 428.
4. `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/components/AcpSessionPane/components/AcpTimeline/AcpTimeline.tsx` (lines 162-205, 226-257, 330-380) - owns `scrollRef`, `autoFollow`, scroll handling, timeline-update following, and (in the current working tree) a focus-transition/rAF correction.
5. `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/components/AcpSessionPane/components/AcpTimeline/AcpTimeline.test.tsx` (lines 300-479) - existing follow/manual-position tests plus current-working-tree hidden-tab regression tests.
6. `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/components/PanesWorkspace/PanesWorkspace.keepAlive.test.tsx` (lines 45-119) - verifies lazy mount, no unmount on tab switches, `context.isActive` transitions, and inactive wrapper `hidden`/`aria-hidden` behavior.

## Key Code

`Workspace` keeps visited tabs alive but removes inactive tabs from layout:

```tsx
const isDisplayed = tab.id === displayedTab?.id;
<div className={cn("min-h-0 min-w-0 flex-1", !isDisplayed && "hidden")}>
  <Tab isActive={isActive && isDisplayed} ... />
</div>
```

`AcpTimeline`'s original item-follow effect (lines 330-359) follows by reading layout immediately:

```tsx
if (!hasInitiallyScrolledRef.current || autoFollow || hasNewUserMessage) {
  el.scrollTop = el.scrollHeight;
  hasInitiallyScrolledRef.current = true;
}
```

When its ancestor is `display:none`, `scrollHeight` is zero. Thus a stream update in an inactive, already-visited tab executes the effect but records `scrollTop = 0`. Switching tabs changes visibility, but without a visibility/focus dependency the timeline items have not changed again, so nothing retries the scroll after layout becomes measurable.

The current working tree already contains an uncommitted candidate correction in `AcpTimeline.tsx` lines 361-377:

```tsx
const becameFocused = isFocused && !wasFocusedRef.current;
...
if (!becameFocused || !autoFollow) return;
const frame = window.requestAnimationFrame(() => {
  const el = scrollRef.current;
  if (el) el.scrollTop = el.scrollHeight;
});
```

This preserves intentional manual reading positions (`autoFollow === false`) and waits one animation frame for layout after `display:none` is removed. The plumbing is `RendererContext.isActive` → `usePanesWorkspace.tsx` → `AcpSessionPane.isFocused` → `AcpTimeline.isFocused`.

## Architecture

The panes package lazily mounts tab content once and then keeps it mounted. ACP streaming therefore continues updating React state and the timeline while its tab is inactive. Inactivity is represented both as `ctx.isActive === false` and CSS `display:none`. `AcpTimeline` independently tracks whether the reader wants automatic following (`autoFollow`), toggled by scroll proximity. Timeline mutations trigger immediate scroll-to-height, but CSS-hidden layout makes that height zero. The appropriate lifecycle signal is the already-existing pane `isActive`/`isFocused` path, not session stream state or unread notification state.

Likely cause: the timeline follow effect is data-driven only and assumes a measurable scroll container. Keep-alive changed/remains relevant because hidden tabs are mounted yet have zero layout; tab activation itself did not trigger a post-layout follow attempt.

Existing test coverage:

- `AcpTimeline.test.tsx` lines 300-339: a new user prompt forces bottom even from a manual reading position.
- lines 341-374: near-bottom updates follow; manual jump button works.
- lines 306-339: manual reading position survives ordinary timeline updates.
- current uncommitted lines 376-444: exact hidden update → show tab → rAF → bottom regression.
- current uncommitted lines 446-479: hidden/show must preserve a manual reading position.
- `PanesWorkspace.keepAlive.test.tsx` verifies the underlying tab lifecycle but does not integrate a real ACP timeline.

Recommended regression-test seam: keep the focused unit/component seam at `AcpTimeline.test.tsx`. Render with `isFocused={false}`, mock element metrics as `{clientHeight: 0, scrollHeight: 0}`, rerender with additional timeline items, then restore measurable metrics, rerender with `isFocused={true}`, flush a captured `requestAnimationFrame`, and assert `scrollTop === scrollHeight`. Pair it with the manual-position negative case. This directly and deterministically reproduces the browser condition without needing ACP websocket/session mocks. A broader panes integration test would be useful only to verify prop plumbing, since `PanesWorkspace.keepAlive.test.tsx` already establishes `ctx.isActive` and `display:none` semantics.

Risk/constraint: do not scroll on every focus transition unconditionally; users who deliberately scrolled upward must retain their position. Also defer until rAF because a synchronous focus effect can still observe the old hidden geometry.

Note: the relevant files are modified in the current working tree. The `isFocused` timeline prop/effect and the two hidden-tab tests are uncommitted candidate changes, not baseline behavior; no files were edited during this scout task.

## Start Here

Open `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/components/AcpSessionPane/components/AcpTimeline/AcpTimeline.tsx` at lines 330-377. It contains both the failing data-driven scroll logic and the current candidate focus-transition fix.
