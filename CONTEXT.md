# Code Context

## Files Retrieved
1. `packages/host-service/src/runtime/acp-sessions/codex-app-server-acp.ts` (lines 27-39, 420-489) - Codex notification translation; `thread/compacted` is explicitly discarded as quiet.
2. `packages/host-service/src/runtime/acp-sessions/acp-sessions.ts` (lines 240-286, 1918-1988) - harness process selection and the common `handleUpdate` journal/state seam.
3. `packages/session-protocol/src/fold/fold.ts` (lines 19-137, 285-393) - render model and exhaustive ACP update folding; no notice/event timeline item exists and unknown updates are ignored.
4. `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/components/AcpSessionPane/components/AcpTimeline/AcpTimeline.tsx` (lines 1-145) - renderer dispatch supports only message/tool/plan.
5. `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/components/AcpSessionPane/components/AcpTimeline/components/AcpUnknownContent/AcpUnknownContent.tsx` (lines 1-17) - fallback is diagnostic JSON, unsuitable for a compaction notice.
6. `/Users/wufan/.bun/install/cache/@agentclientprotocol/claude-agent-acp@0.56.0@@registry.npmjs.org@@@1/dist/acp-agent.js` (lines 648-652, 727-729, 904-975) - pinned Claude bridge behavior and exact emitted ACP shapes.
7. `/Users/wufan/.bun/install/cache/pi-acp@0.0.33@@registry.npmjs.org@@@1/dist/index.js` (lines 1181-1200, 2070-2102) - pinned Pi automatic and manual compaction translations.
8. `/Users/wufan/.bun/install/cache/pi-acp@0.0.33@@registry.npmjs.org@@@1/README.md` (lines 142-149) - manual `/compact` and `/autocompact` command contract.
9. `/Users/wufan/.nvm/versions/node/v22.22.3/lib/node_modules/@myflicker/cli/dist/cli.mjs` (minified offsets 3,322,466-3,326,900 and 8,698,753-8,702,200; grep reports lines 7857-7864) - installed mfcli 0.3.15 ACP message listener and internal compact-summary representation.
10. `packages/session-protocol/src/fold/fold.test.ts` (lines 1-40 and existing fold cases through file) - primary pure-fold test location.
11. `packages/host-service/src/runtime/acp-sessions/codex-app-server-acp.test.ts` - adapter translation unit tests.
12. `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/components/AcpSessionPane/components/AcpTimeline/AcpTimeline.test.tsx` - timeline rendering tests.

## Key Code

### What each harness emits

**Claude (`claude-agent-acp` 0.56.0)**

The bridge observes Claude SDK status messages and converts them to ordinary assistant text:

```ts
// acp-agent.js:904-935
status === "compacting"
=> { sessionUpdate: "agent_message_chunk",
     content: { type: "text", text: "Compacting..." } }

compact_result === "success"
=> { sessionUpdate: "agent_message_chunk",
     content: { type: "text", text: "\n\nCompacting completed." } }

compact_result === "failed"
=> { sessionUpdate: "agent_message_chunk",
     content: { type: "text", text: `\n\nCompacting failed${reason}` } }
```

A subsequent `compact_boundary` emits:

```ts
{ sessionUpdate: "usage_update", used: postCompactTokensOrZero,
  size: session.contextWindowSize }
```

The source comment says manual `/compact` completion is identified by `compact_result`; `compact_boundary` only fires when content existed. The same `status: "compacting"` path is also the observable path for automatic compaction, so the ACP output does **not** carry a manual/automatic discriminator. Start/success/failure are currently rendered as a normal agent bubble and can merge with adjacent assistant chunks.

**Pi (`pi-acp` 0.0.33)**

Automatic Pi RPC events are converted to ordinary assistant chunks:

```ts
// dist/index.js:1181-1199
auto_compaction_start => {
  sessionUpdate: "agent_message_chunk",
  content: { type: "text", text:
    "Context nearing limit, running automatic compaction..." }
}
auto_compaction_end => {
  sessionUpdate: "agent_message_chunk",
  content: { type: "text", text:
    "Automatic compaction finished; context was summarized to continue the session." }
}
```

Manual `/compact [instructions]` synchronously calls RPC `compact` and then emits one chunk (lines 2074-2100):

```ts
{
 sessionUpdate: "agent_message_chunk",
 content: { type: "text", text:
   `Compaction completed.${custom ? " (custom instructions applied)" : ""}` +
   optionalTokensBefore + optionalSummary }
}
```

There is no manual start notification and a thrown compact RPC error does not produce a normalized failure update. Unlike Claude, Pi text distinguishes automatic vs manual.

**Codex (`codex-app-server`)**

Codex app-server sends a native JSON-RPC notification with shape:

```ts
{ method: "thread/compacted", params: Record<string, unknown> }
```

