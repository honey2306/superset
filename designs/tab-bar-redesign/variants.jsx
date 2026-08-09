// The three tab-bar variants. Same TabItem markup; only the outer bar class
// changes to swap in a different variant.css block.

function TabBar({ variant, tabs, activeId, onSelect }) {
	return (
		<div className={`tabbar ${variant}`}>
			<div className="tabs-track">
				{tabs.map((t) => {
					const active = t.id === activeId;
					const running = !!t.running;
					const cls = ["tab", active && "active", running && "running"]
						.filter(Boolean)
						.join(" ");
					return (
						<div key={t.id} className={cls} onClick={() => onSelect(t.id)}>
							<span className="tab-icon">
								<TabIcon kind={t.icon} />
							</span>
							{running && <span className="tab-dot" />}
							<span className="tab-title">{t.title}</span>
							<span className="tab-close">
								<Icon.Close />
							</span>
						</div>
					);
				})}
			</div>
			<span className="tab-add">
				<Icon.Plus />
			</span>
		</div>
	);
}

Object.assign(window, { TabBar });
