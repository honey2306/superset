// v3-pane.jsx — props-driven preview mirroring the real AcpSessionPane.
// Uses the same class names as apps/desktop/.../AcpSessionPane/acp-pane.css
// so the preview stays visually identical to production. Sync stylesheet:
//   ./sync-from-real.sh

const { useState: useStateP, useRef: useRefP, useEffect: useEffectP } = React;

const F01Pane = ({
	state,
	timeline,
	status,
	usage,
	turnElapsed,
	composerValue,
	onComposerChange,
	onSubmit,
	onCancel,
	onRespondPermission,
	showCommandPalette,
	commandFilter,
	onSelectCommand,
	showFilesMenu,
	filesFilter,
	onSelectFile,
	textareaRef,
	onReset,
}) => {
	const scrollRef = useRefP(null);

	useEffectP(() => {
		const el = scrollRef.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
	}, [timeline.length, status]);

	const isBusy = status === "running" || status === "awaiting_permission";
	const isAwaiting = status === "awaiting_permission";

	const filteredCommands = window.SLASH_COMMANDS.filter(
		(c) => !commandFilter || c.name.startsWith(commandFilter),
	);
	const filteredFiles = window.MENTION_FILES.filter(
		(f) =>
			!filesFilter ||
			f.short.toLowerCase().includes(filesFilter.toLowerCase()) ||
			f.path.toLowerCase().includes(filesFilter.toLowerCase()),
	);

	const _permItem = timeline.find(
		(i) => i.kind === "permission" && !i.resolved,
	);

	const STATUS_LABEL = {
		running: "running",
		awaiting_permission: "awaiting",
		offline: "offline",
		dead: "dead",
	};
	const pillLabel = STATUS_LABEL[status];
	const chipTone =
		status === "running"
			? "warn"
			: status === "offline" || status === "dead"
				? "dim"
				: undefined;

	// Streaming status derived from session status (streaming while running).
	const streamStatus =
		status === "running" || status === "awaiting_permission"
			? "streaming"
			: "connected";

	return (
		<div className="preview-frame">
			{/* Simulated pane-system toolbar — real pane gets this from renderToolbar.
			    Title is optional (real sessions start with title=null). */}
			<PreviewToolbar
				title={state.title}
				chipTone={chipTone}
				pillLabel={pillLabel}
				pillStatus={status}
				onReset={onReset}
			/>

			<div className="acp-pane">
				<div className="acp-pane__body" ref={scrollRef}>
					{timeline.length === 0 ? (
						<EmptyState state={state} />
					) : (
						<div className="acp-pane__body-inner">
							{timeline.map((item, i) => {
								if (item.kind === "message")
									return <F01Message key={i} item={item} />;
								if (item.kind === "tool")
									return <F01Tool key={i} item={item} />;
								if (item.kind === "plan")
									return <F01Plan key={i} item={item} />;
								if (item.kind === "permission") {
									if (item.resolved)
										return <F01PermResolved key={i} item={item} />;
									return (
										<F01Perm
											key={i}
											item={item}
											onRespond={onRespondPermission}
										/>
									);
								}
								return null;
							})}
						</div>
					)}
				</div>

				<div className="acp-pane__composer" style={{ position: "relative" }}>
					{showCommandPalette && (
						<Palette
							kind="slash"
							items={filteredCommands.map((c) => ({
								label: c.name,
								desc: c.desc,
								args: c.args,
							}))}
							filter={commandFilter}
							onSelect={(item) => {
								const cmd = filteredCommands.find((c) => c.name === item.label);
								if (cmd) onSelectCommand(cmd);
							}}
						/>
					)}
					{showFilesMenu && (
						<Palette
							kind="files"
							items={filteredFiles.slice(0, 5).map((f) => ({
								label: f.short,
								desc: f.dir,
							}))}
							filter={filesFilter}
							onSelect={(item) => {
								const file = filteredFiles.find((f) => f.short === item.label);
								if (file) onSelectFile(file);
							}}
						/>
					)}
					<div className="acp-pane__composer-box">
						<div className="acp-pane__composer-row">
							<span className="acp-pane__composer-glyph" aria-hidden>
								›
							</span>
							<textarea
								ref={textareaRef}
								className="acp-pane__composer-textarea"
								rows={1}
								placeholder={
									isAwaiting ? "Type a follow-up…" : "Reply to Claude…"
								}
								value={composerValue}
								disabled={isAwaiting}
								onChange={(e) => onComposerChange(e.target.value)}
							/>
						</div>
						<div className="acp-pane__composer-toolbar">
							<span className="acp-pane__composer-toolbar-hint">
								<span className="slash">/</span>
								<span>cmd</span>
							</span>
							<span className="acp-pane__composer-toolbar-hint">
								<span className="at">@</span>
								<span>file</span>
							</span>
							<span className="acp-pane__composer-toolbar-spacer" />
							{isAwaiting && (
								<span style={{ color: "var(--acp-pink)" }}>
									1/2/3/4 → 响应权限
								</span>
							)}
							{isBusy ? (
								<button
									type="button"
									className="acp-pane__composer-cancel"
									onClick={onCancel}
								>
									Cancel
								</button>
							) : (
								<button
									type="button"
									className="acp-pane__composer-send"
									disabled={!composerValue.trim()}
									onClick={onSubmit}
								>
									Send ⏎
								</button>
							)}
						</div>
					</div>
				</div>

				<StatusBar
					state={state}
					usage={usage}
					status={status}
					streamStatus={streamStatus}
					turnElapsed={turnElapsed}
				/>
			</div>
		</div>
	);
};

