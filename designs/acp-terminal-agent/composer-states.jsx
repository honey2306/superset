// composer-states.jsx — design exploration for three composer interaction states:
//   1. "/" slash command palette
//   2. "@" file mention palette
//   3. Image paste preview
const { useState, useRef, useEffect, useCallback } = React;

// ---- Mock data -------------------------------------------------------
const SLASH_COMMANDS = [
	{ name: "model", args: "<name>", desc: "Switch the active model" },
	{ name: "mode", args: "<default|plan|...>", desc: "Change session mode" },
	{ name: "help", args: "", desc: "Show all available commands" },
	{ name: "cost", args: "", desc: "Show token & cost for this turn" },
	{ name: "compact", args: "", desc: "Summarize context & continue" },
	{ name: "init", args: "", desc: "Create CLAUDE.md for this project" },
	{ name: "review", args: "", desc: "Review recent changes" },
];

const FILES = [
	{
		name: "AcpSessionPane.tsx",
		path: "AcpSessionPane/",
		ext: "tsx",
		size: "6.2 KB",
	},
	{
		name: "AcpStatusBar.tsx",
		path: "AcpSessionPane/components/",
		ext: "tsx",
		size: "3.1 KB",
	},
	{
		name: "AcpComposer.tsx",
		path: "AcpSessionPane/components/",
		ext: "tsx",
		size: "2.8 KB",
	},
	{
		name: "AcpPaneToolbar.tsx",
		path: "AcpSessionPane/components/",
		ext: "tsx",
		size: "1.4 KB",
	},
	{ name: "acp-pane.css", path: "AcpSessionPane/", ext: "css", size: "28 KB" },
	{
		name: "AcpTimeline.tsx",
		path: "AcpSessionPane/components/",
		ext: "tsx",
		size: "4.0 KB",
	},
	{
		name: "confirmCloseAcpSession.ts",
		path: "V1PanesWorkspace/",
		ext: "ts",
		size: "1.1 KB",
	},
];

const EXT_COLORS = {
	tsx: "#8be9fd",
	ts: "#8be9fd",
	js: "#f1fa8c",
	jsx: "#f1fa8c",
	css: "#bd93f9",
	md: "#50fa7b",
	json: "#ffb86c",
	sh: "#ff79c6",
	py: "#50fa7b",
};

