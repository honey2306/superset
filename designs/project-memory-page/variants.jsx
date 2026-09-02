function MemoryListDirection() {
	const memoryState = useMemoryVariantState();
	const activeProject = MEMORY_PROJECTS.find((item) => item.id === memoryState.activeProjectId);
	return (
		<MemoryAppFrame
			activeProjectId={memoryState.activeProjectId}
			onProjectChange={(projectId) => {
				memoryState.setActiveProjectId(projectId);
				memoryState.setEditingMemory(null);
			}}
		>
			<main className="memory-content">
				<PageHeader
					projectName={activeProject?.name}
					count={memoryState.allItems.length}
					searchValue={memoryState.searchValue}
					onSearchChange={memoryState.setSearchValue}
					onCreate={() => memoryState.setEditingMemory({ id: "new" })}
					filters={["全部", "置顶", "排障", "架构", "工作流", "已停用"]}
					activeFilter={memoryState.activeFilter}
					onFilterChange={memoryState.setActiveFilter}
				/>
				<div className="memory-scroll">
					<div className="variant-note" style={{ marginBottom: "var(--s-4)" }}>
						方向 A · 克制列表（推荐）：高密度、易扫描，适合长期积累数十到数百条记忆。
					</div>
					{memoryState.editingMemory?.id === "new" && (
						<InlineEditor onClose={() => memoryState.setEditingMemory(null)} />
					)}
					<div className="memory-list" style={{ marginTop: "var(--s-4)" }}>
						{memoryState.visibleItems.map((memoryItem) => (
							<React.Fragment key={memoryItem.id}>
								<div
									className={`memory-row ${memoryState.editingMemory?.id === memoryItem.id ? "is-selected" : ""}`}
									onClick={() => memoryState.setEditingMemory(memoryItem)}
									style={{ opacity: memoryItem.enabled ? 1 : "var(--o-mute)" }}
								>
									<span className={`memory-row__pin ${memoryItem.pinned ? "is-pinned" : ""}`}>
										<Icon name={memoryItem.pinned ? "spark" : "file"} size={13} />
									</span>
									<div>
										<div className="memory-row__title">{memoryItem.title}</div>
										<div className="memory-row__body">{memoryItem.body}</div>
										<MemoryMeta memoryItem={memoryItem} />
									</div>
									<div className="memory-row__actions">
										<IconButton title="编辑"><Icon name="edit" size={12} /></IconButton>
										<IconButton title="更多"><Icon name="moreH" size={12} /></IconButton>
									</div>
								</div>
								{memoryState.editingMemory?.id === memoryItem.id && (
									<InlineEditor
										memoryItem={memoryItem}
										onClose={() => memoryState.setEditingMemory(null)}
									/>
								)}
							</React.Fragment>
						))}
					</div>
				</div>
			</main>
		</MemoryAppFrame>
	);
}

function MemoryCardsDirection() {
	const memoryState = useMemoryVariantState();
	const activeProject = MEMORY_PROJECTS.find((item) => item.id === memoryState.activeProjectId);
	return (
		<MemoryAppFrame
			activeProjectId={memoryState.activeProjectId}
			onProjectChange={memoryState.setActiveProjectId}
		>
			<main className="memory-content">
				<PageHeader
					projectName={activeProject?.name}
					count={memoryState.allItems.length}
					searchValue={memoryState.searchValue}
					onSearchChange={memoryState.setSearchValue}
					onCreate={() => memoryState.setEditingMemory({ id: "new" })}
					filters={["全部", "置顶", "排障", "架构", "工作流", "偏好"]}
					activeFilter={memoryState.activeFilter}
					onFilterChange={memoryState.setActiveFilter}
				/>
				<div className="memory-scroll">
					<div className="variant-note" style={{ marginBottom: "var(--s-4)" }}>
						方向 B · 知识卡片：强调主题和内容预览，更像可浏览的项目知识库。
					</div>
					{memoryState.editingMemory?.id === "new" && (
						<InlineEditor onClose={() => memoryState.setEditingMemory(null)} />
					)}
					<div className="memory-grid" style={{ marginTop: "var(--s-4)" }}>
						{memoryState.visibleItems.filter((item) => item.enabled).map((memoryItem) => (
							<div className="memory-card" key={memoryItem.id}>
								<div className="memory-card__top">
									<CategoryBadge memoryItem={memoryItem} />
									<span className="page-spacer"></span>
									{memoryItem.pinned && <Icon name="spark" size={13} />}
									<IconButton title="编辑" onClick={() => memoryState.setEditingMemory(memoryItem)}>
										<Icon name="edit" size={12} />
									</IconButton>
								</div>
								<div className="memory-row__title" style={{ marginTop: "var(--s-5)" }}>
									{memoryItem.title}
								</div>
								<div className="memory-card__body">{memoryItem.body}</div>
								<div className="memory-card__foot">
									<Icon name={memoryItem.source === "Agent" ? "spark" : "edit"} size={11} />
									<span>{memoryItem.source}</span>
									<span>·</span>
									<span>{memoryItem.updated}</span>
									<span className="page-spacer"></span>
									<Switch checked={memoryItem.enabled} onChange={() => {}} />
								</div>
							</div>
						))}
					</div>
				</div>
			</main>
		</MemoryAppFrame>
	);
}

function MemoryTimelineDirection() {
	const memoryState = useMemoryVariantState();
	const activeProject = MEMORY_PROJECTS.find((item) => item.id === memoryState.activeProjectId);
	return (
		<MemoryAppFrame
			activeProjectId={memoryState.activeProjectId}
			onProjectChange={memoryState.setActiveProjectId}
		>
			<main className="memory-content">
				<PageHeader
					projectName={activeProject?.name}
					count={memoryState.allItems.length}
					searchValue={memoryState.searchValue}
					onSearchChange={memoryState.setSearchValue}
					onCreate={() => memoryState.setEditingMemory({ id: "new" })}
					filters={["全部", "Agent", "手动", "置顶"]}
					activeFilter={memoryState.activeFilter}
					onFilterChange={memoryState.setActiveFilter}
				/>
				<div className="memory-scroll">
					<div className="variant-note" style={{ marginBottom: "var(--s-5)" }}>
						方向 C · Agent 时间线：强调“这条记忆从哪里来”，适合审计自动记忆，但管理效率较低。
					</div>
					<div className="timeline">
						{memoryState.visibleItems.filter((item) => item.enabled).map((memoryItem) => (
							<div className="timeline-group" key={memoryItem.id}>
								<div className="timeline-time">{memoryItem.updated}</div>
								<div className="timeline-card">
									<div className="timeline-card__head">
										<Icon name={memoryItem.source === "Agent" ? "spark" : "edit"} size={13} />
										<span className="memory-row__title">{memoryItem.title}</span>
										<span className="page-spacer"></span>
										<CategoryBadge memoryItem={memoryItem} />
										{memoryItem.pinned && <Chip tone="mod">置顶</Chip>}
									</div>
									<div className="timeline-card__body">{memoryItem.body}</div>
									<div className="timeline-context">
										来源 · {memoryItem.sourceDetail}　→　由 {memoryItem.source} 写入项目记忆
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			</main>
		</MemoryAppFrame>
	);
}

Object.assign(window, { MemoryListDirection, MemoryCardsDirection, MemoryTimelineDirection });