const PreviewToolbar = ({
	title,
	chipTone,
	pillLabel,
	pillStatus,
	onReset,
}) => (
	<div className="acp-pane__toolbar">
		<span className="acp-pane__chip" data-tone={chipTone}>
			<span>Claude Code</span>
		</span>
		<span
			className="acp-pane__toolbar-title"
			title={title ?? "New session"}
			data-empty={title ? undefined : "true"}
		>
			{title ?? "New session"}
		</span>
		<span className="acp-pane__toolbar-spacer" />
		{pillLabel && (
			<span className="acp-pane__header-pill" data-status={pillStatus}>
				{pillStatus === "running" && (
					<span className="acp-blink" aria-hidden>
						●
					</span>
				)}
				<span>{pillLabel}</span>
			</span>
		)}
		<div className="acp-pane__toolbar-actions">
			<button type="button" title="Split (demo)" onClick={onReset}>
				<svg width="12" height="12" viewBox="0 0 16 16" fill="none">
					<rect
						x="1.5"
						y="2.5"
						width="6"
						height="11"
						rx="1"
						stroke="currentColor"
					/>
					<rect
						x="8.5"
						y="2.5"
						width="6"
						height="11"
						rx="1"
						stroke="currentColor"
					/>
				</svg>
			</button>
			<button type="button" title="Close (demo — resets)" onClick={onReset}>
				<svg width="12" height="12" viewBox="0 0 16 16" fill="none">
					<path
						d="M3 3l10 10M13 3L3 13"
						stroke="currentColor"
						strokeWidth="1.4"
						strokeLinecap="round"
					/>
				</svg>
			</button>
		</div>
	</div>
);

const StatusBar = ({ state, usage, status, streamStatus, turnElapsed }) => {
	const mode = state.mode ?? "default";
	const model = state.model ?? "sonnet-4.5";
	const used = usage?.used ?? null;
	const size = usage?.size ?? null;
	const cost = usage?.cost ?? null;
	const showCost = cost != null && cost >= 0.005;
	const ratio = used != null && size ? Math.min(1, used / size) : 0;
	const branch = state.branch ?? "feat/acp-agent-control-plane";
	const dirty = state.dirty ?? 9;
	const tone =
		status === "offline" || status === "dead"
			? "danger"
			: status === "awaiting_permission" ||
					status === "running" ||
					streamStatus === "reconnecting"
				? "warn"
				: "ok";
	const formatTokens = (n) => {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
		return String(n);
	};
	const statusText =
		status === "awaiting_permission" ? "awaiting" : (status ?? "idle");

	// Truncate long branch names: keep the last two path segments only
	// (e.g. `…control-plane` when full branch is
	// `feat/acp/nested/really/long/control-plane`).
	const shortBranch =
		branch.length > 28 ? `…${branch.split("/").slice(-1).join("/")}` : branch;

	return (
		<div className="acp-status-bar">
			<span className="acp-status-bar__cluster">
				<span
					className="acp-status-bar__mode"
					title={`Mode: ${mode} · switch with /mode`}
				>
					{mode.toUpperCase()}
				</span>
				<span
					className="acp-status-bar__seg"
					title={`Model: ${model} · switch with /model`}
				>
					<span className="acp-status-bar__seg-value">{model}</span>
				</span>
				{used != null && (
					<span className="acp-status-bar__seg acp-status-bar__seg--usage">
						<span className="acp-status-bar__seg-value">
							{formatTokens(used)}
						</span>
						{size != null && (
							<>
								<span className="acp-status-bar__bar">
									<span
										className="acp-status-bar__bar-fill"
										style={{ width: `${(ratio * 100).toFixed(0)}%` }}
									/>
								</span>
								<span className="acp-status-bar__seg-muted">
									{formatTokens(size)}
								</span>
							</>
						)}
					</span>
				)}
				{showCost && (
					<span className="acp-status-bar__seg acp-status-bar__seg--cost">
						${cost.toFixed(2)}
					</span>
				)}
			</span>

			<span className="acp-status-bar__spacer" />

			<span className="acp-status-bar__cluster">
				<span
					className="acp-status-bar__seg acp-status-bar__seg--branch"
					title={`Branch: ${branch}${dirty ? ` · ${dirty} uncommitted` : ""}`}
				>
					<svg
						className="acp-status-bar__icon"
						width="12"
						height="12"
						viewBox="0 0 16 16"
						fill="none"
						aria-hidden
					>
						<circle
							cx="4"
							cy="3"
							r="1.5"
							stroke="currentColor"
							strokeWidth="1.3"
						/>
						<circle
							cx="4"
							cy="13"
							r="1.5"
							stroke="currentColor"
							strokeWidth="1.3"
						/>
						<circle
							cx="12"
							cy="6"
							r="1.5"
							stroke="currentColor"
							strokeWidth="1.3"
						/>
						<path d="M4 4.5v7" stroke="currentColor" strokeWidth="1.3" />
						<path
							d="M4 8c0-1.5 1-2 2.5-2H10.5"
							stroke="currentColor"
							strokeWidth="1.3"
							strokeLinecap="round"
						/>
					</svg>
					<span className="acp-status-bar__seg-value">{shortBranch}</span>
					{dirty > 0 && <span className="acp-status-bar__dirty">+{dirty}</span>}
				</span>
				<span
					className="acp-status-bar__seg acp-status-bar__seg--conn"
					data-tone={tone}
					title={`Session: ${status} · stream: ${streamStatus}`}
				>
					<span className="acp-status-bar__conn-dot" aria-hidden />
					<span>{statusText}</span>
				</span>
			</span>
		</div>
	);
};

