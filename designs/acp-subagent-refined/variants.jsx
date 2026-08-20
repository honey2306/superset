// Three refined SubAgent variants.
// Only the visual identity changes; data shape mirrors AcpSubagentItem.

// ─────────────────────────────────────────────────────────────
// A · Whisper Line
// A single 40-ish px tall row. No card frame. A 2px status rail on
// the left carries the color. Type + task collapse into one line.
// ─────────────────────────────────────────────────────────────
function VariantWhisper({ sample }) {
  return (
    <div className="wh" data-status={sample.status}>
      <span className="wh__rail" aria-hidden />
      <span className="wh__caret" aria-hidden>›</span>
      <span className="wh__eyebrow">
        subagent<span className="wh__slash">/</span>
        <b>{sample.agentType}</b>
      </span>
      <span className="wh__task select-text cursor-text">{sample.task}</span>
      <span className="wh__meta">
        <span className="wh__progress" aria-hidden>
          {Array.from({ length: sample.toolsTotal }).map((_, i) => (
            <i
              key={i}
              data-state={
                i < sample.toolsDone
                  ? "done"
                  : i < sample.toolsDone + sample.toolsActive
                  ? "active"
                  : "idle"
              }
            />
          ))}
        </span>
        <span className="wh__count">
          {sample.toolsDone}/{sample.toolsTotal}
        </span>
        <StatusPill status={sample.status} />
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// B · Quiet Card
// Card shape kept, but reduced to a hairline border + a subtle inset
// left rail. Type becomes a real badge chip. Progress becomes a dot
// meter, freeing the right side to hold status only.
// ─────────────────────────────────────────────────────────────
function VariantQuiet({ sample }) {
  return (
    <section className="qc" data-status={sample.status}>
      <div className="qc__rail" aria-hidden />
      <button type="button" className="qc__head">
        <span className="qc__caret" aria-hidden>›</span>
        <span className="qc__badge">
          <span className="qc__badgeGlyph" aria-hidden>
            <i /><i /><i /><i />
          </span>
          <span className="qc__badgeLabel">
            <em>SUB</em>
            <b>{sample.agentType}</b>
          </span>
        </span>
        <span className="qc__task select-text cursor-text">{sample.task}</span>
        <span className="qc__meta">
          <span className="qc__dots" aria-hidden>
            {Array.from({ length: sample.toolsTotal }).map((_, i) => (
              <i
                key={i}
                data-state={
                  i < sample.toolsDone
                    ? "done"
                    : i < sample.toolsDone + sample.toolsActive
                    ? "active"
                    : "idle"
                }
              />
            ))}
          </span>
          <span className="qc__elapsed">{sample.elapsed}</span>
          <StatusPill status={sample.status} />
        </span>
      </button>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// C · Terminal Row
// Fully monospaced. Prefix reads like a shell prompt. Status is a
// single dot glyph. Multi-line task wraps under the prefix.
// ─────────────────────────────────────────────────────────────
function VariantTerminal({ sample }) {
  return (
    <div className="tr" data-status={sample.status}>
      <span className="tr__prompt" aria-hidden>▸</span>
      <div className="tr__body">
        <div className="tr__head">
          <span className="tr__ns">subagent:</span>
          <span className="tr__type">{sample.agentType}</span>
          <span className="tr__sep">·</span>
          <span className="tr__counts">
            <b>{sample.toolsDone}</b>
            <span>/</span>
            <span>{sample.toolsTotal}</span>
            <span className="tr__unit">tools</span>
          </span>
          <span className="tr__spacer" />
          <span className="tr__elapsed">{sample.elapsed}</span>
          <TerminalStatus status={sample.status} />
        </div>
        <div className="tr__task select-text cursor-text">{sample.task}</div>
      </div>
    </div>
  );
}

// Shared pieces ---------------------------------------------------------

const STATUS_LABELS = {
  running: "running",
  awaiting_approval: "awaiting",
  completed: "done",
  failed: "failed",
};

function StatusPill({ status }) {
  return (
    <span className="pill" data-status={status}>
      <span className="pill__dot" aria-hidden />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function TerminalStatus({ status }) {
  const glyph =
    status === "completed" ? "◆" :
    status === "failed" ? "✕" :
    status === "awaiting_approval" ? "◇" : "◐";
  return (
    <span className="trstat" data-status={status}>
      <span className="trstat__glyph" aria-hidden>{glyph}</span>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

Object.assign(window, { VariantWhisper, VariantQuiet, VariantTerminal });