// ---- Global shell styles injected once --------------------------------
if (!document.getElementById("cs-shell")) {
	const s = document.createElement("style");
	s.id = "cs-shell";
	s.textContent = `
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; background: #191a21; font-family: "JetBrains Mono", ui-monospace, monospace; }

  /* ── Page shell ── */
  .cs-page { min-height: 100vh; display: flex; flex-direction: column; }
  .cs-topbar {
    padding: 12px 32px; border-bottom: 1px solid rgba(98,114,164,0.18);
    background: #21222c;
    display: flex; align-items: center; gap: 12px;
    font-size: 13px; color: #8be9fd; letter-spacing: 0.02em;
  }
  .cs-topbar b { color: #ff79c6; font-weight: 500; }
  .cs-topbar .dim { color: #6272a4; }
  .cs-grid {
    flex: 1; display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 32px; padding: 32px;
    align-items: start;
  }
  .cs-frame { display: flex; flex-direction: column; gap: 12px; }
  .cs-frame__label {
    font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
    color: #6272a4; font-family: inherit;
    display: flex; align-items: center; gap: 8px;
  }
  .cs-frame__label::before { content: ""; width: 20px; height: 1px; background: #44475a; }
  .cs-frame__label b { color: #d0d3e0; font-weight: 500; }
  .cs-pane-shell {
    background: #282a36; border-radius: 8px; overflow: visible;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,121,198,0.08);
    position: relative;
  }

  /* ── Composer mock shell ── */
  .cs-composer {
    background: #282a36;
    border-top: 1px solid rgba(98,114,164,0.2);
    padding: 10px 14px;
    position: relative;
  }
  .cs-composer__box {
    border: 1px solid rgba(98,114,164,0.36);
    border-radius: 6px;
    padding: 8px 12px;
    background: rgba(0,0,0,0.22);
    display: flex; flex-direction: column; gap: 6px;
    transition: border-color 0.15s;
  }
  .cs-composer__box.focused { border-color: rgba(255,121,198,0.5); }
  .cs-composer__row { display: flex; align-items: center; gap: 8px; }
  .cs-composer__glyph { color: #ff79c6; font-weight: 600; flex-shrink: 0; padding-top: 1px; }
  .cs-composer__input {
    flex: 1; background: transparent; border: none; outline: none;
    color: #f8f8f2; font: inherit; font-size: 13px; padding: 0;
    caret-color: #ff79c6;
  }
  .cs-composer__input::placeholder { color: #6272a4; }
  .cs-composer__toolbar {
    display: flex; align-items: center; gap: 12px;
    font-size: 10.5px; color: #6272a4;
  }
  .cs-composer__toolbar .slash { color: #ff79c6; }
  .cs-composer__toolbar .at { color: #8be9fd; }
  .cs-composer__spacer { flex: 1; }
  .cs-send {
    display: inline-flex; align-items: center; gap: 5px;
    background: rgba(255,121,198,0.12); color: #ff79c6;
    border: 1px solid rgba(255,121,198,0.4); border-radius: 4px;
    padding: 3px 10px; cursor: pointer; font: inherit; font-size: 11px;
  }
  .cs-send:hover { background: rgba(255,121,198,0.2); }

  /* ── Image attachments tray ── */
  .cs-attachments {
    display: flex; align-items: center; gap: 6px;
    flex-wrap: wrap;
    padding: 0 0 4px;
  }
  .cs-chip {
    display: inline-flex; align-items: center;
    background: rgba(255,121,198,0.08);
    border: 1px solid rgba(255,121,198,0.28);
    border-radius: 5px;
    padding: 3px;
    position: relative;
    cursor: default;
  }
  .cs-chip__thumb {
    width: 36px; height: 36px; border-radius: 3px;
    object-fit: cover; background: #2d2f3f;
    overflow: hidden; display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .cs-chip__thumb img { width: 100%; height: 100%; object-fit: cover; }
  .cs-chip__thumb .placeholder {
    width: 100%; height: 100%;
    background: linear-gradient(135deg, #44475a, #2d2f3f);
    display: flex; align-items: center; justify-content: center;
    font-size: 18px;
  }
  .cs-chip__info { display: flex; flex-direction: column; gap: 1px; }
  .cs-chip__name { color: #d0d3e0; font-size: 11.5px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cs-chip__size { color: #6272a4; font-size: 10px; }
  .cs-chip__remove {
    position: absolute; top: -6px; right: -6px;
    width: 16px; height: 16px; border-radius: 50%;
    background: #44475a; border: 1.5px solid #282a36;
    color: #f8f8f2; font-size: 9px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; line-height: 1;
    opacity: 0; transition: opacity 0.12s;
  }
  .cs-chip:hover .cs-chip__remove { opacity: 1; }

  /* ── Drop zone overlay ── */
  .cs-drop-zone {
    position: absolute; inset: 0; border-radius: 8px;
    background: rgba(40,42,54,0.92);
    border: 2px dashed rgba(139,233,253,0.6);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 8px; color: #8be9fd;
    font-size: 14px; letter-spacing: 0.03em;
    z-index: 10;
    backdrop-filter: blur(2px);
  }
  .cs-drop-zone__icon { font-size: 32px; opacity: 0.8; }
  .cs-drop-zone__label { color: #8be9fd; font-size: 14px; font-weight: 500; }
  .cs-drop-zone__sub { color: #6272a4; font-size: 11px; }

  /* ── Palette popup ── */
  .cs-palette {
    position: absolute; bottom: calc(100% + 6px); left: 14px; right: 14px;
    background: #21222c;
    border: 1px solid rgba(98,114,164,0.35);
    border-radius: 8px;
    box-shadow: 0 -12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03);
    overflow: hidden;
    z-index: 20;
    animation: cs-palette-in 0.1s ease-out;
  }
  @keyframes cs-palette-in {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .cs-palette--slash { border-color: rgba(255,121,198,0.35); }
  .cs-palette--files { border-color: rgba(255,121,198,0.35); }

  .cs-palette__header {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 12px 6px;
    border-bottom: 1px solid rgba(98,114,164,0.15);
  }
  .cs-palette__header .trigger { font-size: 14px; font-weight: 700; }
  .cs-palette--slash .trigger { color: #ff79c6; }
  .cs-palette--files .trigger { color: #ff79c6; }
  .cs-palette__query {
    color: #f8f8f2; font-size: 13px; font-family: inherit; letter-spacing: 0.01em;
  }
  .cs-palette__hint {
    margin-left: auto; font-size: 10px; color: #44475a; letter-spacing: 0.06em;
  }
  .cs-palette__hint kbd {
    display: inline-flex; align-items: center;
    padding: 0 4px; height: 14px;
    background: #2d2f3f; border: 1px solid rgba(98,114,164,0.3);
    border-radius: 2px; font: inherit; font-size: 10px;
    color: #6272a4;
  }
  .cs-palette__list { max-height: 220px; overflow-y: auto; padding: 4px 0; }
  .cs-palette__list::-webkit-scrollbar { width: 6px; }
  .cs-palette__list::-webkit-scrollbar-thumb { background: rgba(98,114,164,0.3); border-radius: 3px; }

  .cs-palette__item {
    display: flex; align-items: center; gap: 0;
    padding: 7px 12px;
    cursor: pointer;
    position: relative;
    transition: background 0.08s;
  }
  .cs-palette__item::before {
    content: ""; position: absolute; left: 0; top: 4px; bottom: 4px; width: 2px;
    border-radius: 2px; opacity: 0; transition: opacity 0.1s;
  }
  .cs-palette--slash .cs-palette__item.active { background: rgba(255,121,198,0.1); }
  .cs-palette--slash .cs-palette__item.active::before { background: #ff79c6; opacity: 1; }
  .cs-palette--files .cs-palette__item.active { background: rgba(255,121,198,0.1); }
  .cs-palette--files .cs-palette__item.active::before { background: #ff79c6; opacity: 1; }

  .cs-palette__item:hover { background: rgba(255,255,255,0.03); }

  /* Slash item */
  .cs-slash-name {
    color: #ff79c6; font-size: 13px; font-weight: 600; min-width: 80px;
    display: inline-flex; gap: 2px; align-items: baseline;
  }
  .cs-slash-name .slash-char { color: rgba(255,121,198,0.6); font-weight: 400; }
  .cs-slash-args {
    color: #6272a4; font-size: 10.5px; margin-left: 8px;
    padding: 1px 5px; background: rgba(98,114,164,0.12);
    border-radius: 3px; font-style: italic; white-space: nowrap;
  }
  .cs-slash-desc {
    margin-left: auto; color: #6272a4; font-size: 11.5px;
    padding-left: 16px; text-align: right;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    max-width: 200px;
  }
  .cs-palette__item.active .cs-slash-desc { color: #b5b7bc; }

  /* File item */
  .cs-file-icon {
    width: 20px; height: 20px; border-radius: 4px;
    display: flex; align-items: center; justify-content: center;
    font-size: 9px; font-weight: 700; letter-spacing: 0;
    flex-shrink: 0; margin-right: 10px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.06);
  }
  .cs-file-name {
    color: #f8f8f2; font-size: 12.5px; flex-shrink: 0;
  }
  .cs-file-path {
    color: #44475a; font-size: 11px; margin-left: 8px; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap; flex: 1;
  }
  .cs-file-size {
    margin-left: auto; color: #44475a; font-size: 10px;
    padding-left: 16px; flex-shrink: 0;
  }
  .cs-palette__item.active .cs-file-path { color: #6272a4; }
  .cs-palette__item.active .cs-file-name { color: #f8f8f2; }

  /* Match highlight */
  .cs-match { background: rgba(255,121,198,0.25); border-radius: 2px; color: #ff79c6; }
  .cs-palette--files .cs-match { background: rgba(255,121,198,0.2); color: #ff79c6; }

  /* ── Section label ── */
  .cs-desc-block {
    background: #21222c; border: 1px solid rgba(98,114,164,0.18); border-radius: 6px;
    padding: 14px 16px; font-size: 12px; color: #6272a4; line-height: 1.7;
  }
  .cs-desc-block b { color: #d0d3e0; font-weight: 500; }
  .cs-desc-block code {
    background: rgba(255,121,198,0.1); color: #ff79c6;
    padding: 1px 5px; border-radius: 3px; font: inherit; font-size: 11px;
  }
  .cs-desc-block .at { color: #8be9fd; }
  `;
	document.head.appendChild(s);
}