const Palette = ({ kind, items, filter, onSelect }) => (
	<div className="fu-palette" style={paletteStyle}>
		<div className="fu-palette__hd">
			<span
				style={{
					color: kind === "slash" ? "var(--acp-pink)" : "var(--acp-cyan)",
				}}
			>
				{kind === "slash" ? "/" : "@"}
			</span>
			<span>{kind === "slash" ? "Slash 命令" : "引用文件"}</span>
			<span style={{ marginLeft: "auto", color: "#7a7d84", fontSize: 10 }}>
				{filter && `"${filter}"`}
			</span>
		</div>
		{items.length === 0 ? (
			<div className="fu-palette__empty">没有匹配项</div>
		) : (
			items.map((item, i) => (
				<button
					key={item.label + i}
					type="button"
					className={`fu-palette__item ${i === 0 ? "sel" : ""}`}
					onMouseDown={(e) => {
						e.preventDefault();
						onSelect(item);
					}}
				>
					<span className="cmd">{item.label}</span>
					{item.args && <span className="args">{item.args}</span>}
					<span className="desc">{item.desc}</span>
				</button>
			))
		)}
	</div>
);

const paletteStyle = {
	position: "absolute",
	bottom: "100%",
	left: 14,
	right: 14,
	marginBottom: 4,
	background: "#21222c",
	border: "1px solid rgba(255, 121, 198, 0.28)",
	borderRadius: 6,
	padding: 4,
	boxShadow: "0 -12px 32px rgba(0,0,0,0.5)",
	maxHeight: 260,
	overflowY: "auto",
	zIndex: 30,
};

