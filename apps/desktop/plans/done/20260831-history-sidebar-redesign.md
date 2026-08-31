# History Sidebar Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Replace the dense split History sidebar with the approved current-branch-first, single-scroll, inline-details design.

**Architecture:** Keep `LogView` as the data/query owner, move reusable search and pagination behavior into tested utilities, and make each `GitHistoryRow` own the visual graph lane plus an optional inline details region supplied by `LogView`. Extend the host-service log query with one search term that matches either commit message or author while preserving topology order before pagination.

**Tech Stack:** React, TanStack Query, Bun tests, tRPC, simple-git, Tailwind CSS, Biome.

---

### Task 1: Search and pagination behavior

**Files:**
- Modify: `packages/host-service/src/trpc/router/git/git.ts`
- Modify: `packages/host-service/src/workers/tasks/git.ts`
- Test: `packages/host-service/test/integration/git-changes-capabilities.integration.test.ts`
- Create: `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/ChangesView/components/LogView/utils.ts`
- Create: `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/ChangesView/components/LogView/utils.test.ts`

**Steps:**
1. Add failing tests for case-insensitive message-or-author search and stable result merging/pagination.
2. Run the targeted tests and verify failure.
3. Add a `search` input to `listLog`; collect message and author matches, preserve repository topology order, deduplicate by hash, then paginate.
4. Add small renderer utilities for toggling a selected hash and deriving loaded-result labels.
5. Run targeted tests and verify success.

### Task 2: History toolbar and rows

**Files:**
- Modify: `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/ChangesView/components/LogView/LogView.tsx`
- Modify: `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/ChangesView/components/LogView/GitHistoryRow.tsx`
- Create: `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/ChangesView/components/LogView/GitGraphCommitNode/GitGraphCommitNode.tsx`
- Create: `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/ChangesView/components/LogView/GitGraphCommitNode/index.ts`
- Modify: `apps/desktop/src/renderer/providers/I18nProvider/messages.ts`

**Steps:**
1. Default the branch scope to the current branch.
2. Keep the branch scope control visible at all sidebar widths using a compact popover/dropdown treatment.
3. Replace author pills with muted text, keep relative time visible, and render a graph node/lane.
4. Keep branch/tag badges secondary and show commit actions on hover/focus.
5. Add or update localized strings.

### Task 3: Inline commit details

**Files:**
- Modify: `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/ChangesView/components/LogView/LogView.tsx`
- Modify: `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/ChangesView/components/LogView/GitHistoryRow.tsx`

**Steps:**
1. Make clicking the selected commit toggle it closed.
2. Render selected commit stats, changed files, short hash, and copy action inside the selected row.
3. Remove the fixed lower details panel and its second scroll container.
4. Preserve file-open behavior and reset confirmation behavior.

### Task 4: Verification

**Files:**
- Test all modified files above.

**Steps:**
1. Run targeted renderer and host-service tests.
2. Run desktop and host-service TypeScript checks.
3. Run Biome on modified files and fix all warnings.
4. Preview the actual renderer when available; otherwise verify the approved standalone prototype and explicitly report that limitation.
5. Move this plan to `apps/desktop/plans/done/` after implementation ships.
