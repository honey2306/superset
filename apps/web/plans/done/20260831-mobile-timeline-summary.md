# Mobile Timeline Summary Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Make the phone transcript collapse execution details into a compact per-turn summary while preserving readable messages, Working state, and elapsed time.

**Architecture:** Group the flat folded timeline into user-initiated turns using a phone-local pure utility that mirrors the desktop turn model. Render tool activity behind an expandable summary, keep user/assistant text visible, and derive duration from timeline timestamps; the active Working indicator ticks from the latest user message timestamp.

**Tech Stack:** React 19, TypeScript, Bun tests, Biome.

---

### Task 1: Add tested turn grouping and duration utilities

**Files:**
- Create: `apps/web/src/components/Timeline/utils/timelineTurns/timelineTurns.ts`
- Create: `apps/web/src/components/Timeline/utils/timelineTurns/timelineTurns.test.ts`
- Create: `apps/web/src/components/Timeline/utils/timelineTurns/index.ts`

1. Add a failing unit test for grouping multiple user turns, recursively counting tool calls, selecting the final assistant message, and deriving timestamps.
2. Implement the smallest pure utility that passes those cases.
3. Verify the focused utility behavior.

### Task 2: Render a collapsed execution summary

**Files:**
- Create: `apps/web/src/components/Timeline/components/ExecutionSummary/ExecutionSummary.tsx`
- Create: `apps/web/src/components/Timeline/components/ExecutionSummary/index.ts`
- Modify: `apps/web/src/components/Timeline/TimelineView.tsx`

1. Render each turn as user message, compact execution summary, readable assistant messages, and final assistant response.
2. Hide tool-call rows by default and allow the summary to expand/collapse them.
3. Show per-turn elapsed time in the summary.

### Task 3: Add elapsed time to Working

**Files:**
- Modify: `apps/web/src/components/Timeline/WorkingIndicator.tsx`
- Modify: `apps/web/src/components/Timeline/WorkingIndicator.test.ts`
- Modify: `apps/web/src/routes/session.tsx`
- Modify: `apps/web/src/routes/mobile-remote-ux.test.ts`

1. Pass the latest user-turn start timestamp into WorkingIndicator.
2. Tick once per second while active and render a compact formatted duration.
3. Keep permission/response-specific Working labels intact.

### Task 4: Verify and finish

**Files:**
- Move after verification: `apps/web/plans/done/20260831-mobile-timeline-summary.md`

1. Run web typecheck and production build.
2. Run root lint and `git diff --check`.
3. Confirm existing complete-history and bounded-scroll changes remain intact.
4. Move this plan to `apps/web/plans/done/`.