// Inject the palette CSS once. These classes aren't in the real pane yet —
// this is preview-only until slash/@ menus land in production.
if (
	typeof document !== "undefined" &&
	!document.getElementById("preview-palette-styles")
) {
	const s = document.createElement("style");
	s.id = "preview-palette-styles";
	s.textContent = `
    .preview-frame {
      display: flex; flex-direction: column;
      height: 100%; width: 100%; overflow: hidden;
      background: var(--acp-bg);
      min-height: 0;
    }
    .preview-frame > .acp-pane__toolbar {
      flex: 0 0 32px;
      height: 32px;
    }
    .preview-frame > .acp-pane {
      flex: 1 1 auto;
      min-height: 0;
    }

    .fu-palette__hd {
      padding: 6px 10px 4px;
      display: flex; align-items: center; gap: 6px;
      color: var(--acp-muted); font-size: 10.5px;
      letter-spacing: 0.08em; text-transform: uppercase;
      border-bottom: 1px solid var(--acp-line);
      margin-bottom: 3px;
      font-family: var(--acp-font-mono);
    }
    .fu-palette__item {
      width: 100%; text-align: left; font: inherit; font-family: var(--acp-font-mono);
      background: transparent; border: none; color: var(--acp-fg); cursor: pointer;
      padding: 6px 10px; display: grid; grid-template-columns: auto auto 1fr;
      gap: 10px; align-items: baseline; border-radius: 4px;
    }
    .fu-palette__item:hover, .fu-palette__item.sel { background: rgba(255, 121, 198, 0.1); }
    .fu-palette__item .cmd { color: var(--acp-pink); font-size: 12.5px; font-weight: 500; }
    .fu-palette__item .args { color: var(--acp-muted); font-size: 11px; }
    .fu-palette__item .desc { color: var(--acp-fg-2); font-size: 11.5px; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .fu-palette__empty { padding: 12px; color: var(--acp-muted); font-size: 11.5px; text-align: center; font-family: var(--acp-font-mono); }
    .fu-perm-resolved {
      border: 1px solid var(--acp-line);
      border-radius: 6px;
      background: rgba(255,255,255,0.02);
      padding: 8px 12px;
      color: var(--acp-muted);
      font-size: 12px;
      display: flex; align-items: center; gap: 8px;
      font-family: var(--acp-font-mono);
    }
    .fu-perm-resolved .decision.allow { color: var(--acp-green); }
    .fu-perm-resolved .decision.reject { color: var(--acp-red); }

    .streaming-cursor::after {
      content: "▍"; color: var(--acp-pink); margin-left: 1px;
      animation: acp-blink 0.9s steps(2) infinite;
    }

    /* ---------- Empty state variants ---------- */
    .acp-empty {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
      font-family: var(--acp-font-mono);
      color: var(--acp-fg);
    }

    /* --- Variant AB fusion: orb + welcome + ctx card --- */
    .acp-empty--fusion {
      padding: 32px 20px 28px;
    }
    .acp-empty--fusion .acp-empty__orb {
      position: relative;
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: radial-gradient(circle at 38% 38%,
        rgba(255, 121, 198, 0.55) 0%,
        rgba(255, 121, 198, 0.18) 40%,
        transparent 70%);
      box-shadow:
        inset 0 0 24px rgba(255, 121, 198, 0.3),
        0 0 48px rgba(255, 121, 198, 0.32),
        0 0 96px rgba(189, 147, 249, 0.18);
      animation: acp-orb-breathe 3s ease-in-out infinite;
      margin-bottom: 20px;
    }
    .acp-empty--fusion .acp-empty__orb-inner {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: 12px; height: 12px;
      border-radius: 50%;
      background: var(--acp-pink);
      box-shadow: 0 0 16px var(--acp-pink), 0 0 32px rgba(255, 121, 198, 0.4);
    }
    .acp-empty--fusion .acp-empty__welcome {
      font-size: 16px;
      font-weight: 400;
      margin-bottom: 22px;
      letter-spacing: 0.02em;
    }
    .acp-empty--fusion .acp-empty__welcome-hey {
      color: var(--acp-muted);
    }
    .acp-empty--fusion .acp-empty__welcome-name {
      background: linear-gradient(130deg, var(--acp-pink) 0%, var(--acp-purple) 100%);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      font-weight: 500;
    }
    .acp-empty--fusion .acp-empty__ctx-card {
      max-width: 400px;
      margin-bottom: 18px;
    }
    .acp-empty--fusion .acp-empty__hint {
      color: var(--acp-muted);
      font-size: 11.5px;
    }

    /* --- Variant CD: ASCII banner + boot log fusion --- */
    .acp-empty--cd {
      align-items: flex-start;
      padding: 32px 60px 40px;
      justify-content: center;
    }
    .acp-empty__ascii-art--sm {
      font-size: 9.5px;
      margin-bottom: 28px;
      letter-spacing: 0.02em;
    }
    .acp-empty__boot-log--compact {
      max-width: none;
    }

    /* --- Variant A: Legacy CLI tribute (now merged into AB fusion) --- */
    .acp-empty--cli .acp-empty__sparkle {
      font-size: 36px;
      color: var(--acp-pink);
      text-shadow: 0 0 20px rgba(255, 121, 198, 0.6), 0 0 40px rgba(255, 121, 198, 0.3);
      animation: acp-sparkle-pulse 2.4s ease-in-out infinite;
      margin-bottom: 20px;
    }
    @keyframes acp-sparkle-pulse {
      0%, 100% { opacity: 0.7; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.08); }
    }
    .acp-empty--cli .acp-empty__welcome {
      font-size: 18px;
      font-weight: 500;
      color: var(--acp-fg);
      margin-bottom: 28px;
      letter-spacing: 0.02em;
    }
    .acp-empty--cli .acp-empty__welcome-hey {
      color: var(--acp-muted);
      font-weight: 400;
    }
    .acp-empty--cli .acp-empty__welcome-name {
      color: var(--acp-fg);
      background: linear-gradient(180deg, var(--acp-pink), var(--acp-purple));
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .acp-empty__ctx-card {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 14px 20px;
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid rgba(98, 114, 164, 0.2);
      border-radius: 6px;
      min-width: 320px;
      max-width: 480px;
      margin-bottom: 24px;
    }
    .acp-empty__ctx-row {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 12px;
      line-height: 1.5;
    }
    .acp-empty__ctx-label {
      color: var(--acp-muted);
      font-size: 10px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      min-width: 56px;
    }
    .acp-empty__ctx-value {
      color: var(--acp-fg-2);
    }
    .acp-empty__ctx-value--pink {
      color: var(--acp-pink);
      font-weight: 500;
    }
    .acp-empty__ctx-value--cyan {
      color: var(--acp-cyan);
    }
    .acp-empty__ctx-value--mono {
      color: var(--acp-fg);
      font-size: 11.5px;
    }
    .acp-empty__ctx-sep {
      color: var(--acp-dim);
    }
    .acp-empty__hint {
      color: var(--acp-muted);
      font-size: 11.5px;
    }
    .acp-empty__hint-kbd {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 16px;
      height: 16px;
      padding: 0 5px;
      background: var(--acp-panel);
      border: 1px solid rgba(98, 114, 164, 0.4);
      border-bottom-width: 2px;
      border-radius: 3px;
      color: var(--acp-pink);
      font-family: var(--acp-font-mono);
      font-size: 10.5px;
      margin: 0 2px;
    }

    /* --- Variant B: Orb --- */
    .acp-empty--orb .acp-empty__orb {
      position: relative;
      width: 88px;
      height: 88px;
      border-radius: 50%;
      background: radial-gradient(circle at 40% 40%,
        rgba(255, 121, 198, 0.5) 0%,
        rgba(255, 121, 198, 0.15) 40%,
        transparent 70%);
      box-shadow:
        inset 0 0 30px rgba(255, 121, 198, 0.3),
        0 0 60px rgba(255, 121, 198, 0.35),
        0 0 120px rgba(189, 147, 249, 0.2);
      animation: acp-orb-breathe 3s ease-in-out infinite;
      margin-bottom: 24px;
    }
    .acp-empty--orb .acp-empty__orb-inner {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: 16px; height: 16px;
      border-radius: 50%;
      background: var(--acp-pink);
      box-shadow: 0 0 20px var(--acp-pink);
    }
    @keyframes acp-orb-breathe {
      0%, 100% { transform: scale(1); opacity: 0.85; }
      50% { transform: scale(1.05); opacity: 1; }
    }
    .acp-empty--orb .acp-empty__tagline {
      font-size: 18px;
      color: var(--acp-fg);
      letter-spacing: 0.04em;
      margin-bottom: 12px;
      font-weight: 400;
    }
    .acp-empty--orb .acp-empty__context {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--acp-muted);
      font-size: 11.5px;
    }
    .acp-empty--orb .acp-empty__ctx-item {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }

    /* --- Variant C: Retro boot sequence --- */
    .acp-empty--boot {
      align-items: flex-start;
      justify-content: center;
      padding: 40px 60px;
    }
    .acp-empty__boot-log {
      font-family: var(--acp-font-mono);
      font-size: 13px;
      color: var(--acp-fg-2);
      line-height: 1.8;
      max-width: 520px;
      width: 100%;
    }
    .acp-empty__boot-line {
      display: flex; gap: 10px;
      opacity: 0;
      animation: acp-boot-in 0.4s ease-out forwards;
    }
    @keyframes acp-boot-in {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .acp-empty__boot-check {
      color: var(--acp-green);
      font-weight: 500;
    }
    .acp-empty__boot-line[data-tone="green"] .acp-empty__boot-check { color: var(--acp-green); }
    .acp-empty__boot-line[data-tone="cyan"] .acp-empty__boot-check { color: var(--acp-cyan); }
    .acp-empty__boot-line[data-tone="purple"] .acp-empty__boot-check { color: var(--acp-purple); }
    .acp-empty__boot-line[data-tone="pink"] {
      color: var(--acp-pink);
      font-weight: 500;
      text-shadow: 0 0 12px rgba(255, 121, 198, 0.35);
      margin-top: 4px;
    }
    .acp-empty__boot-line[data-tone="pink"] .acp-empty__boot-check { color: var(--acp-pink); }
    .acp-empty__boot-cursor {
      display: flex; gap: 8px; margin-top: 12px;
      color: var(--acp-pink);
    }
    .acp-empty__boot-blink {
      animation: acp-blink 1s steps(2) infinite;
    }

    /* --- Variant D: ASCII banner --- */
    .acp-empty--ascii {
      justify-content: center;
    }
    .acp-empty__ascii-art {
      margin: 0 0 24px;
      color: var(--acp-pink);
      font-family: var(--acp-font-mono);
      font-size: 11px;
      line-height: 1.15;
      letter-spacing: 0;
      text-shadow: 0 0 12px rgba(255, 121, 198, 0.35);
      user-select: none;
      background: linear-gradient(180deg, var(--acp-pink) 0%, var(--acp-purple) 100%);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .acp-empty__ascii-sub {
      color: var(--acp-muted);
      font-size: 12px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .acp-empty__ascii-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--acp-green);
      box-shadow: 0 0 8px rgba(80, 250, 123, 0.7);
      animation: acp-blink 1.6s ease-in-out infinite;
    }

    /* --- Variant E: Compose starters --- */
    .acp-empty--starters {
      padding: 40px 20px;
    }
    .acp-empty__starters-header {
      display: inline-flex; align-items: center; gap: 10px;
      font-size: 15px;
      color: var(--acp-fg);
      margin-bottom: 20px;
      letter-spacing: 0.02em;
    }
    .acp-empty__starters-sparkle {
      color: var(--acp-pink);
      font-size: 18px;
      text-shadow: 0 0 12px rgba(255, 121, 198, 0.5);
    }
    .acp-empty__starters-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(200px, 240px));
      gap: 8px;
      margin-bottom: 18px;
    }
    .acp-empty__starter {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 10px 12px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(98, 114, 164, 0.2);
      border-radius: 6px;
      cursor: pointer;
      text-align: left;
      transition: border-color 0.12s, background 0.12s;
      font-family: var(--acp-font-mono);
    }
    .acp-empty__starter:hover {
      border-color: rgba(255, 121, 198, 0.4);
      background: rgba(255, 121, 198, 0.04);
    }
    .acp-empty__starter-icon {
      font-size: 16px;
      line-height: 1;
      flex-shrink: 0;
    }
    .acp-empty__starter-body {
      display: flex; flex-direction: column; gap: 2px;
    }
    .acp-empty__starter-title {
      color: var(--acp-fg);
      font-size: 12px;
      font-weight: 500;
    }
    .acp-empty__starter-hint {
      color: var(--acp-muted);
      font-size: 11px;
    }
    .acp-empty__starters-foot {
      display: inline-flex; align-items: center; gap: 8px;
      color: var(--acp-muted);
      font-size: 11px;
      font-family: var(--acp-font-mono);
    }
  `;
	document.head.appendChild(s);
}

