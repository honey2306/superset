// Renders three side-by-side artboards inside a DesignCanvas.
// Each artboard shows the same three states (running / completed /
// failed) so the visual language can be judged across statuses at a
// glance.

const { DesignCanvas, DCSection, DCArtboard } = window;

function VariantTriplet({ Variant }) {
  return (
    <div className="triplet">
      <VariantContext title="Running · 2 tools active">
        <Variant sample={window.SAMPLE} />
      </VariantContext>
      <VariantContext title="Completed">
        <Variant sample={window.SAMPLE_COMPLETED} />
      </VariantContext>
      <VariantContext title="Failed">
        <Variant sample={window.SAMPLE_FAILED} />
      </VariantContext>
    </div>
  );
}

function VariantContext({ title, children }) {
  return (
    <div className="triplet__item">
      <div className="triplet__label">{title}</div>
      <div className="triplet__stage">{children}</div>
    </div>
  );
}

function CurrentBaseline() {
  return (
    <div className="triplet">
      <VariantContext title="Running · 现状（当前实现）">
        <div className="acp-subagent" data-status="running">
          <button type="button" className="acp-subagent__head" aria-expanded="true">
            <span className="acp-subagent__caret" aria-hidden>›</span>
            <span className="acp-subagent__mark" aria-hidden>
              <i /><i /><i /><i />
            </span>
            <span className="acp-subagent__identity">
              <span className="acp-subagent__eyebrow">
                SUBAGENT <b>{window.SAMPLE.agentType}</b>
              </span>
              <span className="acp-subagent__task">{window.SAMPLE.task}</span>
            </span>
            <span className="acp-subagent__summary">
              <span>{window.SAMPLE.toolsTotal} tools</span>
              <span aria-hidden>·</span>
              <span>{window.SAMPLE.toolsDone} done</span>
              <span aria-hidden>·</span>
              <span>{window.SAMPLE.toolsActive} active</span>
            </span>
            <span className="acp-subagent__status" data-status="running">
              <span className="acp-subagent__status-dot" aria-hidden />
              running
            </span>
          </button>
        </div>
      </VariantContext>
    </div>
  );
}

function App() {
  return (
    <DesignCanvas>
      <DCSection
        id="baseline"
        title="现状"
        subtitle="apps/desktop AcpSubagentItem 目前的样式，作为对比基准"
      >
        <DCArtboard id="baseline-current" label="Baseline · 当前实现" width={1120} height={200}>
          <div className="stage-shell">
            <CurrentBaseline />
          </div>
        </DCArtboard>
      </DCSection>
      <DCSection
        id="refined"
        title="三个精致克制方向"
        subtitle="A · Whisper Line ｜ B · Quiet Card ｜ C · Terminal Row"
      >
        <DCArtboard id="a-whisper" label="A · Whisper Line" width={1120} height={280}>
          <div className="stage-shell">
            <VariantTriplet Variant={window.VariantWhisper} />
          </div>
        </DCArtboard>
        <DCArtboard id="b-quiet" label="B · Quiet Card" width={1120} height={340}>
          <div className="stage-shell">
            <VariantTriplet Variant={window.VariantQuiet} />
          </div>
        </DCArtboard>
        <DCArtboard id="c-terminal" label="C · Terminal Row" width={1120} height={360}>
          <div className="stage-shell">
            <VariantTriplet Variant={window.VariantTerminal} />
          </div>
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