but `codex-app-server-acp.ts:28-39` includes it in `QUIET_NOTIFICATIONS`, and the handler at lines 420-489 has no compaction branch. Therefore **nothing reaches ACP, the journal, fold, or UI** for either automatic/native compaction. The adapter currently does not expose a `/compact` ACP available command, so there is no Superset manual Codex compaction path to report. Exact `params` fields are intentionally untyped in this adapter and need fixture capture/version confirmation before surfacing token counts or reason.

**MyFlicker (`mfcli 0.3.15`; host comment still references 0.3.14)**

The runtime is external (`mfcli --approval-mode yolo acp`; `acp-sessions.ts:268-274`), not bundled or translated by host-service. Its internal history marks the generated summary as:

```js
{ role: "user", isCompactSummary: true,
  content: [{ type: "text", text: summary }], ... }
```

and internal `sessionStart({source})` recognizes `source === "compact"`. However, inspection of its ACP listener (`listenChunkEvent`, minified line 7858) shows translation of normal messages/tool/todo/agent progress only; no compaction-specific `sessionUpdate` shape or literal completion notification was found. Thus manual `/compact` and automatic compaction are internal lifecycle/history mutations with **no attested ACP notification** in 0.3.15. A context usage update/drop may occur independently, but it is not a reliable lifecycle event or manual/automatic discriminator.

### Current normalization/rendering gap

`acp-sessions.ts:1918-1922` is the one common ingress:

```ts
const update = notification.update;
if (this.shouldSuppressPiBootstrapUpdate(runtime, update)) return;
this.journalFrame(runtime, { kind: "update", update });
```

`fold.ts:293-393` only understands standard ACP variants. `TimelineItem` is exactly `MessageItem | ToolCallItem | PlanItem`; unknown variants are silently ignored. `AcpTimeline.tsx:96-145` correspondingly renders message/tool/plan only.

A robust local representation should be a **Superset envelope/frame extension**, e.g. a journaled `kind: "context_compaction"` frame carrying:

```ts
{
 phase: "started" | "completed" | "failed";
 trigger: "manual" | "automatic" | "unknown";
 message?: string;
 tokensBefore?: number;
 tokensAfter?: number;
 error?: string;
}
```

Do not add a fake `sessionUpdate` discriminator to the upstream ACP SDK union. Normalize before/while journaling in host-service, then fold that local frame into a dedicated `TimelineItem` such as `{kind:"context_compaction", ...}`. This preserves history/reconnect and avoids UI text matching.

For sources under Superset control, emit structured signals at the adapter boundary:
- Codex: translate `thread/compacted` directly in `codex-app-server-acp.ts` (rather than quieting it), after first capturing actual params.
- Pi bundled bridge: best long-term fix is upstream `pi-acp` structured `_meta`; locally, host ingress can temporarily recognize its exact pinned chunks and suppress their conversion to ordinary messages.
- Claude bundled dependency: likewise requires upstream structured `_meta` or a build-time patch; exact pinned text recognition is feasible but version-fragile.
- MyFlicker: host cannot see its internal compaction today. Requires mfcli ACP upstream support (preferred) or a wrapper/proxy around mfcli with an observable lifecycle API. Usage-drop inference is not sufficient for attested start/failure/trigger semantics.

## Architecture

Adapter process -> ACP `session/update` -> `AcpSessionManager.handleUpdate` -> durable journal/envelopes -> session-protocol `foldEnvelope` -> `FoldedTimeline.items` -> desktop `AcpTimeline.renderItem`.

The host ingress knows `runtime.state.harness`, so it is the feasible cross-harness normalization seam. The durable local frame/type belongs in `packages/session-protocol`, not desktop-only state. Adapter-specific recognition belongs either in each adapter or small pure normalizer functions called by `handleUpdate`, with per-harness tests.

## Exact files/tests to change