// ---- Timeline item renderers (mapped to real class names) -----------------

const EmptyState = ({ state }) => {
	// Variant selectable via ?empty=a | b | c | d | e (default: A).
	const variant =
		new URLSearchParams(window.location.search).get("empty") || "a";

	const branch = state.branch ?? "feat/acp-agent-control-plane";
	const cwd = state.cwd ?? "~/Code/superset";
	const model = state.model ?? "sonnet-4.5";
	const now = new Date();
	const hour = now.getHours();
	const greeting =
		hour < 5
			? "Late night"
			: hour < 12
				? "Good morning"
				: hour < 18
					? "Good afternoon"
					: "Good evening";

	if (variant === "c") return <EmptyC branch={branch} model={model} />;
	if (variant === "cd") return <EmptyCD branch={branch} model={model} />;
	if (variant === "d") return <EmptyD />;
	if (variant === "e")
		return <EmptyE cwd={cwd} branch={branch} model={model} />;

	// Variant AB — A's copy + context, framed by B's orb (default fusion)
	if (variant === "ab" || variant === "a") {
		return (
			<div className="acp-empty acp-empty--fusion">
				<div className="acp-empty__orb" aria-hidden>
					<span className="acp-empty__orb-inner" />
				</div>

				<div className="acp-empty__welcome">
					<span className="acp-empty__welcome-hey">{greeting},</span>{" "}
					<span className="acp-empty__welcome-name">let's ship something.</span>
				</div>

				<div className="acp-empty__ctx-card">
					<div className="acp-empty__ctx-row">
						<span className="acp-empty__ctx-label">agent</span>
						<span className="acp-empty__ctx-value acp-empty__ctx-value--pink">
							Claude Code
						</span>
						<span className="acp-empty__ctx-sep">·</span>
						<span className="acp-empty__ctx-value">{model}</span>
					</div>
					<div className="acp-empty__ctx-row">
						<span className="acp-empty__ctx-label">cwd</span>
						<span className="acp-empty__ctx-value acp-empty__ctx-value--mono">
							{cwd}
						</span>
					</div>
					<div className="acp-empty__ctx-row">
						<span className="acp-empty__ctx-label">branch</span>
						<span className="acp-empty__ctx-value acp-empty__ctx-value--cyan">
							{branch}
						</span>
					</div>
				</div>

				<div className="acp-empty__hint">
					Type a prompt below. <span className="acp-empty__hint-kbd">/</span>{" "}
					for commands · <span className="acp-empty__hint-kbd">@</span> to
					reference a file
				</div>
			</div>
		);
	}

	if (variant === "b") {
		return (
			<div className="acp-empty acp-empty--orb">
				<div className="acp-empty__orb" aria-hidden>
					<span className="acp-empty__orb-inner" />
				</div>
				<div className="acp-empty__tagline">Ready when you are.</div>
				<div className="acp-empty__context">
					<span className="acp-empty__ctx-item">
						<svg
							width="10"
							height="10"
							viewBox="0 0 16 16"
							fill="none"
							aria-hidden
						>
							<path
								d="M2 4a1 1 0 011-1h3l1.5 1.5H13a1 1 0 011 1v6.5a1 1 0 01-1 1H3a1 1 0 01-1-1V4z"
								stroke="currentColor"
								strokeWidth="1.3"
								strokeLinejoin="round"
							/>
						</svg>
						<span>{cwd}</span>
					</span>
					<span className="acp-empty__ctx-sep">·</span>
					<span className="acp-empty__ctx-item">{model}</span>
				</div>
			</div>
		);
	}

	// Variant A — Claude Code CLI tribute (default)
	return (
		<div className="acp-empty acp-empty--cli">
			<div className="acp-empty__sparkle" aria-hidden>
				✻
			</div>
			<div className="acp-empty__welcome">
				<span className="acp-empty__welcome-hey">{greeting},</span>{" "}
				<span className="acp-empty__welcome-name">let's ship something.</span>
			</div>

			<div className="acp-empty__ctx-card">
				<div className="acp-empty__ctx-row">
					<span className="acp-empty__ctx-label">agent</span>
					<span className="acp-empty__ctx-value acp-empty__ctx-value--pink">
						Claude Code
					</span>
					<span className="acp-empty__ctx-sep">·</span>
					<span className="acp-empty__ctx-value">{model}</span>
				</div>
				<div className="acp-empty__ctx-row">
					<span className="acp-empty__ctx-label">cwd</span>
					<span className="acp-empty__ctx-value acp-empty__ctx-value--mono">
						{cwd}
					</span>
				</div>
				<div className="acp-empty__ctx-row">
					<span className="acp-empty__ctx-label">branch</span>
					<span className="acp-empty__ctx-value acp-empty__ctx-value--cyan">
						{branch}
					</span>
				</div>
			</div>

			<div className="acp-empty__hint">
				Type a prompt below. <span className="acp-empty__hint-kbd">/</span> for
				commands · <span className="acp-empty__hint-kbd">@</span> to reference a
				file
			</div>
		</div>
	);
};

