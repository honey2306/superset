(function () {
	const historyDs = window.SupersetDesignSystem_91a6da;
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
	} = historyDs;
	const { useEffect, useMemo, useRef, useState } = React;

	const directionOptions = [
		{ value: "quiet", label: "A · Quiet list" },
		{ value: "inspect", label: "B · Inspect split" },
		{ value: "refs", label: "C · Ref chips" },
	];

	const directionMeta = {
		quiet: {
			letter: "A",
			name: "Quiet list",
			tag: "Recommended",
			description: "让 commit message 先被看见，其他信息退到第二行。",
		},
		inspect: {
			letter: "B",
			name: "Inspect split",
			tag: "Detail-first",
			description: "上半快速浏览，下半直接检查选中 commit 的文件。",
		},
		refs: {
			letter: "C",
			name: "Ref chips",
			tag: "Ref-aware",
			description: "把 branch / tag 提到前面，但保留平静的列表阅读节奏。",
		},
	};

	const tabItems = [
		{ value: "Info", label: "Info" },
		{ value: "Changes", label: "Changes", iconName: "changes" },
		{ value: "History", label: "History" },
		{ value: "Files", label: "Files", iconName: "file" },
	];

	const stateOptions = [
		{ value: "ready", label: "Ready", iconName: "check" },
		{ value: "loading", label: "Loading", iconName: "refresh" },
		{ value: "empty", label: "Empty", iconName: "search" },
		{ value: "error", label: "Error", iconName: "alert" },
	];

	const groupOrder = ["Today", "Yesterday", "Earlier"];

	function getCommitGroups(commits) {
		return groupOrder
			.map((groupName) => [groupName, commits.filter((commit) => commit.group === groupName)])
			.filter(([, groupCommits]) => groupCommits.length > 0);
	}

	function dismissDropdown() {
		window.setTimeout(() => {
			document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
		}, 0);
	}

	function CommitMoreMenu({ commit, onAction }) {
		return (
			<span className="history-more-menu" onClick={(event) => event.stopPropagation()}>
				<DropdownMenu
					trigger={
						<IconButton title={`More actions for ${commit.id}`} aria-label={`More actions for ${commit.id}`}>
							<Icon name="moreH" size={14} />
						</IconButton>
					}
					side="bottom"
					align="end"
				>
					<MenuHeading iconName="changes" title={commit.id} />
					<MenuSep />
					<MenuItem
						iconName="copy"
						label="Copy full hash"
						onClick={() => {
							onAction("copy", commit);
							dismissDropdown();
						}}
					/>
					<MenuItem
						iconName="changes"
						label="Open diff"
						onClick={() => {
							onAction("diff", commit);
							dismissDropdown();
						}}
					/>
					<MenuItem
						iconName="terminal"
						label="Open in terminal"
						onClick={() => {
							onAction("terminal", commit);
							dismissDropdown();
						}}
					/>
				</DropdownMenu>
			</span>
		);
	}

	function CommitRow({ commit, selected, direction, onSelect, onAction, onFileOpen }) {
		const refs = commit.refs || [];
		return (
			<article className={`history-commit-row${selected ? " is-selected" : ""}`}>
				<button type="button" className="history-commit-main" onClick={onSelect}>
					<div className="history-commit-message-row">
						<span className="history-commit-message">{commit.title}</span>
						{direction === "refs" ? <span className="history-commit-branch">{commit.branch}</span> : null}
					</div>
					<div className="history-commit-meta">
						<span>{commit.author}</span>
						<span className="history-meta-separator">·</span>
						<code>{commit.id}</code>
						<span className="history-commit-time">{commit.date} · {commit.time}</span>
					</div>
					{direction === "refs" ? (
						<div className="history-commit-ref-row">
							<Icon name="branch" size={12} />
							{refs.map((ref) => <Tag key={ref}>{ref}</Tag>)}
						</div>
					) : null}
				</button>
				<CommitMoreMenu commit={commit} onAction={onAction} />
				{direction === "inspect" && selected ? (
					<div className="history-row-hint">
						<span>{commit.files.length} files</span>
						<button type="button" onClick={() => onFileOpen(commit.files[0], commit)}>
							View detail <Icon name="arrowRight" size={12} />
						</button>
					</div>
				) : null}
			</article>
		);
	}

	function CommitList({ commits, selectedId, direction, onSelect, onAction, onFileOpen }) {
		const groupedCommits = getCommitGroups(commits);
		return (
			<div className={`history-list history-list--${direction}`}>
				{groupedCommits.map(([groupName, groupCommits]) => (
					<section className="history-group" key={groupName}>
						<div className="history-group-label">
							<span>{groupName}</span>
							<code>{String(groupCommits.length).padStart(2, "0")}</code>
						</div>
						<div className="history-group-rows">
							{groupCommits.map((commit) => (
								<CommitRow
									key={commit.id}
									commit={commit}
									selected={selectedId === commit.id}
									direction={direction}
									onSelect={() => onSelect(commit.id)}
									onAction={onAction}
									onFileOpen={onFileOpen}
								/>
							))}
						</div>
					</section>
				))}
				<div className="history-list-footer">
					<span>Showing {commits.length} of 48 commits</span>
					<Button variant="ghost" size="sm">Load more</Button>
				</div>
			</div>
		);
	}

	function CommitDetail({ commit, onFileOpen }) {
		if (!commit) return null;
		return (
			<section className="history-detail" aria-label="Selected commit detail">
				<div className="history-detail-heading">
					<span className="history-detail-eyebrow">Selected commit</span>
					<code>{commit.id}</code>
				</div>
				<h3>{commit.title}</h3>
				<div className="history-detail-author">
					<Avatar name={commit.avatarName || commit.author} size={20} />
					<span>{commit.author}</span>
					<span className="history-meta-separator">·</span>
					<span>{commit.date} · {commit.time}</span>
				</div>
				<div className="history-detail-refs">
					<Icon name="branch" size={12} />
					{(commit.refs || []).map((ref) => <Tag key={ref}>{ref}</Tag>)}
				</div>
				<div className="history-detail-files-heading">
					<span>Changed files</span>
					<code>{commit.files.length}</code>
				</div>
				<div className="history-detail-files">
					{commit.files.map((file) => (
						<FileRow
							key={`${file.dir}${file.file}`}
							dir={file.dir}
							file={file.file}
							status={file.status}
							onClick={() => onFileOpen(file, commit)}
						/>
					))}
				</div>
				<button type="button" className="history-detail-diff" onClick={() => onFileOpen(commit.files[0], commit)}>
					Open full diff <Icon name="arrowRight" size={12} />
				</button>
			</section>
		);
	}

	function RefSummary({ commits }) {
		const refs = [...new Set(commits.flatMap((commit) => commit.refs || []))];
		return (
			<div className="history-ref-summary">
				<div className="history-ref-summary-label"><Icon name="branch" size={12} /> Refs in view</div>
				<div className="history-ref-summary-list">
					{refs.map((ref) => <Tag key={ref}>{ref}</Tag>)}
				</div>
			</div>
		);
	}

	function StatePanel({ reviewState, commits, onRetry }) {
		if (reviewState === "loading") {
			return <div className="history-state-panel"><Spinner size={16} tone="accent" /><span>Loading commit history…</span></div>;
		}
		if (reviewState === "error") {
			return (
				<div className="history-state-panel history-state-panel--error">
					<Alert tone="danger" title="History unavailable">The repository could not be read.</Alert>
					<Button size="sm" onClick={onRetry}>Try again</Button>
				</div>
			);
		}
		if (reviewState === "empty" || commits.length === 0) {
			return (
				<div className="history-state-panel history-state-panel--empty">
					<Empty iconName="search" title="No commits found" description="Try a different branch or search term." />
				</div>
			);
		}
		return null;
	}

	function HistorySidebar({
		direction,
		reviewState,
		commits,
		selectedId,
		query,
		onQueryChange,
		scope,
		onScopeChange,
		onSelect,
		onAction,
		onFileOpen,
		onRefresh,
		isRefreshing,
		onRetry,
	}) {
		const selectedCommit = commits.find((commit) => commit.id === selectedId) || commits[0];
		const isSplit = direction === "inspect";
		const isRefs = direction === "refs";
		return (
			<section className={`history-sidebar-v2 history-sidebar-v2--${direction}`} data-screen-label={`History sidebar · ${directionMeta[direction].name}`}>
				<Tabs value="History" onChange={() => {}} items={tabItems} className="history-sidebar-tabs" />
				<header className="history-sidebar-header">
					<div className="history-sidebar-title-row">
						<div>
							<h2>History</h2>
							<p><code>main</code><span>·</span>48 commits</p>
						</div>
						<IconButton title="Refresh history" aria-label="Refresh history" onClick={onRefresh} className={isRefreshing ? "is-refreshing" : ""}>
							<Icon name="refresh" size={14} />
						</IconButton>
					</div>
					<div className="history-sidebar-context">
						<span className="history-context-dot" />
						<span>Local repository</span>
						<code>~/Code/superset</code>
					</div>
					<div className="history-sidebar-search">
						<Input
							iconName="search"
							placeholder="Search commits"
							value={query}
							onChange={(event) => onQueryChange(event.target.value)}
							trailing={<Kbd>⌘P</Kbd>}
						/>
					</div>
					<div className="history-sidebar-scope">
						<span className="history-control-label">Scope</span>
						<SegmentedControl
							options={[{ value: "current", label: "Current branch" }, { value: "all", label: "All branches" }]}
							value={scope}
							onChange={onScopeChange}
							className="history-scope-control"
						/>
					</div>
				</header>
				{isRefs && commits.length > 0 ? <RefSummary commits={commits} /> : null}
				<div className={`history-sidebar-body${isSplit ? " history-sidebar-body--split" : ""}`}>
					<StatePanel reviewState={reviewState} commits={commits} onRetry={onRetry} />
					{reviewState === "ready" && commits.length > 0 ? (
						<>
							<CommitList
								commits={commits}
								selectedId={selectedId}
								direction={direction}
								onSelect={onSelect}
								onAction={onAction}
								onFileOpen={onFileOpen}
							/>
							{isSplit ? <CommitDetail commit={selectedCommit} onFileOpen={onFileOpen} /> : null}
						</>
					) : null}
				</div>
				<footer className="history-sidebar-footer">
					<span><span className="history-footer-dot" />Synced just now</span>
					<code>⌘P search</code>
				</footer>
			</section>
		);
	}

	function ReviewStateMenu({ reviewState, onStateChange }) {
		const activeState = stateOptions.find((option) => option.value === reviewState) || stateOptions[0];
		return (
			<DropdownMenu
				trigger={
					<Button variant="ghost" size="sm" className="review-state-trigger">
						Review states <span>{activeState.label}</span><Icon name="chevron" size={10} />
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
							onStateChange(option.value);
							dismissDropdown();
						}}
					/>
				))}
			</DropdownMenu>
		);
	}

	function ReviewOption({ direction, ...sidebarProps }) {
		const meta = directionMeta[direction];
		return (
			<article className={`review-option review-option--${direction}`}>
				<div className="review-option-heading">
					<div>
						<div className="review-option-kicker">{meta.letter} / {meta.tag}</div>
						<h2>{meta.name}</h2>
						<p>{meta.description}</p>
					</div>
					{direction === "quiet" ? <Badge pill>Recommended</Badge> : null}
				</div>
				<div className="history-sidebar-frame">
					<HistorySidebar direction={direction} {...sidebarProps} />
				</div>
			</article>
		);
	}

	function ReviewApp() {
		const [direction, setDirection] = useState("quiet");
		const [viewMode, setViewMode] = useState("focus");
		const [reviewState, setReviewState] = useState("ready");
		const [scope, setScope] = useState("current");
		const [query, setQuery] = useState("");
		const [selectedId, setSelectedId] = useState("2a9f18d");
		const [isRefreshing, setIsRefreshing] = useState(false);
		const [toastMessage, setToastMessage] = useState(null);
		const toastTimerRef = useRef(null);
		const allCommits = window.gitHistoryFixtures || [];

		const filteredCommits = useMemo(() => {
			const normalizedQuery = query.trim().toLowerCase();
			return allCommits.filter((commit) => {
				const matchesScope = scope === "all" || commit.branch === "main";
				const searchable = [commit.title, commit.author, commit.id, commit.branch, ...(commit.refs || [])].join(" ").toLowerCase();
				return matchesScope && (!normalizedQuery || searchable.includes(normalizedQuery));
			});
		}, [allCommits, query, scope]);

		const showToast = (message, tone = "info") => {
			setToastMessage({ message, tone });
			window.clearTimeout(toastTimerRef.current);
			toastTimerRef.current = window.setTimeout(() => setToastMessage(null), 2800);
		};

		useEffect(() => () => window.clearTimeout(toastTimerRef.current), []);

		useEffect(() => {
			const handleKeyDown = (keyboardEvent) => {
				if ((keyboardEvent.metaKey || keyboardEvent.ctrlKey) && keyboardEvent.key.toLowerCase() === "p") {
					keyboardEvent.preventDefault();
					document.querySelector(".history-sidebar-search input")?.focus();
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
				showToast("History refreshed", "success");
			}, 650);
		};

		const handleCommitAction = async (actionName, commit) => {
			if (actionName === "copy") {
				try {
					await navigator.clipboard?.writeText(commit.fullHash);
				} catch (clipboardError) {
					void clipboardError;
				}
				showToast(`Copied ${commit.id}`, "success");
				return;
			}
			if (actionName === "diff") {
				setSelectedId(commit.id);
				showToast(`Diff opened for ${commit.id}`);
				return;
			}
			showToast(`Terminal opened at ${commit.id}`);
		};

		const handleFileOpen = (file, commit) => {
			if (!file || !commit) return;
			setSelectedId(commit.id);
			showToast(`Opening ${file.file} in diff`);
		};

		const sidebarProps = {
			reviewState,
			commits: filteredCommits,
			selectedId,
			query,
			onQueryChange: setQuery,
			scope,
			onScopeChange: setScope,
			onSelect: setSelectedId,
			onAction: handleCommitAction,
			onFileOpen: handleFileOpen,
			onRefresh: handleRefresh,
			isRefreshing,
			onRetry: () => setReviewState("ready"),
		};

		return (
			<main className="review-page" data-screen-label="Git history sidebar review">
				<header className="review-topbar">
					<div className="review-intro">
						<div className="review-eyebrow">DESIGN REVIEW / RIGHT SIDEBAR</div>
						<h1>Git history, made quiet.</h1>
						<p>让 commit message 成为第一视觉，sidebar 只保留决定下一步的信息。</p>
					</div>
					<div className="review-controls">
						<SegmentedControl options={directionOptions} value={direction} onChange={setDirection} className="review-direction-control" />
						<SegmentedControl
							options={[{ value: "focus", label: "Focus" }, { value: "compare", label: "Compare all" }]}
							value={viewMode}
							onChange={setViewMode}
							className="review-view-control"
						/>
						<ReviewStateMenu reviewState={reviewState} onStateChange={setReviewState} />
					</div>
				</header>
				<section className={`review-stage review-stage--${viewMode}`}>
					{viewMode === "compare" ? (
						directionOptions.map((option) => <ReviewOption key={option.value} direction={option.value} {...sidebarProps} />)
					) : (
						<ReviewOption direction={direction} {...sidebarProps} />
					)}
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
