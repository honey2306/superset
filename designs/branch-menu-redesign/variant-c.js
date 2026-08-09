(() => {
	// ---------------- Theme ----------------
	const root = document.documentElement;
	const themeSwitch = document.getElementById("themeSwitch");
	const applyTheme = (name) => {
		root.setAttribute("data-theme", name);
		themeSwitch.querySelectorAll("button").forEach((btn) => {
			btn.classList.toggle("is-active", btn.dataset.theme === name);
		});
		try {
			localStorage.setItem("variantCTheme", name);
		} catch {}
	};
	themeSwitch.addEventListener("click", (e) => {
		const btn = e.target.closest("button[data-theme]");
		if (btn) applyTheme(btn.dataset.theme);
	});
	try {
		const saved = localStorage.getItem("variantCTheme");
		if (saved) applyTheme(saved);
	} catch {}

	// ---------------- Data ----------------
	const branches = [
		{
			name: "feat/acp-agent-control-plane",
			kind: "local",
			tracked: true,
			ahead: 2,
			behind: 0,
			author: "wufan",
			when: "3h ago",
			isCurrent: true,
			tip: "8250c88",
			commits: [
				"8250c88 feat(acp-pane): floating permission card",
				"24cc7c4 feat(workspace): complete catalog provisioning cutover",
				"2401f5c refactor(desktop): route command workspace creation",
			],
		},
		{
			name: "main",
			kind: "local",
			tracked: true,
			ahead: 0,
			behind: 0,
			author: "ci-bot",
			when: "12m ago",
			isBase: true,
			isDefault: true,
			tip: "7fd1a60",
			commits: [
				"7fd1a60 chore(release): bump 1.18.4 → 1.18.5",
				"4c22be9 fix(host): guard PR sweep against stdout overflow",
				"2b8149f feat(desktop): file history dialog",
			],
		},
		{
			name: "feat/branch-menu",
			kind: "local",
			tracked: true,
			ahead: 4,
			behind: 1,
			author: "wufan",
			when: "2h ago",
			otherWorkspace: true,
			tip: "a91b0fe",
			commits: [
				"a91b0fe design(branch-menu): variant c palette",
				"7d33122 feat(desktop): open branch in new workspace",
				"cf882aa feat(git): merge strategies + reset",
			],
		},
		{
			name: "fix/git-panel-tab-order",
			kind: "local",
			tracked: false,
			ahead: 1,
			behind: 0,
			author: "wufan",
			when: "yesterday",
			tip: "1122334",
			commits: ["1122334 fix: tab order in changes panel"],
		},
		{
			name: "chore/deps-upgrade",
			kind: "local",
			tracked: true,
			ahead: 0,
			behind: 3,
			author: "wufan",
			when: "3d ago",
			tip: "aabbccd",
			commits: ["aabbccd chore: bump tanstack-router"],
		},
		{
			name: "release/1.19",
			kind: "remote",
			author: "ci-bot",
			when: "3d ago",
			tip: "5566778",
			commits: [
				"5566778 chore(release): cut 1.19-rc",
				"3344556 fix(mobile): pin ios build",
			],
		},
		{
			name: "chore/tanstack-upgrade",
			kind: "remote",
			author: "wufan",
			when: "5d ago",
			tip: "9988776",
			commits: ["9988776 chore: tanstack-router 1.85"],
		},
		{
			name: "feat/mobile-share-sheet",
			kind: "remote",
			author: "cursor",
			when: "1w ago",
			tip: "6677889",
			commits: ["6677889 feat(mobile): share sheet"],
		},
	];

	// ---------------- Query parsing ----------------
	// modes: "search" | "new" | "cmd"
	function parseQuery(raw) {
		const q = raw ?? "";
		if (q.startsWith(":new ")) {
			return { mode: "new", value: q.slice(5).trim(), raw: q };
		}
		if (q.startsWith(":")) {
			return { mode: "cmd", value: q.slice(1).trim(), raw: q };
		}
		if (q.startsWith("/")) {
			return { mode: "search", value: q.slice(1).trim(), raw: q };
		}
		return { mode: "search", value: q.trim(), raw: q };
	}

	// Fuzzy filter: naive substring insensitive
	function filterBranches(query) {
		const q = query.toLowerCase();
		if (!q) return branches;
		return branches.filter((b) => b.name.toLowerCase().includes(q));
	}

	// Highlight match inside name (returns HTML fragmeng)
	function highlight(name, query) {
		if (!query) return escapeHtml(name);
		const lower = name.toLowerCase();
		const q = query.toLowerCase();
		const i = lower.indexOf(q);
		if (i < 0) return escapeHtml(name);
		return (
			escapeHtml(name.slice(0, i)) +
			`<span class="highlight">${escapeHtml(name.slice(i, i + q.length))}</span>` +
			escapeHtml(name.slice(i + q.length))
		);
	}

	function escapeHtml(s) {
		return s
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
	}

	// ---------------- Palette rendering ----------------
	const input = document.getElementById("paletteInput");
	const listEl = document.getElementById("paletteList");
	const modeBadge = document.getElementById("modeBadge");
	const caret = document.getElementById("caret");
	const preview = document.getElementById("preview");
	const branchCountEl = document.getElementById("branchCount");
	const _pathCrumb = document.getElementById("pathCrumb");
	const confirmOverlay = document.getElementById("confirmOverlay");
	const confirmTitle = document.getElementById("confirmTitle");
	const confirmDesc = document.getElementById("confirmDesc");
	const hintLine = document.getElementById("hintLine");
	const toastSlot = document.getElementById("toastSlot");

	branchCountEl.textContent = String(branches.length);

	const state = {
		query: "",
		selectedIndex: 1, // start on main
	};

	function branchIcon() {
		return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="4" cy="4" r="2"/><circle cx="12" cy="12" r="2"/><path d="M4 6v4a2 2 0 0 0 2 2h4"/></svg>`;
	}
	function cloudIcon() {
		return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 2v3m0 6v3M2 8h3m6 0h3"/><circle cx="8" cy="8" r="2"/></svg>`;
	}
	function plusIcon() {
		return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M8 3v10M3 8h10"/></svg>`;
	}

	function computeAheadBehind(b) {
		const parts = [];
		if (b.ahead) parts.push(`<span class="ahead">↑${b.ahead}</span>`);
		if (b.behind) parts.push(`<span class="behind">↓${b.behind}</span>`);
		if (!parts.length)
			parts.push(
				`<span style="opacity:0.6">${escapeHtml(b.when ?? "")}</span>`,
			);
		return parts.join(" ");
	}

	function render() {
		const parsed = parseQuery(state.query);
		modeBadge.textContent = parsed.mode;
		modeBadge.style.color =
			parsed.mode === "new"
				? "var(--success)"
				: parsed.mode === "cmd"
					? "var(--warning)"
					: "var(--muted-foreground)";
		caret.style.color =
			parsed.mode === "new"
				? "var(--success)"
				: parsed.mode === "cmd"
					? "var(--warning)"
					: "var(--primary)";

		// Update hint based on mode
		if (parsed.mode === "new") {
			hintLine.innerHTML = `按 <span class="kbd" style="font-family:var(--font-mono)">↵</span> 从 HEAD 新建 <code style="font-family:var(--font-mono);color:var(--success)">${escapeHtml(parsed.value || "<name>")}</code> 到新 workspace`;
		} else if (parsed.mode === "cmd") {
			hintLine.innerHTML = `命令模式 · 输入 <code style="font-family:var(--font-mono);color:var(--warning)">merge --squash</code> / <code style="font-family:var(--font-mono);color:var(--warning)">drop --remote</code> ...`;
		} else {
			hintLine.innerHTML = `↑↓ 选择 · ↵ 打开到新 workspace · ⌘↵ 合并 · ⌘⇧B 设为 base · ⌘⌫ 删除`;
		}

		// Build result rows
		listEl.innerHTML = "";

		if (parsed.mode === "new" && parsed.value) {
			const row = document.createElement("div");
			row.className = "c-item is-new";
			row.innerHTML = `
				<span class="c-icon">${plusIcon()}</span>
				<span class="c-name">
					<span class="name">${escapeHtml(parsed.value)}</span>
					<span class="tag" style="background: color-mix(in oklch, var(--success) 20%, transparent); color: var(--success)">new</span>
				</span>
				<span class="c-badge">from HEAD</span>
			`;
			listEl.appendChild(row);
			state.selectedIndex = 0;
			renderPreviewNew(parsed.value);
			return;
		}

		const results = filterBranches(parsed.value);

		if (results.length === 0) {
			listEl.innerHTML = `
				<div class="c-empty">
					<div class="big">/dev/null</div>
					<div>no refs match "${escapeHtml(parsed.value)}"</div>
					<div class="hint">try <code>:new ${escapeHtml(parsed.value || "name")}</code> to create it</div>
				</div>
			`;
			preview.innerHTML = "";
			return;
		}

		if (state.selectedIndex >= results.length)
			state.selectedIndex = results.length - 1;
		if (state.selectedIndex < 0) state.selectedIndex = 0;

		results.forEach((b, idx) => {
			const row = document.createElement("div");
			row.className = `c-item${idx === state.selectedIndex ? " is-selected" : ""}`;
			row.dataset.index = String(idx);
			const isRemote = b.kind === "remote";
			const tag = b.isCurrent
				? `<span class="tag is-current">current</span>`
				: b.isBase
					? `<span class="tag is-base">base</span>`
					: isRemote
						? `<span class="tag">origin</span>`
						: `<span class="tag">local</span>`;
			const defaultTag =
				b.isDefault && !b.isCurrent && !b.isBase
					? `<span class="tag">default</span>`
					: "";
			row.innerHTML = `
				<span class="c-icon">${isRemote ? cloudIcon() : branchIcon()}</span>
				<span class="c-name">
					<span class="name" ${isRemote ? 'style="opacity:0.85"' : ""}>${highlight(b.name, parsed.value)}</span>
					${tag}${defaultTag}
					${b.otherWorkspace ? `<span class="tag" style="background: color-mix(in oklch, var(--warning) 20%, transparent); color: var(--warning)">in ws</span>` : ""}
				</span>
				<span class="c-badge">${computeAheadBehind(b)}</span>
			`;
			row.addEventListener("click", () => {
				state.selectedIndex = idx;
				render();
			});
			row.addEventListener("dblclick", () => {
				openBranch(b);
			});
			listEl.appendChild(row);
		});

		renderPreview(results[state.selectedIndex]);
	}

	function renderPreview(b) {
		if (!b) {
			preview.innerHTML = "";
			return;
		}
		const trackedLine = b.tracked
			? `<div class="row"><span class="key">tracked</span><span class="val">origin/${escapeHtml(b.name)} · ${b.behind ? "diverged" : b.ahead ? "ahead" : "up-to-date"}</span></div>`
			: `<div class="row"><span class="key">tracked</span><span class="val" style="opacity:0.65">no upstream</span></div>`;
		preview.innerHTML = `
			<div class="head">preview · ${escapeHtml(b.name)}</div>
			<div class="row"><span class="key">tip</span><span class="val">${escapeHtml(b.tip ?? "")}</span></div>
			<div class="row"><span class="key">author</span><span class="val">${escapeHtml(b.author ?? "")} · ${escapeHtml(b.when ?? "")}</span></div>
			${trackedLine}
			${b.ahead || b.behind ? `<div class="row"><span class="key">divergence</span><span class="val"><span class="ahead" style="color:var(--success)">↑${b.ahead || 0}</span> <span class="behind" style="color:var(--warning)">↓${b.behind || 0}</span></span></div>` : ""}
			${b.otherWorkspace ? `<div class="row"><span class="key">status</span><span class="val" style="color:var(--warning)">已在另一个 workspace 打开</span></div>` : ""}
			<div class="row" style="margin-top:4px"><span class="key">recent</span><span class="val">${b.commits.length} commits</span></div>
			<div class="commits">${b.commits.map((c) => escapeHtml(c)).join("<br />")}</div>
		`;
	}

	function renderPreviewNew(name) {
		const current = branches.find((b) => b.isCurrent);
		preview.innerHTML = `
			<div class="head">will create · ${escapeHtml(name)}</div>
			<div class="row"><span class="key">base</span><span class="val">HEAD (${escapeHtml(current?.name ?? "current")})</span></div>
			<div class="row"><span class="key">tip</span><span class="val">${escapeHtml(current?.tip ?? "")}</span></div>
			<div class="row"><span class="key">workspace</span><span class="val" style="color:var(--success)">will open new workspace</span></div>
		`;
	}

	function currentSelectedBranch() {
		const parsed = parseQuery(state.query);
		if (parsed.mode === "new") return null;
		const results = filterBranches(parsed.value);
		return results[state.selectedIndex] ?? null;
	}

	// ---------------- Actions ----------------
	function toast(msg, kind = "success") {
		const el = document.createElement("div");
		el.className = `toast is-${kind}`;
		el.innerHTML = `
			<span class="icon">${kind === "danger" ? '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="m4 4 8 8m0-8-8 8"/></svg>' : '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 8 3 3 7-7"/></svg>'}</span>
			<span>${escapeHtml(msg)}</span>
		`;
		toastSlot.appendChild(el);
		setTimeout(() => el.remove(), 3500);
	}

	function openBranch(b) {
		if (!b) return;
		if (b.isCurrent) {
			toast("已经在这个分支上了", "danger");
			return;
		}
		toast(`打开 ${b.name} 到新 workspace`);
	}
	function mergeBranch(b) {
		if (!b || b.isCurrent) return;
		toast(`已把 ${b.name} 合并到当前分支`);
	}
	function setBase(b) {
		if (!b) return;
		toast(`已把 ${b.name} 设为 base`);
	}
	function requestDelete(b) {
		if (!b || b.isCurrent) return;
		confirmTitle.innerHTML = `删除本地分支 <code style="font-family: var(--font-mono); font-size: 11.5px">${escapeHtml(b.name)}</code>？`;
		confirmDesc.innerHTML = `使用 <code>git branch -D</code>，未合并的改动会丢失。此操作无法撤销。`;
		confirmOverlay.classList.remove("hidden");
		confirmOverlay.dataset.branch = b.name;
	}
	function createBranch(name) {
		if (!name) return;
		toast(`已从 HEAD 新建 ${name}，并打开到新 workspace`);
		input.value = "";
		state.query = "";
		state.selectedIndex = 0;
		render();
	}

	document.getElementById("confirmCancel").addEventListener("click", () => {
		confirmOverlay.classList.add("hidden");
	});
	document.getElementById("confirmOk").addEventListener("click", () => {
		const name = confirmOverlay.dataset.branch;
		confirmOverlay.classList.add("hidden");
		if (name) toast(`已删除本地分支 ${name}`, "danger");
	});

	// ---------------- Input events ----------------
	input.addEventListener("input", (e) => {
		state.query = e.target.value;
		state.selectedIndex = 0;
		render();
	});

	function move(delta) {
		const parsed = parseQuery(state.query);
		if (parsed.mode === "new") return;
		const total = filterBranches(parsed.value).length;
		if (!total) return;
		state.selectedIndex = (state.selectedIndex + delta + total) % total;
		render();
	}

	input.addEventListener("keydown", (e) => {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			move(1);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			move(-1);
		} else if (e.key === "Escape") {
			if (!confirmOverlay.classList.contains("hidden")) {
				confirmOverlay.classList.add("hidden");
			} else {
				input.value = "";
				state.query = "";
				render();
			}
		} else if (e.key === "Enter") {
			e.preventDefault();
			const parsed = parseQuery(state.query);
			if (parsed.mode === "new") {
				createBranch(parsed.value);
				return;
			}
			const b = currentSelectedBranch();
			if (!b) return;
			if (e.metaKey || e.ctrlKey) {
				if (e.shiftKey) setBase(b);
				else mergeBranch(b);
			} else {
				openBranch(b);
			}
		} else if (e.key === "Backspace" && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			const b = currentSelectedBranch();
			if (b) requestDelete(b);
		} else if (
			e.key.toLowerCase() === "b" &&
			e.shiftKey &&
			(e.metaKey || e.ctrlKey)
		) {
			e.preventDefault();
			const b = currentSelectedBranch();
			if (b) setBase(b);
		}
	});

	document.addEventListener("keydown", (e) => {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") {
			e.preventDefault();
			input.focus();
			input.select();
		}
	});

	// initial render
	render();

	// ---------------- Static state gallery ----------------
	// Each tile is a self-contained mini palette showing a specific state
	const stateGrid = document.getElementById("stateGrid");

	const stateTiles = [
		{
			num: "01",
			name: "空闲 · 无输入",
			caption:
				"默认打开状态：光标闪烁在 prompt，高亮 main，preview 展示 tracking + 3 个最近 commit。",
			query: "",
			selectedIndex: 1,
			mode: "search",
		},
		{
			num: "02",
			name: "模糊过滤 · 高亮命中",
			caption: "输入 “branch” 过滤，命中片段品红高亮；preview 跟随移动。",
			query: "branch",
			selectedIndex: 0,
			mode: "search",
		},
		{
			num: "03",
			name: "新建分支 · 从 HEAD",
			caption:
				"输入 :new fix/xyz 触发新建模式，出现绿色 + 前缀行，preview 展示 “will create”。",
			query: ":new fix/pagination",
			selectedIndex: 0,
			mode: "new",
		},
		{
			num: "04",
			name: "空态 · 无匹配",
			caption: "过滤字符串没有任何分支命中，直接给出创建建议。",
			query: "zzz",
			selectedIndex: 0,
			mode: "search",
			forceEmpty: true,
		},
		{
			num: "05",
			name: "已在另一个 workspace",
			caption:
				"选中的分支正在另一个 workspace 里被打开；徽标 + preview 都会提示。",
			query: "menu",
			selectedIndex: 0,
			mode: "search",
		},
		{
			num: "06",
			name: "删除确认",
			caption: "触发 ⌘⌫ 后的模态，用 destructive 变体收敛注意力。",
			query: "menu",
			selectedIndex: 0,
			mode: "search",
			showConfirm: true,
		},
	];

	function buildMiniShell(tile) {
		const parsed = {
			mode: tile.mode,
			value: tile.mode === "new" ? tile.query.slice(5) : tile.query,
			raw: tile.query,
		};
		const shell = document.createElement("div");
		shell.className = "c-shell";
		const modeColor =
			parsed.mode === "new"
				? "var(--success)"
				: parsed.mode === "cmd"
					? "var(--warning)"
					: "var(--muted-foreground)";
		const caretColor =
			parsed.mode === "new"
				? "var(--success)"
				: parsed.mode === "cmd"
					? "var(--warning)"
					: "var(--primary)";

		let hintHTML = "";
		if (parsed.mode === "new") {
			hintHTML = `按 <span class="kbd" style="font-family:var(--font-mono)">↵</span> 从 HEAD 新建 <code style="font-family:var(--font-mono);color:var(--success)">${escapeHtml(parsed.value)}</code> 到新 workspace`;
		} else {
			hintHTML = "↑↓ 选择 · ↵ 打开到新 workspace · ⌘↵ 合并";
		}

		// Body
		let listHTML = "";
		if (parsed.mode === "new") {
			listHTML = `
				<div class="c-item is-new is-selected" style="background: color-mix(in oklch, var(--success) 18%, transparent)">
					<span class="c-icon">${plusIcon()}</span>
					<span class="c-name">
						<span class="name">${escapeHtml(parsed.value)}</span>
						<span class="tag" style="background: color-mix(in oklch, var(--success) 22%, transparent); color: var(--success)">new</span>
					</span>
					<span class="c-badge">from HEAD</span>
				</div>`;
		} else if (tile.forceEmpty) {
			listHTML = `
				<div class="c-empty">
					<div class="big">/dev/null</div>
					<div>no refs match "${escapeHtml(parsed.value)}"</div>
					<div class="hint">try <code>:new ${escapeHtml(parsed.value)}</code> to create it</div>
				</div>`;
		} else {
			const rows = filterBranches(parsed.value).slice(0, 5);
			listHTML = rows
				.map((b, idx) => {
					const isRemote = b.kind === "remote";
					const tag = b.isCurrent
						? `<span class="tag is-current">current</span>`
						: b.isBase
							? `<span class="tag is-base">base</span>`
							: isRemote
								? `<span class="tag">origin</span>`
								: `<span class="tag">local</span>`;
					const otherTag = b.otherWorkspace
						? `<span class="tag" style="background: color-mix(in oklch, var(--warning) 20%, transparent); color: var(--warning)">in ws</span>`
						: "";
					return `
					<div class="c-item ${idx === tile.selectedIndex ? "is-selected" : ""}">
						<span class="c-icon">${isRemote ? cloudIcon() : branchIcon()}</span>
						<span class="c-name">
							<span class="name">${highlight(b.name, parsed.value)}</span>
							${tag}${otherTag}
						</span>
						<span class="c-badge">${computeAheadBehind(b)}</span>
					</div>`;
				})
				.join("");
		}

		let previewHTML = "";
		if (parsed.mode === "new") {
			const cur = branches.find((b) => b.isCurrent);
			previewHTML = `
				<div class="c-preview">
					<div class="head">will create · ${escapeHtml(parsed.value)}</div>
					<div class="row"><span class="key">base</span><span class="val">HEAD (${escapeHtml(cur?.name ?? "")})</span></div>
					<div class="row"><span class="key">tip</span><span class="val">${escapeHtml(cur?.tip ?? "")}</span></div>
					<div class="row"><span class="key">workspace</span><span class="val" style="color:var(--success)">will open new workspace</span></div>
				</div>`;
		} else if (!tile.forceEmpty) {
			const rows = filterBranches(parsed.value);
			const b = rows[tile.selectedIndex];
			if (b) {
				const trackedLine = b.tracked
					? `<div class="row"><span class="key">tracked</span><span class="val">origin/${escapeHtml(b.name)}</span></div>`
					: `<div class="row"><span class="key">tracked</span><span class="val" style="opacity:0.65">no upstream</span></div>`;
				previewHTML = `
					<div class="c-preview">
						<div class="head">preview · ${escapeHtml(b.name)}</div>
						<div class="row"><span class="key">tip</span><span class="val">${escapeHtml(b.tip ?? "")}</span></div>
						${trackedLine}
						${b.otherWorkspace ? `<div class="row"><span class="key">status</span><span class="val" style="color:var(--warning)">已在另一个 workspace 打开</span></div>` : ""}
						<div class="commits">${b.commits
							.slice(0, 2)
							.map((c) => escapeHtml(c))
							.join("<br/>")}</div>
					</div>`;
			}
		}

		const confirmHTML = tile.showConfirm
			? `
				<div class="dialog-backdrop">
					<div class="dialog">
						<div class="dialog-body">
							<div class="dialog-title">
								<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7">
									<path d="M8 2 1 14h14z"/><path d="M8 6v4M8 12v.5"/>
								</svg>
								<span>删除本地分支 <code style="font-family: var(--font-mono); font-size: 11.5px">feat/branch-menu</code>？</span>
							</div>
							<p class="dialog-desc">使用 <code>git branch -D</code>，未合并的改动会丢失。此操作无法撤销。</p>
						</div>
						<div class="dialog-actions">
							<button class="btn btn-ghost">取消</button>
							<button class="btn btn-danger">删除</button>
						</div>
					</div>
				</div>`
			: "";

		shell.innerHTML = `
			<div class="c-titlebar">
				<div class="lights"><span></span><span></span><span></span></div>
				<span style="margin-left:6px">branch › feat/acp-agent-control-plane</span>
			</div>
			<div class="c-prompt">
				<span class="caret" style="color:${caretColor}">${parsed.mode === "new" ? "+" : "›"}</span>
				<input value="${escapeHtml(tile.query)}" readonly />
				<span style="font-size:10px; font-family: var(--font-mono); color:${modeColor}">${parsed.mode}</span>
			</div>
			<div class="c-hint">${hintHTML}</div>
			<div class="c-scroll">${listHTML}</div>
			${previewHTML}
			<div class="c-footer">
				<span><span class="kbd">↵</span> open</span>
				<span><span class="kbd">⌘↵</span> merge</span>
				<span><span class="kbd">⌘⌫</span> del</span>
				<span style="margin-left:auto"><span class="kbd">?</span> help</span>
			</div>
			${confirmHTML}
		`;
		return shell;
	}

	stateTiles.forEach((tile) => {
		const tileEl = document.createElement("div");
		tileEl.className = "state-tile";
		tileEl.innerHTML = `
			<div class="state-head">
				<h3 class="state-name"><span class="num">${tile.num}</span>${escapeHtml(tile.name)}</h3>
			</div>
			<div class="state-caption">${escapeHtml(tile.caption)}</div>
			<div class="state-frame"></div>
		`;
		tileEl.querySelector(".state-frame").appendChild(buildMiniShell(tile));
		stateGrid.appendChild(tileEl);
	});
})();