// ---- Variant C: Retro boot sequence ---------------------------------------
const BOOT_LINES = [
	{ tone: "green", text: "Agent connected · Claude Code" },
	{ tone: "green", text: "Model loaded · sonnet-4.5" },
	{ tone: "cyan", text: "Workspace mounted" },
	{ tone: "cyan", text: "Git status · main +9 uncommitted" },
	{ tone: "purple", text: "ACP session initialized" },
	{ tone: "purple", text: "Permissions armed · request on every write" },
	{ tone: "pink", text: "Ready." },
];

const EmptyC = ({ branch, model }) => {
	const [shown, setShown] = useStateP(0);
	useEffectP(() => {
		if (shown >= BOOT_LINES.length) return;
		const t = setTimeout(() => setShown((s) => s + 1), 180);
		return () => clearTimeout(t);
	}, [shown]);
	return (
		<div className="acp-empty acp-empty--boot">
			<div className="acp-empty__boot-log">
				{BOOT_LINES.slice(0, shown).map((line, i) => (
					<div key={i} className="acp-empty__boot-line" data-tone={line.tone}>
						<span className="acp-empty__boot-check">[✓]</span>
						<span>
							{line.text
								.replace("sonnet-4.5", model)
								.replace(
									"main +9 uncommitted",
									`${branch.split("/").pop()} +9 uncommitted`,
								)}
						</span>
					</div>
				))}
				{shown >= BOOT_LINES.length && (
					<div className="acp-empty__boot-cursor">
						<span className="acp-empty__boot-prompt">›</span>
						<span className="acp-empty__boot-blink">▍</span>
					</div>
				)}
			</div>
		</div>
	);
};

