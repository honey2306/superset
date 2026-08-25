(function () {
	const {
		AppRail,
		ContextMenuLayer,
		HistorySidebar,
		ToastStack,
		WindowChrome,
		WorkArea,
		WorkspaceNav,
	} = window;
	const { useEffect, useMemo, useState } = React;

	function PrototypeApp() {
		const [activeRail, setActiveRail] = useState("workspaces");
		const [activeTab, setActiveTab] = useState("History");
		const [branchScope, setBranchScope] = useState("branch");
		const [filterValue, setFilterValue] = useState("");
		const [variant, setVariant] = useState("timeline");
		const [previewState, setPreviewState] = useState("ready");
		const [sidebarWidth, setSidebarWidth] = useState(250);
		const [expandedIds, setExpandedIds] = useState(() => new Set(["2a9f18d"]));
		const [selectedId, setSelectedId] = useState("2a9f18d");
		const [menuState, setMenuState] = useState(null);
		const [toastState, setToastState] = useState(null);
		const [isRefreshing, setIsRefreshing] = useState(false);
		const [isResizing, setIsResizing] = useState(false);

		const allCommits = window.gitHistoryFixtures || [];
		const filteredCommits = useMemo(() => {
			const searchNeedle = filterValue.trim().toLowerCase();
			return allCommits.filter((commit) => {
				const inScope = branchScope === "all" || commit.branch === "main";
				const inSearch = !searchNeedle || [commit.title, commit.author, commit.id, commit.branch, ...commit.refs].join(" ").toLowerCase().includes(searchNeedle);
				return inScope && inSearch;
			});
		}, [allCommits, branchScope, filterValue]);

		const groupedCommits = useMemo(() => {
			const order = ["Today", "Yesterday", "Earlier"];
			return order.map((groupName) => [groupName, filteredCommits.filter((commit) => commit.group === groupName)]).filter(([, commits]) => commits.length > 0);
		}, [filteredCommits]);

		const showToast = (message, tone = "info") => {
			setToastState({ message, tone });
			window.setTimeout(() => setToastState(null), 3200);
		};

		useEffect(() => {
			const handleKeyDown = (keyboardEvent) => {
				if (keyboardEvent.key === "Escape") {
					setMenuState(null);
				}
				if ((keyboardEvent.metaKey || keyboardEvent.ctrlKey) && keyboardEvent.key.toLowerCase() === "p") {
					keyboardEvent.preventDefault();
					document.querySelector(".history-filter-row input")?.focus();
				}
			};
			window.addEventListener("keydown", handleKeyDown);
			return () => window.removeEventListener("keydown", handleKeyDown);
		}, []);

		useEffect(() => {
			if (!isResizing) return undefined;
			const handlePointerMove = (pointerEvent) => {
				const nextWidth = Math.round(Math.min(500, Math.max(200, window.innerWidth - pointerEvent.clientX)));
				setSidebarWidth(nextWidth);
			};
			const stopResize = () => setIsResizing(false);
			window.addEventListener("pointermove", handlePointerMove);
			window.addEventListener("pointerup", stopResize, { once: true });
			return () => {
				window.removeEventListener("pointermove", handlePointerMove);
				window.removeEventListener("pointerup", stopResize);
			};
		}, [isResizing]);

		const handleRefresh = () => {
			if (isRefreshing) return;
			setIsRefreshing(true);
			window.setTimeout(() => {
				setIsRefreshing(false);
				showToast("History refreshed", "success");
			}, 650);
		};

		const handleToggle = (commitId) => {
			if (commitId === "load-more") {
				showToast("All available commits loaded");
				return;
			}
			setExpandedIds((currentIds) => {
				const nextIds = new Set(currentIds);
				if (nextIds.has(commitId)) nextIds.delete(commitId);
				else nextIds.add(commitId);
				return nextIds;
			});
		};

		const handleMore = (pointerEvent, commit) => {
			pointerEvent?.stopPropagation();
			setMenuState({
				commit,
				x: Math.min(window.innerWidth - 260, (pointerEvent?.clientX || window.innerWidth - sidebarWidth) + 4),
				y: Math.min(window.innerHeight - 240, (pointerEvent?.clientY || 240) + 4),
			});
		};

		const handleContextMenu = (pointerEvent, commit) => {
			pointerEvent.preventDefault();
			setMenuState({
				commit,
				x: Math.min(window.innerWidth - 260, pointerEvent.clientX + 4),
				y: Math.min(window.innerHeight - 240, pointerEvent.clientY + 4),
			});
		};

		const handleMenuAction = async (actionName, commit) => {
			setMenuState(null);
			if (actionName === "copy") {
				try {
					await navigator.clipboard?.writeText(commit.fullHash);
				} catch (clipboardError) {
					void clipboardError;
				}
				showToast(`Copied ${commit.id}`, "success");
				return;
			}
			if (actionName === "terminal") {
				showToast(`Opened terminal at ${commit.id}`);
				return;
			}
			if (actionName === "diff") {
				setSelectedId(commit.id);
				showToast(`Diff opened for ${commit.id}`);
				return;
			}
			showToast(`Reset requested for ${commit.id}`, "warn");
		};

		const handleFileOpen = (file, commit) => {
			if (!file) return;
			setSelectedId(commit.id);
			showToast(`Opening ${file.file} in diff`);
		};

		return (
			<div className={`prototype-shell ${isResizing ? "is-resizing" : ""}`}>
				<WindowChrome />
				<div className="app-body" style={{ gridTemplateColumns: `42px 214px minmax(0, 1fr) ${sidebarWidth}px` }}>
					<AppRail activeRail={activeRail} onRailSelect={(railId) => { setActiveRail(railId); showToast(`${railId} selected`); }} />
					<WorkspaceNav workspaceName="feat/history-sidebar" variant={variant} onVariantChange={setVariant} previewState={previewState} onPreviewStateChange={setPreviewState} sidebarWidth={sidebarWidth} onSidebarWidthChange={setSidebarWidth} />
					<WorkArea />
					<div className="sidebar-column">
						<button type="button" className="sidebar-resize-handle" title="Drag to resize sidebar" aria-label="Resize sidebar" onPointerDown={() => setIsResizing(true)} />
						<HistorySidebar activeTab={activeTab} onTabChange={setActiveTab} onExpand={() => { setSidebarWidth(420); showToast("Sidebar expanded to 420px"); }} onClose={() => showToast("Sidebar close simulated")} branchScope={branchScope} onBranchScopeChange={setBranchScope} filterValue={filterValue} onFilterChange={setFilterValue} onRefresh={handleRefresh} isRefreshing={isRefreshing} previewState={previewState} variant={variant} groups={groupedCommits} commits={filteredCommits} expandedIds={expandedIds} selectedId={selectedId} onSelect={setSelectedId} onToggle={handleToggle} onMore={handleMore} onContextMenu={handleContextMenu} onFileOpen={handleFileOpen} onPreviewRetry={() => { setPreviewState("ready"); setBranchScope("all"); setFilterValue(""); }} />
					</div>
				</div>
				<ContextMenuLayer menuState={menuState} onAction={handleMenuAction} onDismiss={() => setMenuState(null)} />
				<ToastStack toastState={toastState} onDismiss={() => setToastState(null)} />
			</div>
		);
	}

	ReactDOM.createRoot(document.getElementById("root")).render(<PrototypeApp />);
})();
