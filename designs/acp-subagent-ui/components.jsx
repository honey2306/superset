const { useEffect, useMemo, useState } = React;

function StatusDot({ status }) {
	return <span className="status-dot" data-status={status} aria-hidden="true"></span>;
}

function ToolRow({ tool, nested = false }) {
	const [open, setOpen] = useState(tool.status === "failed");
	return (
		<div className="tool-row-wrap" data-status={tool.status}>
			<button className="tool-row" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
				<span className="tool-row__branch" aria-hidden="true">{nested ? "└" : "├"}</span>
				<span className="tool-row__caret" aria-hidden="true">{open ? "▾" : "›"}</span>
				<span className="tool-kind" data-kind={tool.kind}>{tool.kind}</span>
				<span className="tool-row__title">{tool.title}</span>
				<span className="tool-row__time">{tool.time}</span>
				<span className="tool-row__status" data-status={tool.status}>
					<StatusDot status={tool.status} />
					{tool.status === "in_progress" ? "running" : tool.status}
				</span>
			</button>
			{open ? <div className="tool-row__detail" data-status={tool.status}>{tool.detail}</div> : null}
		</div>
	);
}

function PermissionPopover() {
	return (
		<div className="permission-float" role="alertdialog" aria-modal="true" aria-label="Permission required">
			<div className="permission-float__head">
				<span className="permission-float__pulse" aria-hidden="true"></span>
				<span>Permission required</span>
				<span className="permission-float__source">Explore subagent · edit</span>
			</div>
			<div className="permission-float__question">Allow edit to <code>AcpToolCallItem.tsx</code>?</div>
			<div className="permission-float__actions">
				<button type="button" className="permission-option"><kbd>1</kbd><span>Allow once</span><small>this action</small></button>
				<button type="button" className="permission-option permission-option--primary"><kbd>2</kbd><span>Allow for session</span><small>recommended</small></button>
				<button type="button" className="permission-option"><kbd>3</kbd><span>Reject</span><small>stop tool</small></button>
			</div>
		</div>
	);
}

function NestedSubagent() {
	const [open, setOpen] = useState(true);
	return (
		<div className="nested-agent">
			<button type="button" className="nested-agent__head" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
				<span className="tool-row__branch" aria-hidden="true">└</span>
				<span className="tool-row__caret" aria-hidden="true">{open ? "▾" : "›"}</span>
				<span className="agent-mark agent-mark--small" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
				<span className="nested-agent__label">SUBAGENT</span>
				<span className="nested-agent__title">Review accessibility behavior</span>
				<span className="tool-row__status" data-status="completed"><StatusDot status="completed" />completed</span>
			</button>
			{open ? (
				<div className="nested-agent__body">
					<ToolRow nested tool={{ id: "a11y", kind: "read", title: "AcpTimeline.test.tsx", status: "completed", detail: "Checked focus and aria-expanded states", time: "0.4s" }} />
				</div>
			) : null}
		</div>
	);
}

function SubagentCard({ scenario, onManualToggle, manualCollapsed, unread }) {
	const [expanded, setExpanded] = useState(scenario.status !== "completed");
	useEffect(() => {
		if (manualCollapsed) return;
		setExpanded(scenario.status !== "completed");
	}, [scenario.status, manualCollapsed]);

	const completed = scenario.children.filter((child) => child.status === "completed").length;
	const active = scenario.children.filter((child) => child.status === "in_progress" || child.status === "pending").length;
	const statusLabel = scenario.status === "awaiting_approval" ? "awaiting approval" : scenario.status;

	function toggle() {
		setExpanded((value) => !value);
		onManualToggle();
	}

	return (
		<section className="subagent-card" data-status={scenario.status} data-expanded={expanded ? "true" : "false"}>
			<button type="button" className="subagent-card__head" onClick={toggle} aria-expanded={expanded}>
				<span className="subagent-card__caret" aria-hidden="true">{expanded ? "▾" : "›"}</span>
				<span className="agent-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
				<span className="subagent-card__identity">
					<span className="subagent-card__eyebrow">SUBAGENT <b>Explore</b></span>
					<span className="subagent-card__task">Trace ACP session lifecycle and propose the UI integration</span>
				</span>
				<span className="subagent-card__summary">
					<span>{scenario.children.length} tools</span>
					<span className="summary-separator">·</span>
					<span>{completed} done</span>
					{active > 0 ? <><span className="summary-separator">·</span><span>{active} active</span></> : null}
				</span>
				{unread > 0 && !expanded ? <span className="unread-count">+{unread}</span> : null}
				<span className="subagent-card__status" data-status={scenario.status}>
					<StatusDot status={scenario.status} />
					{statusLabel}
				</span>
			</button>

			{expanded ? (
				<div className="subagent-card__body">
					<div className="subagent-card__activity-head">
						<span>ACTIVITY</span>
						<span className="activity-head__line"></span>
						<span>{scenario.elapsed}</span>
					</div>
					<div className="subagent-card__tools">
						{scenario.children.map((tool) => <ToolRow key={tool.id} tool={tool} />)}
						{scenario.status === "running" ? <NestedSubagent /> : null}
					</div>
					{scenario.status === "failed" ? (
						<div className="subagent-result subagent-result--failed"><span>RESULT</span><p>Subagent stopped after typecheck failed. Partial edits were preserved.</p></div>
					) : null}
					{scenario.status === "completed" ? (
						<div className="subagent-result"><span>RESULT</span><p>Mapped the session lifecycle, added nested activity handling, and verified all 59 protocol tests.</p></div>
					) : null}
				</div>
			) : null}
		</section>
	);
}

function PaneHeader() {
	return (
		<header className="pane-toolbar">
			<span className="agent-chip"><StatusDot status="running" /> CLAUDE · SONNET 4.5</span>
			<span className="pane-toolbar__title">Add subagent activity to ACP timeline</span>
			<span className="pane-toolbar__spacer"></span>
			<div className="pane-toolbar__actions" aria-label="Pane actions">
				<button type="button" aria-label="Refresh">↻</button>
				<button type="button" aria-label="More options">•••</button>
			</div>
		</header>
	);
}

function Composer() {
	return (
		<div className="composer-wrap">
			<div className="composer">
				<span className="composer__prompt">›</span>
				<textarea aria-label="Message" placeholder="Follow up…" rows="1"></textarea>
				<button type="button" className="composer__send">Send ↵</button>
			</div>
			<div className="composer__hints"><span>⌘↵ queue</span><span>⌘K commands</span></div>
		</div>
	);
}

function StatusBar({ scenario }) {
	return (
		<footer className="status-bar">
			<span className="status-bar__mode">DEFAULT</span>
			<span>model <b>sonnet-4.5</b></span>
			<span>context <b>24.8k / 200k</b></span>
			<span>cost <b>$0.18</b></span>
			<span className="status-bar__spacer"></span>
			<span className="status-bar__session"><StatusDot status={scenario.status === "completed" ? "completed" : scenario.status} />{scenario.status === "awaiting_approval" ? "waiting" : scenario.status}</span>
		</footer>
	);
}

Object.assign(window, { PaneHeader, SubagentCard, PermissionPopover, Composer, StatusBar });
