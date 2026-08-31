# Mobile Complete Conversation History Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Make the phone session page progressively load and render every retained conversation-history page instead of stopping at the newest page.

**Architecture:** Keep pagination ownership in the shared `useAcpSession` hook and add a phone-route orchestration effect that requests the next older page until `hasOlder` becomes false. Preserve the newest-page-first paint, show background loading/failure feedback, and retain the existing bounded timeline scroller.

**Tech Stack:** React 19, TypeScript, Bun test, Biome.

---

### Task 1: Lock the phone history behavior with a regression test

**Files:**
- Modify: `apps/web/src/routes/mobile-remote-ux.test.ts`

1. Add an assertion that the phone session route watches `hasOlder` and calls `loadOlder`.
2. Run `bun run test --filter=@superset/web` and confirm the new assertion fails before implementation.

### Task 2: Progressively load all retained history

**Files:**
- Modify: `apps/web/src/routes/session.tsx`

1. Add a guarded React effect that calls `session.loadOlder()` only when initial loading is complete, an older page exists, no older-page request is active, and no history error is present.
2. Show a compact loading label while older pages are loading.
3. Show an explicit retry action after a history-page failure.
4. Run the focused web tests and confirm they pass.

### Task 3: Verify and finish

**Files:**
- Modify: `apps/web/plans/20260831-mobile-complete-conversation-history.md`
- Move after verification: `apps/web/plans/done/20260831-mobile-complete-conversation-history.md`

1. Run web typecheck.
2. Run root lint on the changed files and resolve all warnings.
3. Review the final diff to ensure unrelated existing work is untouched.
4. Move this plan to `apps/web/plans/done/` after successful verification.
