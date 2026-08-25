(function () {
	const historyDs = window.SupersetDesignSystem_91a6da;
	const {
		Alert,
		Avatar,
		Badge,
		Button,
		ContextMenu,
		Empty,
		FileRow,
		Icon,
		IconButton,
		Input,
		Kbd,
		MenuGroup,
		MenuHeading,
		MenuItem,
		MenuSep,
		ScrollArea,
		SegmentedControl,
		Skeleton,
		Spinner,
		Tabs,
		Toast,
		Tooltip,
	} = historyDs;

	function WindowChrome() {
		return (
			<div className="chrome-bar">
				<div className="traffic-lights" aria-hidden="true">
					<span className="traffic-light traffic-light--danger" />
					<span className="traffic-light traffic-light--warning" />
					<span className="traffic-light traffic-light--success" />
				</div>
				<div className="chrome-tab chrome-tab--active">
					<Icon name="branch" size={12} />
					<span>superset / workspace</span>
				</div>
				<div className="chrome-path">~/Code/superset</div>
				<div className="chrome-actions">
					<span className="chrome-status-dot" />
					<span>Synced</span>
				</div>
			</div>
		);
	}

	function AppRail({ activeRail, onRailSelect }) {
		const railItems = [
			{ id: "workspaces", icon: "changes", label: "Workspaces" },
			{ id: "terminal", icon: "terminal", label: "Terminal" },
			{ id: "search", icon: "search", label: "Search" },
		];
		return (
			<nav className="app-rail" aria-label="Primary">
				<div className="rail-brand">S</div>
				<div className="rail-items">
					{railItems.map((item) => (
						<Tooltip key={item.id} label={item.label} side="right">
							<IconButton
								className={activeRail === item.id ? "is-active" : ""}
								title={item.label}
								onClick={() => onRailSelect(item.id)}
							>
								<Icon name={item.icon} size={15} />
							</IconButton>
						</Tooltip>
					))}
				</div>
				<div className="rail-bottom">
					<Tooltip label="Settings" side="right">
						<IconButton title="Settings" onClick={() => onRailSelect("settings")}>
							<Icon name="sort" size={15} />
						</IconButton>
					</Tooltip>
				</div>
			</nav>
		);
	}

	function WorkspaceNav({ workspaceName, variant, onVariantChange, previewState, onPreviewStateChange, sidebarWidth, onSidebarWidthChange }) {
		return (
			<aside className="workspace-nav">
				<div className="workspace-nav-head">
					<div className="workspace-identity">
						<div className="workspace-avatar">S</div>
						<div>
							<div className="workspace-title">Workspace</div>
							<div className="workspace-path">superset</div>
						</div>
					</div>
					<Tooltip label="New workspace" side="bottom">
						<IconButton title="New workspace">
							<Icon name="plus" size={14} />
						</IconButton>
					</Tooltip>
				</div>
				<div className="workspace-search">
					<Input iconName="search" placeholder="Find workspace" />
				</div>
				<div className="workspace-section-label">
					<span>Active</span>
					<span className="mono-count">01</span>
				</div>
				<div className="workspace-list">
					<div className="workspace-item workspace-item--active">
						<span className="workspace-state workspace-state--running" />
						<span className="workspace-item-name">{workspaceName}</span>
						<Icon name="moreH" size={13} className="workspace-item-more" />
					</div>
					<div className="workspace-item">
						<span className="workspace-state workspace-state--idle" />
						<span className="workspace-item-name">feat/terminal-ui</span>
						<span className="workspace-item-meta">2d</span>
					</div>
				</div>
				<div className="workspace-section-label workspace-section-label--recent">
					<span>Recent</span>
					<span className="mono-count">03</span>
				</div>
				<div className="workspace-list">
					<div className="workspace-item">
						<span className="workspace-state workspace-state--idle" />
						<span className="workspace-item-name">fix/branch-menu</span>
						<span className="workspace-item-meta">5h</span>
					</div>
					<div className="workspace-item">
						<span className="workspace-state workspace-state--idle" />
						<span className="workspace-item-name">release/2.0</span>
						<span className="workspace-item-meta">1w</span>
					</div>
				</div>
				<div className="workspace-nav-spacer" />
				<div className="prototype-controls">
					<div className="prototype-controls-title">
						<span>Prototype controls</span>
						<Badge pill>DESIGN</Badge>
					</div>
					<div className="prototype-control-group">
						<span className="prototype-control-label">Direction</span>
						<SegmentedControl
							className="prototype-segmented"
							options={[
								{ value: "timeline", label: "Timeline" },
								{ value: "compact", label: "Compact" },
								{ value: "graph", label: "Graph" },
							]}
							value={variant || "timeline"}
							onChange={onVariantChange}
						/>
					</div>
					<div className="prototype-control-group">
						<span className="prototype-control-label">Data state</span>
						<SegmentedControl
							className="prototype-segmented"
							options={[
								{ value: "ready", label: "Ready" },
								{ value: "loading", label: "Loading" },
								{ value: "empty", label: "Empty" },
								{ value: "error", label: "Error" },
							]}
							value={previewState || "ready"}
							onChange={onPreviewStateChange}
						/>
					</div>
					<div className="prototype-control-group">
						<span className="prototype-control-label">Sidebar width</span>
						<SegmentedControl
							className="prototype-segmented"
							options={[
								{ value: "250", label: "250" },
								{ value: "320", label: "320" },
								{ value: "420", label: "420" },
							]}
							value={String(sidebarWidth || 250)}
							onChange={(nextWidth) => onSidebarWidthChange?.(Number(nextWidth))}
						/>
					</div>
				</div>
			</aside>
		);
	}

	function WorkArea() {
		return (
			<main className="work-area">
				<div className="editor-tabs">
					<div className="editor-tab editor-tab--active">
						<Icon name="file" size={12} />
						<span>WorkspaceView.tsx</span>
						<Icon name="x" size={11} />
					</div>
					<div className="editor-tab">
						<Icon name="file" size={12} />
						<span>git.ts</span>
					</div>
				</div>
				<div className="editor-breadcrumb">
					<span>apps</span><Icon name="chevron" size={10} /><span>desktop</span><Icon name="chevron" size={10} /><span>RightSidebar</span>
				</div>
				<div className="code-canvas" aria-hidden="true">
					<div className="code-gutter">
						{Array.from({ length: 22 }, (_, index) => <span key={index}>{String(index + 1).padStart(2, "0")}</span>)}
					</div>
					<div className="code-lines">
						<div><span className="syntax-purple">export function</span> <span className="syntax-blue">RightSidebar</span>() {'{'}</div>
						<div className="code-indent"><span className="syntax-purple">const</span> rightSidebarTab = useSidebarStore();</div>
						<div className="code-indent"><span className="syntax-purple">const</span> sidebarWidth = useSidebarStore();</div>
						<div className="code-indent"> </div>
						<div className="code-indent"><span className="syntax-purple">return</span> (</div>
						<div className="code-indent-2">&lt;<span className="syntax-blue">aside</span> className=<span className="syntax-orange">"h-full flex flex-col"</span>&gt;</div>
						<div className="code-indent-2">&nbsp;&nbsp;&lt;<span className="syntax-blue">Tabs</span> value={'{'}rightSidebarTab{'}'} /&gt;</div>
						<div className="code-indent-2">&nbsp;&nbsp;&lt;<span className="syntax-blue">HistoryView</span> width={'{'}sidebarWidth{'}'} /&gt;</div>
						<div className="code-indent-2">&lt;/<span className="syntax-blue">aside</span>&gt;</div>
						<div className="code-indent">);</div>
						<div>{'}'}</div>
						<div className="code-line-blank"> </div>
						<div><span className="syntax-comment">// commit history is local to the current worktree</span></div>
						<div><span className="syntax-purple">const</span> commits = useQuery({'{'}</div>
						<div className="code-indent">queryKey: [<span className="syntax-orange">"git-log"</span>, workspaceId],</div>
						<div className="code-indent">staleTime: <span className="syntax-green">5_000</span>,</div>
						<div>{'}'}</div>
						<div className="code-line-blank"> </div>
						<div><span className="syntax-purple">export default</span> RightSidebar;</div>
					</div>
				</div>
				<div className="work-area-statusbar">
					<span><Icon name="branch" size={11} /> main</span>
					<span>Ln 12, Col 34</span>
					<span>TypeScript React</span>
				</div>
			</main>
		);
	}

	function SidebarTabs({ activeTab, onTabChange, onExpand, onClose }) {
		return (
			<Tabs
				className="sidebar-tabs"
				value={activeTab}
				onChange={onTabChange}
				items={[
					{ value: "Info", label: "Info", iconName: "cloud" },
					{ value: "Changes", label: "Changes", iconName: "changes" },
					{ value: "History", label: "History", iconName: "branch" },
					{ value: "Files", label: "Files", iconName: "file" },
				]}
				trailing={
					<>
						<Tooltip label="Expand sidebar" side="bottom">
							<IconButton title="Expand sidebar" onClick={onExpand}>
								<Icon name="max" size={13} />
							</IconButton>
						</Tooltip>
						<Tooltip label="Close sidebar" side="bottom">
							<IconButton title="Close sidebar" onClick={onClose}>
								<Icon name="x" size={13} />
							</IconButton>
						</Tooltip>
					</>
				}
			/>
		);
	}

	function HistoryHeader({
		branchScope,
		onBranchScopeChange,
		filterValue,
		onFilterChange,
		onRefresh,
		isRefreshing,
		resultCount,
	}) {
		return (
			<div className="history-header">
				<div className="history-title-row">
					<div>
						<div className="history-title">Commit history <span className="history-count">{String(resultCount).padStart(2, "0")}</span></div>
						<div className="history-subtitle"><Icon name="branch" size={12} /><code>main</code><span className="history-dot" /><span>local worktree</span></div>
					</div>
					<Tooltip label="Refresh history" side="top">
						<IconButton title="Refresh history" onClick={onRefresh} disabled={isRefreshing}>
							{isRefreshing ? <Spinner size={13} tone="accent" /> : <Icon name="refresh" size={14} />}
						</IconButton>
					</Tooltip>
				</div>
				<div className="history-filter-row">
					<Input
						iconName="search"
						value={filterValue}
						onChange={(eventValue) => onFilterChange(eventValue.target.value)}
						placeholder="Search commits"
						trailing={<Kbd>⌘P</Kbd>}
					/>
				</div>
				<div className="history-scope-row">
					<span className="scope-label">Scope</span>
					<SegmentedControl
						className="scope-segmented"
						options={[
							{ value: "branch", label: "This branch" },
							{ value: "all", label: "All branches" },
						]}
						value={branchScope}
						onChange={onBranchScopeChange}
					/>
					<span className="history-filter-hint"><Kbd>⌘P</Kbd> Search</span>
				</div>
			</div>
		);
	}

	function CommitRow({
		commit,
		isExpanded,
		isSelected,
		onSelect,
		onToggle,
		onMore,
		onContextMenu,
		onFileOpen,
		variant = "timeline",
	}) {
		const rowClass = [
			"commit-row",
			isSelected ? "commit-row--selected" : "",
			isExpanded ? "commit-row--expanded" : "",
			variant === "compact" ? "commit-row--compact" : "",
		].filter(Boolean).join(" ");
		return (
			<article className={rowClass} onContextMenu={onContextMenu}>
				<div className="commit-rail" aria-hidden="true">
					<span className="commit-rail-line" />
					<button className="commit-node" type="button" tabIndex={-1} onClick={onToggle} aria-label={isExpanded ? "Collapse commit" : "Expand commit"}>
						<span className="commit-node-core" />
					</button>
				</div>
				<div className="commit-content">
					<div className="commit-row-main">
						<button
							className="commit-select"
							type="button"
							onClick={onSelect}
							aria-pressed={isSelected}
						>
							<div className="commit-title-line">
								<span className="commit-title">{commit.title}</span>
								{commit.refs.slice(0, 1).map((refName) => <Badge key={refName} pill>{refName}</Badge>)}
							</div>
							<div className="commit-meta">
								<Avatar name={commit.avatarName} size={20} />
								<span>{commit.author}</span>
								<code>{commit.id}</code>
								<span className="commit-time">{commit.time}</span>
								<span className="commit-stats"><span className="commit-add">+{commit.stats.additions}</span><span className="commit-del">−{commit.stats.deletions}</span></span>
							</div>
						</button>
						<div className="commit-actions">
							<Tooltip label={isExpanded ? "Collapse files" : "Show changed files"} side="top">
								<IconButton title={isExpanded ? "Collapse files" : "Show changed files"} onClick={onToggle}>
									<Icon name="chevron" size={13} className={isExpanded ? "icon-rotate-180" : ""} />
								</IconButton>
							</Tooltip>
							<Tooltip label="More actions" side="top">
								<IconButton title="More actions" onClick={onMore}>
									<Icon name="moreH" size={14} />
								</IconButton>
							</Tooltip>
						</div>
					</div>
					{isExpanded ? (
						<div className="commit-files" aria-label={`Files changed in ${commit.id}`}>
							<div className="commit-files-head">
								<span>Changed files</span>
								<span className="commit-files-count">{String(commit.files.length).padStart(2, "0")}</span>
							</div>
							<div className="commit-file-list">
								{commit.files.map((file) => (
									<FileRow
										key={`${file.dir}${file.file}`}
										dir={file.dir}
										file={file.file}
										status={file.status}
										onClick={() => onFileOpen(file)}
									/>
								))}
							</div>
							<div className="commit-files-footer">
								<span>{commit.branch}</span>
								<button type="button" onClick={() => onFileOpen(commit.files[0])}>Open diff <Icon name="arrowRight" size={12} /></button>
							</div>
						</div>
					) : null}
				</div>
			</article>
		);
	}

	function CommitTimeline({ groups, expandedIds, selectedId, onSelect, onToggle, onMore, onContextMenu, onFileOpen }) {
		return (
			<ScrollArea className="history-scroll">
				<div className="timeline-view">
					{groups.map(([groupName, commits]) => (
						<section className="history-group" key={groupName}>
							<div className="history-group-heading"><span>{groupName}</span><span>{String(commits.length).padStart(2, "0")}</span></div>
							{commits.map((commit) => (
								<CommitRow
									key={commit.id}
									commit={commit}
									isExpanded={expandedIds.has(commit.id)}
									isSelected={selectedId === commit.id}
									onSelect={() => onSelect(commit.id)}
									onToggle={() => onToggle(commit.id)}
									onMore={(event) => onMore(event, commit)}
									onContextMenu={(event) => onContextMenu(event, commit)}
									onFileOpen={(file) => onFileOpen(file, commit)}
								/>
							))}
						</section>
					))}
					<div className="load-more-wrap"><Button size="sm" variant="ghost" onClick={() => onToggle("load-more")}><Icon name="refresh" size={12} /> Load more</Button><span>Showing {groups.reduce((sum, [, commits]) => sum + commits.length, 0)} commits</span></div>
				</div>
			</ScrollArea>
		);
	}

	function CompactList({ commits, expandedIds, selectedId, onSelect, onToggle, onMore, onContextMenu, onFileOpen }) {
		return (
			<ScrollArea className="history-scroll">
				<div className="compact-view">
					<div className="compact-list-head"><span>Commit</span><span>Author</span><span>When</span></div>
					{commits.map((commit) => (
						<CommitRow
							key={commit.id}
							commit={commit}
							variant="compact"
							isExpanded={expandedIds.has(commit.id)}
							isSelected={selectedId === commit.id}
							onSelect={() => onSelect(commit.id)}
							onToggle={() => onToggle(commit.id)}
							onMore={(event) => onMore(event, commit)}
							onContextMenu={(event) => onContextMenu(event, commit)}
							onFileOpen={(file) => onFileOpen(file, commit)}
						/>
					))}
				</div>
			</ScrollArea>
		);
	}

	function GraphCommit({ commit, isSelected, onSelect, onMore }) {
		return (
			<div className={`graph-row graph-row--lane-${commit.lane} ${isSelected ? "graph-row--selected" : ""}`}>
				<div className="graph-track" aria-hidden="true">
					<span className="graph-track-line graph-track-line--primary" />
					{commit.lane === 1 ? <span className="graph-track-line graph-track-line--branch" /> : null}
					<span className="graph-node"><span /></span>
				</div>
				<button className="graph-commit-main" type="button" onClick={onSelect} aria-pressed={isSelected}>
					<div className="graph-commit-top"><span className="graph-title">{commit.title}</span><Badge pill>{commit.branch}</Badge></div>
					<div className="graph-commit-meta"><Avatar name={commit.avatarName} size={20} /><span>{commit.author}</span><code>{commit.id}</code><span className="commit-time">{commit.date} · {commit.time}</span></div>
				</button>
				<Tooltip label="More actions" side="top"><IconButton title="More actions" onClick={onMore}><Icon name="moreH" size={14} /></IconButton></Tooltip>
			</div>
		);
	}

	function BranchGraph({ commits, selectedId, onSelect, onMore }) {
		return (
			<ScrollArea className="history-scroll">
				<div className="graph-view">
					<div className="graph-head"><span><Icon name="branch" size={12} /> Branch topology</span><span className="graph-head-note">local refs</span></div>
					{commits.map((commit) => <GraphCommit key={commit.id} commit={commit} isSelected={selectedId === commit.id} onSelect={() => onSelect(commit.id)} onMore={(event) => onMore(event, commit)} />)}
					<div className="graph-legend"><span><i className="legend-line legend-line--primary" /> main</span><span><i className="legend-line legend-line--branch" /> topic branch</span></div>
				</div>
			</ScrollArea>
		);
	}

	function HistoryBody({
		previewState,
		variant,
		groups,
		commits,
		expandedIds,
		selectedId,
		onSelect,
		onToggle,
		onMore,
		onContextMenu,
		onFileOpen,
		onPreviewRetry,
	}) {
		if (previewState === "loading") {
			return <div className="history-state"><div className="history-state-kicker"><Spinner size={13} tone="accent" /> Fetching local history</div>{Array.from({ length: 6 }, (_, index) => <div className="skeleton-commit" key={index}><Skeleton width="16px" height="16px" radius={999} /><div><Skeleton width={`${142 + (index % 3) * 28}px`} height="10px" /><Skeleton width={`${86 + (index % 2) * 34}px`} height="8px" /></div></div>)}</div>;
		}
		if (previewState === "empty") {
			return <div className="history-state history-state--empty"><Empty iconName="branch" title="No commits found" description="Try another scope or clear the search filter." action={<Button size="sm" variant="ghost" onClick={onPreviewRetry}>Show all branches</Button>} /></div>;
		}
		if (previewState === "error") {
			return <div className="history-state history-state--error"><Alert tone="danger" title="History unavailable">Git log could not be read from this worktree.</Alert><Button size="sm" variant="ghost" onClick={onPreviewRetry}><Icon name="refresh" size={12} /> Retry</Button></div>;
		}
		if (variant === "compact") {
			return <CompactList commits={commits} expandedIds={expandedIds} selectedId={selectedId} onSelect={onSelect} onToggle={onToggle} onMore={onMore} onContextMenu={onContextMenu} onFileOpen={onFileOpen} />;
		}
		if (variant === "graph") {
			return <BranchGraph commits={commits} selectedId={selectedId} onSelect={onSelect} onMore={onMore} />;
		}
		return <CommitTimeline groups={groups} expandedIds={expandedIds} selectedId={selectedId} onSelect={onSelect} onToggle={onToggle} onMore={onMore} onContextMenu={onContextMenu} onFileOpen={onFileOpen} />;
	}

	function PlaceholderView({ tabName }) {
		if (tabName === "Info") {
			return <div className="placeholder-view"><div className="placeholder-card"><div className="placeholder-card-head"><span className="placeholder-icon"><Icon name="branch" size={14} /></span><div><div className="placeholder-title">superset</div><div className="placeholder-subtitle">Workspace · local</div></div></div><div className="placeholder-grid"><span>Branch</span><code>main</code><span>Worktree</span><code>clean</code><span>Last fetch</span><span>2m ago</span></div></div><Empty iconName="cloud" title="Info view" description="Workspace details stay here while History is focused." /></div>;
		}
		const files = tabName === "Changes" ? [
			{ dir: "apps/desktop/src/renderer/", file: "RightSidebar/index.tsx", status: "M" },
			{ dir: "apps/desktop/src/renderer/", file: "headerTabStyles.ts", status: "M" },
			{ dir: "packages/ui/src/components/ui/", file: "tabs.tsx", status: "A" },
		] : [
			{ dir: "apps/desktop/src/renderer/screens/main/", file: "components/", status: undefined },
			{ dir: "packages/host-service/src/trpc/router/", file: "git.ts", status: undefined },
			{ dir: "designs/", file: "git-history-sidebar/", status: undefined },
		];
		return <div className="placeholder-view"><div className="placeholder-list-head"><span>{tabName === "Changes" ? "Working tree" : "Project files"}</span><Badge pill>{String(files.length).padStart(2, "0")}</Badge></div><div className="placeholder-list">{files.map((file) => <FileRow key={`${file.dir}${file.file}`} dir={file.dir} file={file.file} status={file.status} onClick={() => {}} />)}</div><Empty iconName={tabName === "Changes" ? "changes" : "file"} title={`${tabName} view`} description="Select History to review local commits." /></div>;
	}

	function ContextMenuLayer({ menuState, onAction, onDismiss }) {
		if (!menuState) return null;
		return <>
			<button type="button" className="menu-scrim" aria-label="Close actions" onClick={onDismiss} />
			<ContextMenu className="history-context-menu" style={{ left: menuState.x, top: menuState.y }}>
				<MenuHeading title={menuState.commit.id} badge={<Badge pill>{menuState.commit.branch}</Badge>} />
				<MenuSep />
				<MenuGroup>Commit actions</MenuGroup>
				<MenuItem iconName="copy" label="Copy hash" kbd={<Kbd>⌘C</Kbd>} onClick={() => onAction("copy", menuState.commit)} />
				<MenuItem iconName="terminal" label="Open in terminal" onClick={() => onAction("terminal", menuState.commit)} />
				<MenuItem iconName="arrowRight" label="Open diff" onClick={() => onAction("diff", menuState.commit)} />
				<MenuSep />
				<MenuGroup>History</MenuGroup>
				<MenuItem iconName="refresh" label="Reset to commit…" danger onClick={() => onAction("reset", menuState.commit)} />
			</ContextMenu>
		</>;
	}

	function HistorySidebar({
		activeTab,
		onTabChange,
		onExpand,
		onClose,
		branchScope,
		onBranchScopeChange,
		filterValue,
		onFilterChange,
		onRefresh,
		isRefreshing,
		previewState,
		variant,
		groups,
		commits,
		expandedIds,
		selectedId,
		onSelect,
		onToggle,
		onMore,
		onContextMenu,
		onFileOpen,
		onPreviewRetry,
	}) {
		return <aside className="history-sidebar" aria-label="Workspace sidebar">
			<SidebarTabs activeTab={activeTab} onTabChange={onTabChange} onExpand={onExpand} onClose={onClose} />
			{activeTab === "History" ? <>
				<HistoryHeader branchScope={branchScope} onBranchScopeChange={onBranchScopeChange} filterValue={filterValue} onFilterChange={onFilterChange} onRefresh={onRefresh} isRefreshing={isRefreshing} resultCount={commits.length} />
				<HistoryBody previewState={previewState} variant={variant} groups={groups} commits={commits} expandedIds={expandedIds} selectedId={selectedId} onSelect={onSelect} onToggle={onToggle} onMore={onMore} onContextMenu={onContextMenu} onFileOpen={onFileOpen} onPreviewRetry={onPreviewRetry} />
				<div className="sidebar-footer"><span><span className="footer-live-dot" /> Local history</span><span className="footer-shortcut"><Kbd>⌘K</Kbd> command menu</span></div>
			</> : <PlaceholderView tabName={activeTab} />}
		</aside>;
	}

	function ToastStack({ toastState, onDismiss }) {
		if (!toastState) return null;
		return <div className="toast-stack-prototype"><Toast tone={toastState.tone}>{toastState.message}<IconButton title="Dismiss" onClick={onDismiss}><Icon name="x" size={12} /></IconButton></Toast></div>;
	}

	Object.assign(window, {
		WindowChrome,
		AppRail,
		WorkspaceNav,
		WorkArea,
		HistorySidebar,
		ContextMenuLayer,
		ToastStack,
	});
})();