// ---- Variant CD: ASCII banner + boot log fusion ---------------------------
const EmptyCD = ({ branch, model }) => {
	const [shown, setShown] = useStateP(0);
	useEffectP(() => {
		if (shown >= BOOT_LINES.length) return;
		// Wait 800ms for the banner to "settle", then kick off the log
		const delay = shown === 0 ? 800 : 160;
		const t = setTimeout(() => setShown((s) => s + 1), delay);
		return () => clearTimeout(t);
	}, [shown]);

	return (
		<div className="acp-empty acp-empty--cd">
			<pre className="acp-empty__ascii-art acp-empty__ascii-art--sm">{`  ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗
 ██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝
 ██║     ██║     ███████║██║   ██║██║  ██║█████╗
 ██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝
 ╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗
  ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝`}</pre>

			<div className="acp-empty__boot-log acp-empty__boot-log--compact">
				{BOOT_LINES.slice(0, shown).map((line, i) => (
					<div key={i} className="acp-empty__boot-line" data-tone={line.tone}>
						<span className="acp-empty__boot-check">[✓]</span>
						<span>
							{line.text
								.replace("sonnet-4.5", model)
								.replace(
									"main +9 uncommitted",
									`${branch.split("/").pop()} +9 uncommitted`,
								)}
						</span>
					</div>
				))}
				{shown >= BOOT_LINES.length && (
					<div className="acp-empty__boot-cursor">
						<span className="acp-empty__boot-prompt">›</span>
						<span className="acp-empty__boot-blink">▍</span>
					</div>
				)}
			</div>
		</div>
	);
};

// ---- Variant D: ASCII banner ----------------------------------------------
const EmptyD = () => (
	<div className="acp-empty acp-empty--ascii">
		<pre className="acp-empty__ascii-art">{`  ██████╗ ██╗      █████╗ ██╗   ██╗██████╗ ███████╗
 ██╔════╝ ██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝
 ██║      ██║     ███████║██║   ██║██║  ██║█████╗
 ██║      ██║     ██╔══██║██║   ██║██║  ██║██╔══╝
 ╚██████╗ ███████╗██║  ██║╚██████╔╝██████╔╝███████╗
  ╚═════╝ ╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝`}</pre>
		<div className="acp-empty__ascii-sub">
			<span className="acp-empty__ascii-dot" />
			<span>Session ready · Type a prompt to begin</span>
		</div>
	</div>
);

// ---- Variant E: Compose starters ------------------------------------------
const STARTERS = [
	{
		icon: "🧭",
		title: "Explain this codebase",
		hint: "orient me around the current workspace",
	},
	{
		icon: "🔧",
		title: "Fix a bug",
		hint: "describe symptoms · I'll investigate",
	},
	{
		icon: "🚀",
		title: "Refactor",
		hint: "cleaner names · smaller functions",
	},
	{
		icon: "🧪",
		title: "Write tests",
		hint: "focused unit or integration coverage",
	},
];

const EmptyE = ({ cwd, branch, model }) => (
	<div className="acp-empty acp-empty--starters">
		<div className="acp-empty__starters-header">
			<span className="acp-empty__starters-sparkle" aria-hidden>
				✻
			</span>
			<span>What can I help you build?</span>
		</div>
		<div className="acp-empty__starters-grid">
			{STARTERS.map((s) => (
				<button key={s.title} type="button" className="acp-empty__starter">
					<span className="acp-empty__starter-icon" aria-hidden>
						{s.icon}
					</span>
					<span className="acp-empty__starter-body">
						<span className="acp-empty__starter-title">{s.title}</span>
						<span className="acp-empty__starter-hint">{s.hint}</span>
					</span>
				</button>
			))}
		</div>
		<div className="acp-empty__starters-foot">
			<span>{model}</span>
			<span className="acp-empty__ctx-sep">·</span>
			<span>{cwd}</span>
			<span className="acp-empty__ctx-sep">·</span>
			<span style={{ color: "var(--acp-cyan)" }}>{branch}</span>
		</div>
	</div>
);

