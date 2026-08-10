const { useEffect: useAppEffect, useState: useAppState } = React;

function App() {
	const [scenarioKey, setScenarioKey] = useAppState("running");
	const [manualCollapsed, setManualCollapsed] = useAppState(false);
	const [unread, setUnread] = useAppState(0);
	const scenario = SCENARIOS[scenarioKey];

	useAppEffect(() => {
		setManualCollapsed(false);
		setUnread(0);
	}, [scenarioKey]);

	function simulateActivity() {
		setUnread((value) => value + 1);
	}

	return (
		<main className="design-stage" data-screen-label="ACP Subagent Timeline">
			<div className="prototype-controls" aria-label="Prototype controls">
				<div className="prototype-controls__context">
					<span className="prototype-controls__label">SUBAGENT CARD</span>
					<span className="prototype-controls__note">状态会驱动默认展开；用户操作后不再抢占</span>
				</div>
				<div className="scenario-tabs" role="tablist" aria-label="Subagent states">
					{Object.entries(SCENARIOS).map(([key, value]) => (
						<button key={key} type="button" role="tab" aria-selected={scenarioKey === key} onClick={() => setScenarioKey(key)}>{value.label}</button>
					))}
				</div>
				<button type="button" className="simulate-button" onClick={simulateActivity}>Simulate activity +1</button>
			</div>

			<section className="desktop-frame" aria-label="ACP pane prototype">
				<div className="window-bar"><span className="window-dot window-dot--red"></span><span className="window-dot window-dot--yellow"></span><span className="window-dot window-dot--green"></span><span className="window-bar__title">superset / acp-session</span></div>
				<div className="acp-pane">
					<PaneHeader />
					<div className="timeline">
						<div className="timeline__inner">
							<div className="message" data-role="user">
								<span className="message__author">YOU</span>
								<div className="message__bubble">帮我梳理 ACP session 的生命周期，并确认 subagent activity 应该放在哪一层。</div>
							</div>

							<div className="message" data-role="agent">
								<span className="message__author">CLAUDE</span>
								<div className="message__bubble">我会先让一个 Explore subagent 追踪 session protocol、host service 和 renderer 之间的数据流。</div>
							</div>

							<SubagentCard
								scenario={scenario}
								manualCollapsed={manualCollapsed}
								unread={unread}
								onManualToggle={() => { setManualCollapsed(true); setUnread(0); }}
							/>

							{scenario.status === "completed" ? (
								<div className="message" data-role="agent">
									<span className="message__author">CLAUDE</span>
									<div className="message__bubble">已经确认：层级关系应该在 protocol fold 阶段归一化，UI 只消费统一的 <code>children</code> timeline。</div>
								</div>
							) : null}
						</div>
					</div>
					<div className="composer-stack">
						{scenario.status === "awaiting_approval" ? <PermissionPopover /> : null}
						<Composer />
					</div>
					<StatusBar scenario={scenario} />
				</div>
			</section>
		</main>
	);
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
