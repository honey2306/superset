const {
	Button,
	Chip,
	Icon,
	IconButton,
	Input,
	SegmentedControl,
	Switch,
	Textarea,
} = window.SupersetDesignSystem_91a6da;

const MEMORY_AB_W = 1160;
const MEMORY_AB_H = 760;

function GlobalSidebar() {
	const navItems = [
		{ label: "自动化任务", icon: "spark" },
		{ label: "待办", icon: "check" },
		{ label: "临时工作区", icon: "changes" },
		{ label: "项目记忆", icon: "spark", active: true },
	];
	return (
		<aside className="global-sidebar">
			<div className="global-sidebar__nav">
				{navItems.map((item) => (
					<div key={item.label} className={`global-nav ${item.active ? "is-active" : ""}`}>
						<Icon name={item.icon} size={14} />
						<span>{item.label}</span>
					</div>
				))}
			</div>
			<div className="global-sidebar__projects">
				<div className="global-sidebar__label">Projects</div>
				{["superset", "mini-krow", "krow-app", "cdp-pr-project"].map((projectName) => (
					<div className="global-project" key={projectName}>
						<span className="global-project__mark">{projectName[0].toUpperCase()}</span>
						<span>{projectName}</span>
					</div>
				))}
			</div>
			<div className="global-sidebar__foot">
				<span>host local</span>
				<span className="page-spacer"></span>
				<Icon name="moreH" size={12} />
			</div>
		</aside>
	);
}

function ProjectRail({ projects, activeProjectId, onProjectChange }) {
	return (
		<aside className="project-rail">
			<div className="project-rail__head">
				<div className="project-rail__eyebrow">Project memory</div>
				<div className="project-rail__title">项目记忆</div>
			</div>
			<div className="project-rail__search">
				<Input iconName="search" placeholder="筛选项目…" />
			</div>
			<div className="project-list">
				{projects.map((projectItem) => (
					<div
						key={projectItem.id}
						className={`project-row ${projectItem.id === activeProjectId ? "is-active" : ""}`}
						onClick={() => onProjectChange(projectItem.id)}
					>
						<span className="project-row__mark">{projectItem.mark}</span>
						<span>
							<div className="project-row__name">{projectItem.name}</div>
							<div className="project-row__meta">{projectItem.path}</div>
						</span>
						<span className="project-row__count">{projectItem.count}</span>
					</div>
				))}
			</div>
		</aside>
	);
}

function MemoryAppFrame({ children, activeProjectId, onProjectChange }) {
	return (
		<div className="memory-app" data-screen-label="项目记忆">
			<GlobalSidebar />
			<div className="memory-page">
				<ProjectRail
					projects={MEMORY_PROJECTS}
					activeProjectId={activeProjectId}
					onProjectChange={onProjectChange}
				/>
				{children}
			</div>
		</div>
	);
}

function CategoryBadge({ memoryItem }) {
	return <span className={`category ${memoryItem.category}`}>{memoryItem.categoryLabel}</span>;
}

function MemoryMeta({ memoryItem }) {
	return (
		<div className="memory-row__meta">
			<CategoryBadge memoryItem={memoryItem} />
			<span className="memory-row__source">
				<Icon name={memoryItem.source === "Agent" ? "spark" : "edit"} size={11} />
				{memoryItem.source} · {memoryItem.sourceDetail}
			</span>
			<span>{memoryItem.updated}</span>
			{!memoryItem.enabled && <Chip tone="del">已停用</Chip>}
		</div>
	);
}

function PageHeader({ projectName, count, searchValue, onSearchChange, onCreate, filters, activeFilter, onFilterChange }) {
	return (
		<header className="page-head">
			<div className="page-head__top">
				<h1 className="page-title">{projectName}</h1>
				<span className="page-count">{count} 条记忆</span>
				<span className="page-spacer"></span>
				<div className="search-shell">
					<Input
						iconName="search"
						placeholder="搜索当前项目记忆…"
						value={searchValue}
						onChange={(event) => onSearchChange(event.target.value)}
					/>
				</div>
				<Button variant="primary" size="sm" onClick={onCreate}>
					<Icon name="plus" size={12} /> 添加记忆
				</Button>
			</div>
			<div className="filter-row">
				{filters.map((filterItem) => (
					<button
						type="button"
						key={filterItem}
						className={`filter-pill ${activeFilter === filterItem ? "is-active" : ""}`}
						onClick={() => onFilterChange(filterItem)}
					>
						{filterItem}
					</button>
				))}
				<span className="page-spacer"></span>
				<span className="page-count">置顶优先 · 最近更新</span>
			</div>
		</header>
	);
}

function InlineEditor({ memoryItem, onClose }) {
	return (
		<div className="editor-panel">
			<div className="editor-panel__fields">
				<Input defaultValue={memoryItem?.title ?? ""} placeholder="记忆标题" />
				<Textarea
					resize="vertical"
					rows={4}
					defaultValue={memoryItem?.body ?? ""}
					placeholder="写下可跨对话复用的结论、步骤和适用条件"
				/>
			</div>
			<div className="editor-panel__actions">
				<span className="page-count">新对话会自动读取已启用的项目记忆</span>
				<span className="page-spacer"></span>
				<Button variant="ghost" size="sm" onClick={onClose}>取消</Button>
				<Button variant="primary" size="sm" onClick={onClose}>保存记忆</Button>
			</div>
		</div>
	);
}

function useMemoryVariantState() {
	const [activeProjectId, setActiveProjectId] = React.useState("superset");
	const [searchValue, setSearchValue] = React.useState("");
	const [activeFilter, setActiveFilter] = React.useState("全部");
	const [editingMemory, setEditingMemory] = React.useState(null);
	const allItems = PROJECT_MEMORIES.filter((item) => item.projectId === activeProjectId);
	const visibleItems = allItems.filter((item) => {
		const matchesSearch = `${item.title} ${item.body}`.toLowerCase().includes(searchValue.toLowerCase());
		const matchesFilter =
			activeFilter === "全部" ||
			(activeFilter === "置顶" && item.pinned) ||
			(activeFilter === "已停用" && !item.enabled) ||
			(activeFilter === "Agent" && item.source === "Agent") ||
			(activeFilter === "手动" && item.source === "手动") ||
			item.categoryLabel === activeFilter;
		return matchesSearch && matchesFilter;
	});
	return {
		activeProjectId,
		setActiveProjectId,
		searchValue,
		setSearchValue,
		activeFilter,
		setActiveFilter,
		editingMemory,
		setEditingMemory,
		allItems,
		visibleItems,
	};
}

Object.assign(window, {
	MEMORY_AB_W,
	MEMORY_AB_H,
	MemoryAppFrame,
	CategoryBadge,
	MemoryMeta,
	PageHeader,
	InlineEditor,
	useMemoryVariantState,
	Button,
	Chip,
	Icon,
	IconButton,
	Input,
	SegmentedControl,
	Switch,
	Textarea,
});