const F01Message = ({ item }) => {
	const AVATAR = { user: "Y", agent: "C", thought: "✻" };
	const NAME = { user: "You", agent: "Claude", thought: "Thinking" };
	const role = item.role;
	return (
		<div className="acp-msg" data-role={role}>
			<span className="acp-msg__avatar" aria-hidden>
				{AVATAR[role] ?? "?"}
			</span>
			<div className="acp-msg__body">
				<div className="acp-msg__author">
					<span className="acp-msg__author-name">{NAME[role] ?? role}</span>
				</div>
				<div
					className={`acp-msg__content${item.streaming && !item.streamingDone ? " streaming-cursor" : ""}`}
				>
					{item.displayText != null ? item.displayText : item.text}
				</div>
			</div>
		</div>
	);
};

const F01Tool = ({ item }) => {
	const [collapsed, setCollapsed] = useStateP(
		item.status === "completed" && !item.diff,
	);
	const hasBody = item.body || item.diff || item.footer;
	const meta = item.meta ?? (item.status === "running" ? "running…" : "");
	const metaStatus =
		item.status === "completed"
			? "completed"
			: item.status === "failed" || item.status === "pending_permission"
				? "failed"
				: item.status === "running"
					? "in_progress"
					: undefined;
	return (
		<div className="acp-tool" data-kind={item.toolKind}>
			<button
				type="button"
				className="acp-tool__head"
				data-expanded={!collapsed ? "true" : undefined}
				onClick={() => hasBody && setCollapsed(!collapsed)}
			>
				<span className="acp-tool__caret" aria-hidden>
					{collapsed ? "›" : "▾"}
				</span>
				<span className="acp-tool__kind">{item.toolKind}</span>
				<span className="acp-tool__title">
					{item.titleCode && <code>{item.titleCode}</code>}
					{item.titleCode && " "}
					{item.titleTail || item.title}
				</span>
				<span className="acp-tool__meta" data-status={metaStatus}>
					{item.status === "running" && <span className="acp-blink">●</span>}
					<span>{meta}</span>
				</span>
			</button>
			{!collapsed && item.body && (
				<div className="acp-tool__body">
					<pre>{item.body}</pre>
				</div>
			)}
			{!collapsed && item.diff && (
				<div className="acp-diff">
					<div className="acp-diff__head">
						<span className="acp-diff__head-path">{item.diff.path}</span>
						<span className="acp-diff__head-stat">
							<span className="plus">+{item.diff.stats.plus}</span>{" "}
							<span className="minus">−{item.diff.stats.minus}</span>
						</span>
					</div>
					<div className="acp-diff__body">
						{item.diff.hunk.map((h, i) => (
							<div
								key={i}
								className="acp-diff__line"
								data-kind={
									h.type === "add" ? "add" : h.type === "del" ? "del" : "ctx"
								}
							>
								<span className="acp-diff__line-num">{h.ln}</span>
								<span className="acp-diff__line-mark" aria-hidden>
									{h.type === "add" ? "+" : h.type === "del" ? "−" : " "}
								</span>
								<span className="acp-diff__line-text">{h.txt}</span>
							</div>
						))}
					</div>
				</div>
			)}
			{!collapsed && item.footer && (
				<div className="acp-tool__foot">
					<span className="auto">✓ {item.footer}</span>
				</div>
			)}
		</div>
	);
};

const F01Plan = ({ item }) => {
	const done = item.entries.filter((e) => e.status === "completed").length;
	const inProgress = item.entries.filter(
		(e) => e.status === "in_progress",
	).length;
	return (
		<div className="acp-plan">
			<div className="acp-plan__head">
				<span aria-hidden>◫</span>
				<span>Plan</span>
				<span className="acp-plan__head-progress">
					{done + inProgress} / {item.entries.length}
					{inProgress > 0 && " in progress"}
				</span>
			</div>
			<ol className="acp-plan__items">
				{item.entries.map((e, i) => (
					<li key={i} className="acp-plan__item" data-status={e.status}>
						<span className="acp-plan__box" aria-hidden>
							{e.status === "completed"
								? "✓"
								: e.status === "in_progress"
									? "▸"
									: ""}
						</span>
						<span className="acp-plan__text">{e.content}</span>
						{e.priority && (
							<span className="acp-plan__priority" data-level={e.priority}>
								{e.priority}
							</span>
						)}
					</li>
				))}
			</ol>
		</div>
	);
};

const F01Perm = ({ item, onRespond }) => (
	<div className="acp-perm">
		<div className="acp-perm__head">
			<span className="acp-perm__pulse" aria-hidden />
			<span>Permission required · Edit</span>
		</div>
		<div className="acp-perm__q">{item.question}</div>
		<div className="acp-perm__options">
			{item.options.map((o) => (
				<button
					key={o.optionId}
					type="button"
					className="acp-perm__option"
					onClick={() => onRespond(o)}
				>
					<span className="acp-perm__option-key">{o.keybind}</span>
					<span>{o.name}</span>
					<span className="acp-perm__option-hint">{o.hint}</span>
				</button>
			))}
		</div>
	</div>
);

const F01PermResolved = ({ item }) => (
	<div className="fu-perm-resolved">
		<span aria-hidden>▲</span>
		<span>Permission ·</span>
		<span
			className={
				"decision " +
				(item.resolvedKind?.startsWith("allow") ? "allow" : "reject")
			}
		>
			{item.resolvedName}
		</span>
		<span style={{ marginLeft: "auto", fontSize: 10.5 }}>已响应</span>
	</div>
);

Object.assign(window, { F01Pane });
