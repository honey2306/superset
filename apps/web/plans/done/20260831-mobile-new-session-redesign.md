# Mobile New Session Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Redesign the phone workspace route around a clear, touch-friendly “new conversation” flow while preserving session creation and recent-session access.

**Architecture:** Replace the native agent select and side-by-side Start button with semantic radio-card choices backed by the existing ACP catalog, then place one full-width primary action below the choices. Keep loading/error behavior unchanged and visually demote existing workspace sessions into a compact “Recent conversations” section.

**Tech Stack:** React 19, TypeScript, CSS, Bun tests, Biome, Vite, managed browser verification.

---

### Task 1: Enrich and test launch options

**Files:**
- Modify: `apps/web/src/routes/workspace/utils/agentLaunchOptions/agentLaunchOptions.ts`
- Modify: `apps/web/src/routes/workspace/utils/agentLaunchOptions/agentLaunchOptions.test.ts`

1. Extend ACP launch options with canonical label and description from the shared agent catalog.
2. Verify every harness-backed option retains the correct id/harness and user-facing metadata.

### Task 2: Replace the new-session form

**Files:**
- Modify: `apps/web/src/routes/workspace.tsx`
- Modify: `apps/web/src/routes/mobile-remote-ux.test.ts`

1. Replace the select with accessible radio-card choices and strong selected state.
2. Add a concise page title/description and one full-width “Start conversation” action.
3. Preserve disabled, loading, warning, creation, and navigation behavior.
4. Render existing sessions as a clearly secondary recent-conversations section.

### Task 3: Add mobile visual styling

**Files:**
- Modify: `apps/web/src/styles.css`

1. Add the new-page shell, agent-card grid, selected indicator, agent accents, action button, and recent-session styling.
2. Ensure touch targets are at least 44px and the layout works at narrow phone widths.
3. Respect safe-area padding and existing phone design tokens.

### Task 4: Verify and finish

**Files:**
- Move after verification: `apps/web/plans/done/20260831-mobile-new-session-redesign.md`

1. Run focused web regressions, typecheck, production build, root lint, and `git diff --check`.
2. Use a local mobile-width browser preview to inspect semantics and capture a screenshot.
3. Confirm the create mutation still receives the selected harness and navigates to the created session.
4. Move this plan to `apps/web/plans/done/`.
