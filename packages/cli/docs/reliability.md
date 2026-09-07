# CLI reliability investigation

## Runtime boundaries

```text
TTY bytes → readline keypress → composer / deferred command
                                  ↓
                    CLI view state (session IDs, draft, viewport)
                                  ↓
                    AcpSessionController (history + live state)
                        ↙                       ↘
              HTTP control mutations        WebSocket event stream
                        ↘                       ↙
                         local Host service → ACP adapter
                                  ↓
                    folded timeline → Markdown → Screen diff → TTY
```

HTTP acceptance is not proof of a healthy reply subscription. Input decoding,
controller liveness and terminal painting can each independently look like a
model that stopped replying.

## Verified defects and changes

- Unknown readline keys were all treated as SGR mouse reports. After an unknown
  escape sequence, subsequent text and Enter were swallowed until an `M`/`m`.
  Match the exact mouse prefix and abandon malformed/bounded partial reports.
- Session list refresh replaced objects captured by the live callback. Updates
  reached an orphaned object rather than the displayed row. Resolve by session
  ID on every update and reject callbacks from a switched-away session.
- Controller resync/bootstrap retries can exhaust with no subscription. Reusing
  that controller could still send HTTP prompts without receiving replies.
  Explicitly refresh unavailable controllers; surface failed recovery before
  submitting another prompt. `start()` alone cannot recover a started controller.
- Controller errors and deferred command rejections were not consistently shown.
  Surface them, show submission acknowledgement, and bound HTTP waits to 30s.
  A timeout is an **unknown mutation outcome**, not proof that sending failed;
  do not automatically retry mutations.
- History loading and live folding independently overwrote the message list.
  Opening idle sessions now also attaches the shared controller, and `/history`
  loads its next page rather than replacing the view through a second fetch path.
- Spinner ticks re-rendered/highlighted unchanged historical Markdown. A bounded
  LRU caches completed layouts by width, role, agent and text (128 entries,
  one million UTF-16 characters of keys plus rendered lines). Streaming text
  remains uncached. Turn elapsed time no longer restarts on each update.

## Evidence

- Five original regression cases failed before fixes: unknown input, truncated
  mouse report, list refresh, stale session callback and hidden controller error.
- Two additional unavailable-controller regression cases failed before recovery
  was added. A real `AcpSessionController` fixture verifies four failed bootstrap
  attempts, zero subscriptions, then a successful refresh creating a subscription.
- Automated PTY probe against the existing compiled binary: after
  `ESC[999~zzprobe`, launcher emitted zero bytes and text did not appear.
  Same probe against changed source and rebuilt binary: text appeared (740 output
  bytes). This is a narrow terminal integration check, not the original full
  multi-turn user journey. No screenshots or live model turns were captured.
- Synthetic 16-message code-heavy transcript, 10 warmed renders: mean layout time
  40.61ms without cache versus 0.23ms cached. This measures completed-message
  layout, not total terminal latency or model response time.

Commands:

```sh
bun run --cwd packages/cli test
bun run --cwd packages/cli typecheck
bun run --cwd packages/session-protocol test
bun run --cwd packages/cli build
```

## Remaining evidence gaps / architecture risks

- The user's exact multi-turn stall has not been reproduced. Do not infer that
  every stall has been eliminated from the narrower tests above.
- The independent review's proposed permanent-loading race is not established:
  `attach` occurs after awaited history, and stale generations cannot publish.
  Overlapping refresh alone does not prove that the newest refresh cannot finish.
- Cross-epoch sorting risk needs a valid producer trace. `loadTurn` and older-page
  completion check generation before merging, and resync clears loaded turns;
  stale requests therefore do not by themselves establish the proposed mixing.
  Pending-prompt normalization mismatch likewise remains unverified.
- CLI view/input orchestration is still large and module-scoped. Further separation
  of input decoding, presentation and command admission needs broader PTY tests,
  especially rapid session switching and concurrent submission.
- Active streaming still lays out the growing reply; terminal write backpressure,
  very large histories and unusual terminal key protocols need further stress tests.
- Local diagnostics found CLI 2.2.1 with Host 2.2.0. Host was reachable and authenticated;
  this mismatch is not a proven cause. No Host restart or Desktop replacement was done.
- Root lint remains blocked by unrelated existing workspace files; changed CLI
  files pass targeted Biome checks. Existing work was preserved, not globally auto-fixed.

The installed shell command points to `packages/cli/dist/superset`. Rebuild and
restart the CLI to pick up source edits; rebuilding does not update an already
running CLI process.
