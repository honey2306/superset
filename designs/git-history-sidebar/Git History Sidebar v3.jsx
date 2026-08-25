(function () {
	const gitLogDs = window.SupersetDesignSystem_91a6da;
	const {
		Alert,
		Avatar,
		Badge,
		Button,
		DropdownMenu,
		Empty,
		FileRow,
		Icon,
		IconButton,
		Input,
		Kbd,
		MenuHeading,
		MenuItem,
		MenuSep,
		SegmentedControl,
		Spinner,
		Tabs,
		Tag,
		Toast,
	} = gitLogDs;
	const { useEffect, useMemo, useRef, useState } = React;

	const panelTabs = [
		{ value: "log", label: "Log" },
		{ value: "local", label: "Local Changes" },
		{ value: "console", label: "Console" },
	];

	const detailTabs = [
		{ value: "details", label: "Details" },
		{ value: "files", label: "Changed Files", iconName: "file" },
	];

	const stateOptions = [
		{ value: "ready", label: "Ready", iconName: "check" },
		{ value: "loading", label: "Loading", iconName: "refresh" },
		{ value: "empty", label: "Empty", iconName: "search" },
		{ value: "error", label: "Error", iconName: "alert" },
	];

	const branchOptions = [
		{ value: "main", label: "main" },
		{ value: "feat/preset-icons", label: "feat/preset-icons" },
		{ value: "feat/workspace-run", label: "feat/workspace-run" },
		{ value: "all", label: "All branches" },
	];

	const dateOptions = [
		{ value: "any", label: "Any date" },
		{ value: "today", label: "Today" },
		{ value: "week", label: "Last 7 days" },
	];

	function dismissDropdown() {
		window.setTimeout(() => {
			document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
		}, 0);
	}

	function FilterMenu({ label, iconName, value, options, onChange }) {
		const active = options.find((option) => option.value === value) || options[0];
		return (
			<DropdownMenu
				trigger={
					<Button variant="ghost" size="sm" className="git-filter-button">
						<Icon name={iconName} size={12} />
						<span>{active.label}</span>
						<Icon name="chevron" size={9} />
					</Button>
				}
				side="bottom"
				align="start"
			>
				<MenuHeading iconName={iconName} title={label} />
				<MenuSep />
				{options.map((option) => (
					<MenuItem
						key={option.value}
						label={option.label}
						tag={option.value === value ? <Badge pill>Current</Badge> : null}
						onClick={() => {
							onChange(option.value);
							dismissDropdown();
						}}
					/>
				))}
			</DropdownMenu>
		);
	}

	function BranchMenu({ value, onChange }) {
		const active = branchOptions.find((option) => option.value === value) || branchOptions[0];
		return (
			<DropdownMenu
				trigger={
					<Button variant="ghost" size="sm" className="git-branch-button">
						<Icon name="branch" size={13} />
						<code>{active.label}</code>
						<Icon name="chevron" size={9} />
					</Button>
				}
				side="bottom"
				align="start"
			>
				<MenuHeading iconName="branch" title="Branches" />
				<MenuSep />
				{branchOptions.map((option) => (
					<MenuItem
						key={option.value}
						label={option.label}
						tag={option.value === value ? <Badge pill>Current</Badge> : null}
						onClick={() => {
							onChange(option.value);
							dismissDropdown();
						}}
					/>
				))}
			</DropdownMenu>
		);
	}

	function ReviewStateMenu({ reviewState, onChange }) {
		const active = stateOptions.find((option) => option.value === reviewState) || stateOptions[0];
		return (
			<DropdownMenu
				trigger={
					<Button variant="ghost" size="sm" className="review-state-button">
						<span>State</span>
						<code>{active.label}</code>
						<Icon name="chevron" size={9} />
					</Button>
				}
				side="bottom"
				align="end"
			>
				<MenuHeading iconName="spark" title="Review states" />
				<MenuSep />
				{stateOptions.map((option) => (
					<MenuItem
						key={option.value}
						iconName={option.iconName}
						label={option.label}
						tag={option.value === reviewState ? <Badge pill>Current</Badge> : null}
						onClick={() => {
							onChange(option.value);
							dismissDropdown();
						}}
					/>
				))}
			</DropdownMenu>
		);
	}

	function ToolbarMenu({ onAction }) {
		return (
			<DropdownMenu
				trigger={
					<IconButton title="More Log actions" aria-label="More Log actions" className="git-icon-button">
						<Icon name="moreH" size={14} />
					</IconButton>
				}
				side="bottom"
				align="end"
			>
				<MenuHeading iconName="changes" title="Git Log" />
				<MenuSep />
				<MenuItem iconName="refresh" label="Refresh" onClick={() => { onAction("refresh"); dismissDropdown(); }} />
				<MenuItem iconName="branch" label="Show branch labels" onClick={() => { onAction("labels"); dismissDropdown(); }} />
				<MenuItem iconName="terminal" label="Open in terminal" onClick={() => { onAction("terminal"); dismissDropdown(); }} />
			</DropdownMenu>
		);
	}

	function GraphLane({ commit, index }) {
		const isBranch = commit.lane > 0;
		const laneColor = isBranch ? "var(--graph-purple)" : "var(--graph-main)";
		const branchPath = isBranch
			? "M 20 0 V 12 C 20 17 42 17 42 23 V 44"
			: "M 20 0 V 44";
		return (
			<svg className="git-graph" viewBox="0 0 68 44" role="img" aria-label={isBranch ? "Branch lane" : "Main branch lane"}>
				{index > 0 ? <path className="git-graph-ghost" d="M 42 0 V 44" /> : null}
				<path className="git-graph-line" d={branchPath} style={{ stroke: laneColor }} />
				{isBranch ? <path className="git-graph-branch" d="M 20 0 C 20 7 42 7 42 14 V 44" /> : null}
				<circle className="git-graph-dot" cx={isBranch ? 42 : 20} cy={22} r={4} style={{ fill: laneColor }} />
			</svg>
		);
	}

	function CommitMenu({ commit, onAction }) {
		return (
			<span className="git-row-menu" onClick={(event) => event.stopPropagation()}>
				<DropdownMenu
					trigger={
						<IconButton title={"Actions for " + commit.id} aria-label={"Actions for " + commit.id} className="git-icon-button">
							<Icon name="moreH" size={13} />
						</IconButton>
					}
					side="bottom"
					align="end"
				>
					<MenuHeading iconName="changes" title={commit.id} />
					<MenuSep />
					<MenuItem iconName="copy" label="Copy full hash" onClick={() => { onAction("copy", commit); dismissDropdown(); }} />
					<MenuItem iconName="changes" label="Open diff" onClick={() => { onAction("diff", commit); dismissDropdown(); }} />
					<MenuItem iconName="terminal" label="Open in terminal" onClick={() => { onAction("terminal", commit); dismissDropdown(); }} />
				</DropdownMenu>
			</span>
		);
	}

	function CommitRow({ commit, index, selected, onSelect, onAction }) {
		const refs = commit.refs || [];
		return (
			<div
				className={"git-log-row" + (selected ? " is-selected" : "")}
				role="button"
				tabIndex={0}
				aria-selected={selected}
				onClick={onSelect}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						onSelect();
					}
				}}
			>
				<div className="git-graph-cell">
					<GraphLane commit={commit} index={index} />
				</div>
				<div className="git-message-cell">
					<div className="git-message-title">{commit.title}</div>
					<div className="git-message-subline">
						{refs.map((ref, refIndex) => (
							<Tag key={ref} className={refIndex === 0 ? "git-ref git-ref--primary" : "git-ref"}>{ref}</Tag>
						))}
						<span className="git-stat git-stat--add">+{commit.stats.additions}</span>
						<span className="git-stat git-stat--del">−{commit.stats.deletions}</span>
					</div>
				</div>
				<div className="git-author-cell">
					<Avatar name={commit.avatarName || commit.author} size={18} />
					<span>{commit.author}</span>
				</div>
				<div className="git-date-cell">
					<span>{commit.date}</span>
					<code>{commit.time}</code>
				</div>
				<div className="git-hash-cell"><code>{commit.id}</code></div>
				<CommitMenu commit={commit} onAction={onAction} />
			</div>
		);
	}

	function CommitTable({ commits, selectedId, onSelect, onAction }) {
		return (
			<section className="git-log-table-pane" aria-label="Commit history">
				<div className="git-log-table-head" role="row">
					<span>Graph</span>
					<span>Commit message</span>
					<span>Author</span>
					<span>Date</span>
					<span>Hash</span>
					<span aria-hidden="true"></span>
				</div>
				<div className="git-log-table-body">
					{commits.map((commit, index) => (
						<CommitRow
							key={commit.id}
							commit={commit}
							index={index}
							selected={selectedId === commit.id}
							onSelect={() => onSelect(commit.id)}
							onAction={onAction}
						/>
					))}
					<div className="git-log-load-more">
						<span>Showing {commits.length} of 48 commits</span>
						<Button variant="ghost" size="sm">Load more</Button>
					</div>
				</div>
			</section>
		);
	}

	function CommitDetails({ commit, tab, onTabChange, onFileOpen, onAction }) {
		if (!commit) return null;
		const refs = commit.refs || [];
		return (
			<aside className="git-details-pane" aria-label="Selected commit">
				<div className="git-details-toolbar">
					<span className="git-details-label">Commit details</span>
					<div className="git-details-actions">
						<IconButton title="Copy commit hash" aria-label="Copy commit hash" className="git-icon-button" onClick={() => onAction("copy", commit)}>
							<Icon name="copy" size={13} />
						</IconButton>
						<IconButton title="Close details" aria-label="Close details" className="git-icon-button" onClick={() => onAction("close-details")}>
							<Icon name="x" size={13} />
						</IconButton>
					</div>
				</div>
				<div className="git-details-heading">
					<h2>{commit.title}</h2>
					<div className="git-details-hash">
						<code>{commit.fullHash}</code>
						<span>{commit.id}</span>
					</div>
				</div>
				<div className="git-details-meta">
					<Avatar name={commit.avatarName || commit.author} size={20} />
					<span>{commit.author}</span>
					<span className="git-details-meta-dot">·</span>
					<span>{commit.date} {commit.time}</span>
				</div>
				<div className="git-details-refs">
					<Icon name="branch" size={12} />
					{refs.map((ref, refIndex) => <Tag key={ref} className={refIndex === 0 ? "git-ref git-ref--primary" : "git-ref"}>{ref}</Tag>)}
				</div>
				<Tabs items={detailTabs} value={tab} onChange={onTabChange} className="git-details-tabs" />
				{tab === "files" ? (
					<div className="git-details-files">
						<div className="git-details-section-head">
							<span>Changed files</span>
							<code>{String(commit.files.length).padStart(2, "0")}</code>
						</div>
						<div className="git-file-list">
							{commit.files.map((file) => (
								<FileRow
									key={file.dir + file.file}
									dir={file.dir}
									file={file.file}
									status={file.status}
									onClick={() => onFileOpen(file, commit)}
								/>
							))}
						</div>
					</div>
				) : (
					<div className="git-details-info">
						<div className="git-info-row"><span>Commit</span><code>{commit.id}</code></div>
						<div className="git-info-row"><span>Author</span><span>{commit.author}</span></div>
						<div className="git-info-row"><span>Branch</span><code>{commit.branch}</code></div>
						<div className="git-info-row"><span>Changes</span><span><b className="git-stat--add">+{commit.stats.additions}</b> <b className="git-stat--del">−{commit.stats.deletions}</b></span></div>
					</div>
				)}
				<Button variant="ghost" size="sm" className="git-open-diff" onClick={() => onAction("diff", commit)}>
					<Icon name="changes" size={13} />
					Open full diff
					<Icon name="arrowRight" size={12} />
				</Button>
			</aside>
		);
	}

	function StatePanel({ reviewState, commits, onRetry }) {
		if (reviewState === "loading") {
			return <div className="git-state-panel"><Spinner size={16} tone="accent" /><span>Loading commit history…</span></div>;
		}
		if (reviewState === "error") {
			return (
				<div className="git-state-panel git-state-panel--error">
					<Alert tone="danger" title="History unavailable">The repository could not be read.</Alert>
					<Button size="sm" onClick={onRetry}>Try again</Button>
				</div>
			);
		}
		if (reviewState === "empty" || commits.length === 0) {
			return (
				<div className="git-state-panel git-state-panel--empty">
					<Empty iconName="search" title="No commits found" description="Try another branch, author, or search term." />
				</div>
			);
		}
		return null;
	}

	function GitLogPanel({
		branch,
		onBranchChange,
		scope,
		onScopeChange,
		author,
		onAuthorChange,
		dateFilter,
		onDateChange,
		query,
		onQueryChange,
		commits,
		selectedId,
		onSelect,
		onAction,
		onFileOpen,
		onRefresh,
		isRefreshing,
		reviewState,
		onRetry,
		layout,
		detailTab,
		onDetailTabChange,
	}) {
		const selectedCommit = commits.find((commit) => commit.id === selectedId) || commits[0];
		const isStack = layout === "stack";
		return (
			<section className={"git-log-shell git-log-shell--" + layout} data-screen-label="WebStorm-style Git Log sidebar">
				<div className="git-log-windowbar">
					<div className="git-log-window-title">
						<Icon name="branch" size={14} />
						<strong>Git</strong>
						<span className="git-log-window-separator">/</span>
						<span>Log</span>
					</div>
					<div className="git-log-window-actions">
						<span className="git-sidebar-badge">RIGHT SIDEBAR</span>
						<IconButton title="Refresh history" aria-label="Refresh history" className={"git-icon-button" + (isRefreshing ? " is-refreshing" : "")} onClick={onRefresh}>
							<Icon name="refresh" size={14} />
						</IconButton>
						<ToolbarMenu onAction={onAction} />
						<IconButton title="Close Git Log" aria-label="Close Git Log" className="git-icon-button">
							<Icon name="x" size={14} />
						</IconButton>
					</div>
				</div>
				<Tabs items={panelTabs} value="log" onChange={(value) => onAction("tab", value)} className="git-log-panel-tabs" />
				<div className="git-log-filterbar">
					<div className="git-filter-row">
						<BranchMenu value={branch} onChange={onBranchChange} />
						<span className="git-filter-divider"></span>
						<SegmentedControl
							options={[{ value: "current", label: "Current branch" }, { value: "all", label: "All branches" }]}
							value={scope}
							onChange={onScopeChange}
							className="git-scope-control"
						/>
						<FilterMenu label="Author" iconName="changes" value={author} options={[{ value: "all", label: "All authors" }, { value: "W. Fan", label: "W. Fan" }, { value: "A. Chen", label: "A. Chen" }, { value: "J. Lin", label: "J. Lin" }]} onChange={onAuthorChange} />
						<FilterMenu label="Date" iconName="sort" value={dateFilter} options={dateOptions} onChange={onDateChange} />
					</div>
					<div className="git-filter-row git-filter-row--secondary">
						<div className="git-search-wrap">
							<Input
								iconName="search"
								placeholder="Search commits"
								value={query}
								onChange={(event) => onQueryChange(event.target.value)}
								trailing={<Kbd>⌘P</Kbd>}
							/>
						</div>
						<span className="git-filter-count">{commits.length} commits</span>
						<IconButton title="Sort by date" aria-label="Sort by date" className="git-icon-button">
							<Icon name="sort" size={13} />
						</IconButton>
					</div>
					<div className="git-active-filters">
						<span className="git-filter-caption">Showing</span>
						<Tag className="git-active-filter"><Icon name="branch" size={11} />{branch === "all" ? "all branches" : branch}</Tag>
						{author !== "all" ? <Tag className="git-active-filter">{author}</Tag> : null}
						{dateFilter !== "any" ? <Tag className="git-active-filter">{dateOptions.find((option) => option.value === dateFilter)?.label}</Tag> : null}
					</div>
				</div>
				<div className={"git-log-content" + (isStack ? " git-log-content--stack" : "")}>
					<div className="git-log-list-wrap">
						<StatePanel reviewState={reviewState} commits={commits} onRetry={onRetry} />
						{reviewState === "ready" && commits.length > 0 ? (
							<CommitTable commits={commits} selectedId={selectedCommit?.id} onSelect={onSelect} onAction={onAction} />
						) : null}
					</div>
					{reviewState === "ready" && commits.length > 0 ? (
						<CommitDetails commit={selectedCommit} tab={detailTab} onTabChange={onDetailTabChange} onFileOpen={onFileOpen} onAction={onAction} />
					) : null}
				</div>
				<div className="git-log-statusbar">
					<span><span className="git-status-dot"></span>Synced just now</span>
					<span><code>main</code> · 48 commits</span>
					<span className="git-statusbar-spacer"></span>
					<span>⌘P Search</span>
				</div>
			</section>
		);
	}

	function ReviewApp() {
		const [layout, setLayout] = useState("side");
		const [reviewState, setReviewState] = useState("ready");
		const [branch, setBranch] = useState("main");
		const [scope, setScope] = useState("current");
		const [author, setAuthor] = useState("all");
		const [dateFilter, setDateFilter] = useState("any");
		const [query, setQuery] = useState("");
		const [selectedId, setSelectedId] = useState("2a9f18d");
		const [detailTab, setDetailTab] = useState("files");
		const [isRefreshing, setIsRefreshing] = useState(false);
		const [toastMessage, setToastMessage] = useState(null);
		const toastTimerRef = useRef(null);
		const allCommits = window.gitHistoryFixtures || [];

		const filteredCommits = useMemo(() => {
			const normalizedQuery = query.trim().toLowerCase();
			return allCommits.filter((commit) => {
				const matchesBranch = branch === "all" || commit.branch === branch || (commit.refs || []).includes(branch);
				const matchesScope = scope === "all" || (branch === "all" ? commit.branch === "main" : commit.branch === branch || (commit.refs || []).includes(branch));
				const matchesAuthor = author === "all" || commit.author === author;
				const matchesDate = dateFilter === "any" || (dateFilter === "today" && commit.group === "Today") || (dateFilter === "week" && commit.group !== "Earlier");
				const searchable = [commit.title, commit.author, commit.id, commit.branch, ...(commit.refs || [])].join(" ").toLowerCase();
				return matchesBranch && matchesScope && matchesAuthor && matchesDate && (!normalizedQuery || searchable.includes(normalizedQuery));
			});
		}, [allCommits, author, branch, dateFilter, query, scope]);

		const showToast = (message, tone) => {
			setToastMessage({ message, tone: tone || "info" });
			window.clearTimeout(toastTimerRef.current);
			toastTimerRef.current = window.setTimeout(() => setToastMessage(null), 2600);
		};

		useEffect(() => () => window.clearTimeout(toastTimerRef.current), []);

		useEffect(() => {
			const handleKeyDown = (event) => {
				if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "p") {
					event.preventDefault();
					document.querySelector(".git-search-wrap input")?.focus();
				}
			};
			window.addEventListener("keydown", handleKeyDown);
			return () => window.removeEventListener("keydown", handleKeyDown);
		}, []);

		const handleRefresh = () => {
			if (isRefreshing) return;
			setIsRefreshing(true);
			window.setTimeout(() => {
				setIsRefreshing(false);
				setReviewState("ready");
				showToast("Git Log refreshed", "success");
			}, 620);
		};

		const handleAction = async (actionName, value) => {
			if (actionName === "copy" && value?.fullHash) {
				try {
					await navigator.clipboard?.writeText(value.fullHash);
				} catch (clipboardError) {
					void clipboardError;
				}
				showToast("Copied " + value.id, "success");
				return;
			}
			if (actionName === "diff" && value) {
				setSelectedId(value.id);
				showToast("Opening diff for " + value.id);
				return;
			}
			if (actionName === "terminal" && value) {
				showToast("Terminal opened at " + value.id);
				return;
			}
			if (actionName === "refresh") {
				handleRefresh();
				return;
			}
			if (actionName === "labels") {
				showToast("Branch labels are visible");
				return;
			}
			if (actionName === "tab") {
				if (value !== "log") showToast(value === "local" ? "Local Changes is outside this review" : "Console is outside this review");
				return;
			}
			if (actionName === "close-details") {
				showToast("Select a commit to reopen details");
				return;
			}
			if (actionName === "file" && value) {
				showToast("Opening " + value.file + " in diff");
			}
		};

		const handleFileOpen = (file, commit) => {
			if (!file || !commit) return;
			setSelectedId(commit.id);
			handleAction("file", file);
		};

		return (
			<main className="review-page" data-screen-label="WebStorm Log Git history review">
				<header className="review-bar">
					<div className="review-bar-title">
						<span className="review-bar-kicker">GIT HISTORY / RIGHT SIDEBAR</span>
						<strong>WebStorm Log direction</strong>
					</div>
					<div className="review-bar-controls">
						<span className="review-bar-note">dense table · graph lane · selected commit</span>
						<SegmentedControl options={[{ value: "side", label: "Side detail" }, { value: "stack", label: "Stack detail" }]} value={layout} onChange={setLayout} className="review-layout-control" />
						<ReviewStateMenu reviewState={reviewState} onChange={setReviewState} />
					</div>
				</header>
				<section className="review-stage">
					<div className="review-stage-label">
						<span className="review-stage-dot"></span>
						<span>expanded tool window</span>
						<code>620–680 px sidebar target</code>
					</div>
					<GitLogPanel
						branch={branch}
						onBranchChange={setBranch}
						scope={scope}
						onScopeChange={setScope}
						author={author}
						onAuthorChange={setAuthor}
						dateFilter={dateFilter}
						onDateChange={setDateFilter}
						query={query}
						onQueryChange={setQuery}
						commits={filteredCommits}
						selectedId={selectedId}
						onSelect={setSelectedId}
						onAction={handleAction}
						onFileOpen={handleFileOpen}
						onRefresh={handleRefresh}
						isRefreshing={isRefreshing}
						reviewState={reviewState}
						onRetry={() => setReviewState("ready")}
						layout={layout}
						detailTab={detailTab}
						onDetailTabChange={setDetailTab}
					/>
				</section>
				{toastMessage ? (
					<div className="review-toast" role="status">
						<Toast tone={toastMessage.tone} iconName={toastMessage.tone === "success" ? "check" : "changes"}>{toastMessage.message}</Toast>
					</div>
				) : null}
			</main>
		);
	}

	ReactDOM.createRoot(document.getElementById("root")).render(<ReviewApp />);
})();