// ---- Helpers ---------------------------------------------------------
function highlight(text, query) {
	if (!query) return text;
	const idx = text.toLowerCase().indexOf(query.toLowerCase());
	if (idx < 0) return text;
	return (
		<>
			{text.slice(0, idx)}
			<span className="cs-match">{text.slice(idx, idx + query.length)}</span>
			{text.slice(idx + query.length)}
		</>
	);
}

// ---- 1. Slash Command Palette ----------------------------------------
function SlashPaletteDemo() {
	const [query, setQuery] = useState("mo");
	const [active, setActive] = useState(0);
	const filtered = SLASH_COMMANDS.filter(
		(c) => !query || c.name.includes(query.toLowerCase()),
	);
	return (
		<div className="cs-pane-shell">
			<div className="cs-composer">
				{/* Palette floats above */}
				<div className="cs-palette cs-palette--slash">
					<div className="cs-palette__header">
						<span className="trigger">/</span>
						<span className="cs-palette__query">{query}</span>
						<div className="cs-palette__hint">
							<kbd>↑↓</kbd> navigate · <kbd>↵</kbd> select · <kbd>esc</kbd>{" "}
							close
						</div>
					</div>
					<div className="cs-palette__list">
						{filtered.length === 0 ? (
							<div
								style={{
									padding: "12px 14px",
									color: "#6272a4",
									fontSize: 11.5,
								}}
							>
								No matching commands
							</div>
						) : (
							filtered.map((cmd, i) => (
								<div
									key={cmd.name}
									className={`cs-palette__item${i === active ? " active" : ""}`}
									onMouseEnter={() => setActive(i)}
									onClick={() => setQuery("")}
								>
									<span className="cs-slash-name">
										<span className="slash-char">/</span>
										{highlight(cmd.name, query)}
									</span>
									{cmd.args && (
										<span className="cs-slash-args">{cmd.args}</span>
									)}
									<span className="cs-slash-desc">{cmd.desc}</span>
								</div>
							))
						)}
					</div>
				</div>

				<div className="cs-composer__box focused">
					<div className="cs-composer__row">
						<span className="cs-composer__glyph">›</span>
						<input
							className="cs-composer__input"
							value={`/${query}`}
							onChange={(e) => setQuery(e.target.value.replace(/^\//, ""))}
							placeholder="Reply to Claude…"
						/>
					</div>
					<div className="cs-composer__toolbar">
						<span>
							<span className="slash">/</span> cmd
						</span>
						<span>
							<span className="at">@</span> file
						</span>
						<span className="cs-composer__spacer" />
						<button className="cs-send">Send ⏎</button>
					</div>
				</div>
			</div>
		</div>
	);
}

// ---- 2. @ File Mention Palette ---------------------------------------
function FilePaletteDemo() {
	const [query, setQuery] = useState("acp");
	const [active, setActive] = useState(0);
	const filtered = FILES.filter(
		(f) =>
			!query ||
			f.name.toLowerCase().includes(query.toLowerCase()) ||
			f.path.toLowerCase().includes(query.toLowerCase()),
	);
	return (
		<div className="cs-pane-shell">
			<div className="cs-composer">
				<div className="cs-palette cs-palette--files">
					<div className="cs-palette__header">
						<span className="trigger">@</span>
						<span className="cs-palette__query" style={{ color: "#ff79c6" }}>
							{query}
						</span>
						<div className="cs-palette__hint">
							<kbd>↑↓</kbd> · <kbd>↵</kbd> · <kbd>esc</kbd>
						</div>
					</div>
					<div className="cs-palette__list">
						{filtered.map((f, i) => (
							<div
								key={f.name}
								className={`cs-palette__item${i === active ? " active" : ""}`}
								onMouseEnter={() => setActive(i)}
							>
								<span
									className="cs-file-icon"
									style={{
										color: EXT_COLORS[f.ext] ?? "#6272a4",
										borderColor: `${EXT_COLORS[f.ext] ?? "#6272a4"}28`,
									}}
								>
									{f.ext.toUpperCase()}
								</span>
								<span className="cs-file-name">{highlight(f.name, query)}</span>
								<span className="cs-file-path">{f.path}</span>
								<span className="cs-file-size">{f.size}</span>
							</div>
						))}
					</div>
				</div>

				<div className="cs-composer__box focused">
					<div className="cs-composer__row">
						<span className="cs-composer__glyph">›</span>
						<input
							className="cs-composer__input"
							value={`@${query}`}
							onChange={(e) => setQuery(e.target.value.replace(/^@/, ""))}
							placeholder="Reply to Claude…"
						/>
					</div>
					<div className="cs-composer__toolbar">
						<span>
							<span className="slash">/</span> cmd
						</span>
						<span>
							<span className="at">@</span> file
						</span>
						<span className="cs-composer__spacer" />
						<button className="cs-send">Send ⏎</button>
					</div>
				</div>
			</div>
		</div>
	);
}

// ---- 3. Image Paste --------------------------------------------------
function ImagePasteDemo() {
	const [chips, setChips] = useState([
		{ id: 1, name: "screenshot-2026-08-05.png", size: "148 KB", emoji: "🖼" },
		{ id: 2, name: "error-log.png", size: "32 KB", emoji: "📸" },
	]);
	const [dropping, setDropping] = useState(false);
	const [draft, setDraft] = useState("这个报错是啥意思?");

	return (
		<div
			className="cs-pane-shell"
			onDragOver={(e) => {
				e.preventDefault();
				setDropping(true);
			}}
			onDragLeave={() => setDropping(false)}
			onDrop={(e) => {
				e.preventDefault();
				setDropping(false);
			}}
		>
			{dropping && (
				<div className="cs-drop-zone">
					<div className="cs-drop-zone__icon">🖼</div>
					<div className="cs-drop-zone__label">Drop to attach image</div>
					<div className="cs-drop-zone__sub">PNG · JPG · GIF · WebP</div>
				</div>
			)}
			<div className="cs-composer">
				<div
					className="cs-composer__box focused"
					style={{ borderColor: "rgba(139,233,253,0.45)" }}
				>
					{chips.length > 0 && (
						<div className="cs-attachments">
							{chips.map((c) => (
								<div key={c.id} className="cs-chip">
									<div className="cs-chip__thumb">
										<div className="placeholder">{c.emoji}</div>
									</div>
									<button
										className="cs-chip__remove"
										onClick={() =>
											setChips((cs) => cs.filter((x) => x.id !== c.id))
										}
										title="Remove"
									>
										×
									</button>
								</div>
							))}
						</div>
					)}
					<div className="cs-composer__row">
						<span className="cs-composer__glyph">›</span>
						<input
							className="cs-composer__input"
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
							placeholder="Reply to Claude…"
						/>
					</div>
					<div className="cs-composer__toolbar">
						<span>
							<span className="slash">/</span> cmd
						</span>
						<span>
							<span className="at">@</span> file
						</span>
						<span
							style={{ color: "#8be9fd", cursor: "pointer" }}
							title="Paste or drag an image"
						>
							📎 image
						</span>
						<span className="cs-composer__spacer" />
						<button className="cs-send">Send ⏎</button>
					</div>
				</div>
			</div>
		</div>
	);
}

// ---- App -------------------------------------------------------------
function App() {
	return (
		<div className="cs-page">
			<div className="cs-topbar">
				<span style={{ color: "#ff79c6", fontSize: 16 }}>◆</span>
				<span>
					Superset · ACP Composer · <b>Interaction States</b>
				</span>
				<span className="dim" style={{ marginLeft: 8 }}>
					Design exploration
				</span>
			</div>
			<div className="cs-grid">
				{/* Slash */}
				<div className="cs-frame">
					<div className="cs-frame__label">
						<b>01 · Slash Command</b>
					</div>
					<SlashPaletteDemo />
					<div className="cs-desc-block">
						Triggered by <code>/</code> · filters by name as you type ·
						<b> pink</b> accent + left-border on selected item · cmd name /{" "}
						<b>args hint</b> / description three-column ·
						<kbd
							style={{
								background: "#2d2f3f",
								padding: "1px 5px",
								borderRadius: 3,
								fontSize: 11,
								color: "#6272a4",
								border: "1px solid #44475a",
							}}
						>
							↑↓↵esc
						</kbd>{" "}
						keyboard
					</div>
				</div>

				{/* Files */}
				<div className="cs-frame">
					<div className="cs-frame__label">
						<b>02 · File Mention</b>
					</div>
					<FilePaletteDemo />
					<div className="cs-desc-block">
						Triggered by <span className="at">@</span> ·<b> cyan</b> accent ·
						ext badge colored by type (TSX=cyan / CSS=purple / TS=cyan /
						MD=green) · filename + path + size · fuzzy match highlights in cyan
					</div>
				</div>

				{/* Image paste */}
				<div className="cs-frame">
					<div className="cs-frame__label">
						<b>03 · Image Paste</b>
					</div>
					<ImagePasteDemo />
					<div className="cs-desc-block">
						Paste (<code>⌘V</code>) or drag &amp; drop · thumbnail chip with{" "}
						<b>name + size</b> · hover to reveal <b>×</b> remove button ·
						drag-over shows dashed <b>drop zone</b> overlay · toolbar{" "}
						<b>📎 image</b> button to open file picker
					</div>
				</div>
			</div>
		</div>
	);
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
