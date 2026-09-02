const { DesignCanvas, DCSection, DCArtboard, DCPostIt } = window;

function ProjectMemoryDesignApp() {
	return (
		<DesignCanvas>
			<DCSection
				id="project-memory-directions"
				title="项目记忆 · 独立页面"
				subtitle="统一入口位于临时工作区下方；页面内用左侧项目列表区分项目。点击画板右上角可全屏体验。"
			>
				<DCArtboard
					id="direction-list"
					label="A · 克制列表（推荐）"
					width={MEMORY_AB_W}
					height={MEMORY_AB_H}
				>
					<MemoryListDirection />
				</DCArtboard>
				<DCArtboard
					id="direction-cards"
					label="B · 知识卡片"
					width={MEMORY_AB_W}
					height={MEMORY_AB_H}
				>
					<MemoryCardsDirection />
				</DCArtboard>
				<DCArtboard
					id="direction-timeline"
					label="C · Agent 时间线"
					width={MEMORY_AB_W}
					height={MEMORY_AB_H}
				>
					<MemoryTimelineDirection />
				</DCArtboard>
			</DCSection>
			<DCPostIt x={20} y={900} width={340}>
				建议选择 A：它最接近 Superset 现有待办和自动化页面的密度，也最适合记忆长期增长后的搜索、筛选与批量管理。
			</DCPostIt>
		</DesignCanvas>
	);
}

ReactDOM.createRoot(document.getElementById("root")).render(<ProjectMemoryDesignApp />);