1. `packages/session-protocol/src/envelope.ts` - add the local compaction frame/event shape (or a separate exported event type referenced by the update frame).
2. `packages/session-protocol/src/api.ts` - update runtime validation for persisted/streamed envelopes if the frame union is extended.
3. `packages/session-protocol/src/fold/fold.ts` - add `ContextCompactionItem`, extend `TimelineItem`, fold lifecycle frames without merging them into assistant text.
4. `packages/session-protocol/src/fold/fold.test.ts` - start/completed/failed, manual/automatic/unknown, history replay, ordering, and adjacent message non-merging.
5. `packages/host-service/src/runtime/acp-sessions/acp-sessions.ts` - invoke harness-aware normalization at `handleUpdate` before journaling; avoid duplicate original text when recognized.
6. Add `packages/host-service/src/runtime/acp-sessions/context-compaction.test.ts` (and implementation beside it) - exact Claude/Pi shapes, non-match safety, duplicate starts/results, usage correlation.
7. `packages/host-service/src/runtime/acp-sessions/codex-app-server-acp.ts` - remove `thread/compacted` from quiet-only handling and emit structured metadata/signal.
8. `packages/host-service/src/runtime/acp-sessions/codex-app-server-acp.test.ts` and `packages/host-service/test/fixtures/fake-codex-app-server.ts` - fixture notification and asserted translated shape, including unknown/missing params.
9. New component under `apps/desktop/.../AcpTimeline/components/AcpContextCompactionItem/` plus barrel - dedicated notice UI.
10. `apps/desktop/.../AcpTimeline/AcpTimeline.tsx` - dispatch the new timeline item.
11. `apps/desktop/.../AcpTimeline/AcpTimeline.test.tsx` - render all phases/triggers and history replay.
12. `apps/desktop/.../AcpSessionPane/acp-pane.css` - notice styling.
13. For true all-four coverage: upstream changes/tests in `@agentclientprotocol/claude-agent-acp`, `pi-acp`, and `@myflicker/cli`; only Codex adapter is presently first-party source in this repo.

## Review findings

- **blocker:** MyFlicker 0.3.15 exposes no compaction lifecycle through ACP; “all four” cannot be implemented faithfully from current host-visible events without an upstream mfcli change.
- **high:** `codex-app-server-acp.ts:34,420-489` deliberately drops the only Codex compaction notification.
- **high:** Claude and Pi encode lifecycle as ordinary `agent_message_chunk`; current fold merges it with assistant prose, losing semantic identity.
- **medium:** Claude does not expose manual vs automatic in its translated ACP shape. Trigger must remain `unknown` unless upstream adds metadata or host correlates a known `/compact` prompt (correlation is incomplete for automatic/manual command aliases).
- **medium:** Codex `thread/compacted.params` is `Record<string, unknown>` here; do not invent fields without capturing the pinned app-server event.
- **medium:** installed mfcli is 0.3.15 while host-service comments describe 0.3.14; behavior/version should be pinned or compatibility-tested.

## Residual risks

- Text matching pinned Claude/Pi messages can misclassify model-authored identical prose and will break on upstream wording/localization changes.
- Compaction start without completion (process death/cancel) needs a terminalization policy, as does duplicate status emission.
- Historical adapters may already have persisted compaction text; migration/backfill would require heuristic folding, otherwise notices only apply to new events.
- A usage drop is corroborating evidence only; model changes and session restoration can also reduce/change usage.
- Manual MyFlicker/Codex behavior remains unverified end-to-end; source inspection alone cannot establish native event timing or params.

## Start Here

Open `packages/host-service/src/runtime/acp-sessions/acp-sessions.ts` at `handleUpdate` (lines 1918-1988). It is the only harness-aware common ingress and determines whether a normalized event becomes durable and replayable.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Concrete blocker/high/medium findings and exact runtime, fold, UI, dependency-source, and test paths are listed above with emitted event shapes."
    }
  ],
  "changedFiles": [],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "targeted find/grep/read of host-service, session-protocol, desktop UI, Bun package cache, and installed mfcli 0.3.15",
      "result": "passed",
      "summary": "Confirmed Claude/Pi text update shapes, Codex dropped native event, MyFlicker lack of ACP compaction translation, and the common fold/render gap."
    }
  ],
  "validationOutput": [
    "No repository files were edited; findings were written only to the required context.md artifact.",
    "Claude bridge emits Compacting start/success/failure agent_message_chunk plus post-boundary usage_update.",
    "Pi emits distinct automatic start/end chunks and one manual completion chunk.",
    "Codex thread/compacted is in QUIET_NOTIFICATIONS.",
    "MyFlicker internal compact summary/source markers are not translated into an ACP compaction notification."
  ],
  "residualRisks": [
    "MyFlicker requires upstream ACP lifecycle exposure for faithful all-four support.",
    "Codex params and manual behavior require runtime fixture capture.",
    "Claude trigger kind cannot be distinguished from current ACP output.",
    "Text-based fallback normalization is version-fragile and collision-prone."
  ],
  "noStagedFiles": true,
  "diffSummary": "No code diff; investigation artifact only.",
  "reviewFindings": [
    "blocker: installed @myflicker/cli ACP listener - no host-visible compaction lifecycle event",
    "high: packages/host-service/src/runtime/acp-sessions/codex-app-server-acp.ts:34 - thread/compacted is discarded",
    "high: packages/session-protocol/src/fold/fold.ts:113,293-393 - no semantic compaction timeline item/fold case"
  ],
  "manualNotes": "Dependency evidence is from the exact pinned Bun cache for Claude 0.56.0 and Pi 0.0.33, and installed mfcli 0.3.15."
}
```
