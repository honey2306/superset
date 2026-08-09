// markdown-showcase.jsx — Markdown + code block rendering in V03 chat bubble
const { useState } = React;

// ==========================================================
// Global styles
// ==========================================================
if (!document.getElementById("md-shell")) {
	const s = document.createElement("style");
	s.id = "md-shell";
	s.textContent = `
	*, *::before, *::after { box-sizing: border-box; }
	body {
		margin: 0; background: #191a21;
		font-family: "JetBrains Mono", ui-monospace, monospace;
	}
	.md-page { min-height: 100vh; display: flex; flex-direction: column; }
	.md-topbar {
		padding: 12px 32px;
		border-bottom: 1px solid rgba(98,114,164,0.18);
		background: #21222c;
		display: flex; align-items: center; gap: 12px;
		font-size: 13px; color: #d0d3e0;
	}
	.md-topbar b { color: #ff79c6; font-weight: 500; }
	.md-topbar .dim { color: #6272a4; font-size: 11.5px; }

	.md-stage {
		flex: 1;
		max-width: 900px; width: 100%;
		margin: 0 auto; padding: 32px 32px 80px;
		display: flex; flex-direction: column; gap: 40px;
	}
	.md-section {
		display: flex; flex-direction: column; gap: 12px;
	}
	.md-section__head {
		display: flex; align-items: baseline; gap: 12px;
		padding-bottom: 8px;
		border-bottom: 1px solid rgba(98,114,164,0.15);
	}
	.md-section__num {
		font-size: 10.5px; letter-spacing: 0.14em; color: #6272a4;
		font-family: "JetBrains Mono", monospace;
	}
	.md-section__title {
		color: #f8f8f2; font-size: 14px; font-weight: 500;
		font-family: "JetBrains Mono", monospace;
	}
	.md-section__desc {
		color: #6272a4; font-size: 11.5px;
		margin-left: auto;
		font-family: "JetBrains Mono", monospace;
	}

	.md-pane {
		background: #282a36; border-radius: 8px;
		padding: 20px 24px;
		box-shadow: 0 20px 50px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,121,198,0.06);
	}

	/* Agent message bubble (V03) */
	.md-msg { display: flex; flex-direction: column; }
	.md-msg__author {
		font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase;
		color: #ff79c6; margin-bottom: 6px; padding: 0 4px;
		font-family: "JetBrains Mono", monospace;
	}
	.md-msg__content {
		padding: 0 4px;
		color: #f8f8f2;
		font-family: -apple-system, "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif;
		font-size: 13.5px; line-height: 1.75;
	}

	/* ==========================================================
	   Markdown elements
	   ========================================================== */
	.md-msg__content h1,
	.md-msg__content h2,
	.md-msg__content h3,
	.md-msg__content h4 {
		font-weight: 600;
		margin: 20px 0 8px;
		color: #f8f8f2;
		line-height: 1.4;
	}
	.md-msg__content h1:first-child,
	.md-msg__content h2:first-child,
	.md-msg__content h3:first-child {
		margin-top: 0;
	}
	.md-msg__content h1 { font-size: 20px; color: #ff79c6; }
	.md-msg__content h2 { font-size: 17px; color: #ff79c6; }
	.md-msg__content h3 { font-size: 15px; color: #ff79c6; }
	.md-msg__content h4 { font-size: 13.5px; color: #d0d3e0; }

	.md-msg__content p { margin: 8px 0; }
	.md-msg__content p:first-child { margin-top: 0; }
	.md-msg__content p:last-child { margin-bottom: 0; }

	.md-msg__content ul,
	.md-msg__content ol {
		margin: 8px 0; padding-left: 22px;
	}
	.md-msg__content li { margin: 3px 0; padding-left: 4px; }
	.md-msg__content ul li::marker { color: #ff79c6; }
	.md-msg__content ol li::marker { color: #ff79c6; font-weight: 500; }
	.md-msg__content li > ul, .md-msg__content li > ol {
		margin: 3px 0; padding-left: 20px;
	}

	.md-msg__content strong { color: #f8f8f2; font-weight: 600; }
	.md-msg__content em { color: #d0d3e0; font-style: italic; }

	.md-msg__content a {
		color: #8be9fd; text-decoration: underline;
		text-decoration-color: rgba(139,233,253,0.3);
		text-underline-offset: 3px;
	}
	.md-msg__content a:hover {
		text-decoration-color: #8be9fd;
	}

	.md-msg__content blockquote {
		margin: 10px 0; padding: 6px 14px;
		border-left: 3px solid #ff79c6;
		background: rgba(255,121,198,0.05);
		color: #d0d3e0; font-style: italic;
		border-radius: 0 4px 4px 0;
	}
	.md-msg__content blockquote p { margin: 4px 0; }

	.md-msg__content hr {
		border: none;
		height: 1px;
		background: rgba(98,114,164,0.25);
		margin: 16px 0;
	}

	/* Inline code */
	.md-msg__content code:not(pre code) {
		background: rgba(255,121,198,0.1);
		color: #ff79c6;
		padding: 1px 6px;
		border-radius: 3px;
		font-family: "JetBrains Mono", monospace;
		font-size: 12px;
		border: 1px solid rgba(255,121,198,0.18);
	}

	/* Table */
	.md-msg__content table {
		border-collapse: collapse;
		margin: 12px 0;
		width: 100%;
		font-size: 12.5px;
		background: rgba(0,0,0,0.2);
		border-radius: 4px;
		overflow: hidden;
	}
	.md-msg__content th,
	.md-msg__content td {
		text-align: left;
		padding: 7px 12px;
		border-bottom: 1px solid rgba(98,114,164,0.15);
	}
	.md-msg__content th {
		color: #ff79c6;
		font-weight: 600; font-size: 11px;
		letter-spacing: 0.06em; text-transform: uppercase;
		background: rgba(255,121,198,0.05);
	}
	.md-msg__content td { color: #d0d3e0; }
	.md-msg__content tr:last-child td { border-bottom: none; }

	/* Task list */
	.md-msg__content input[type="checkbox"] {
		accent-color: #ff79c6;
		margin-right: 4px;
	}

	/* ==========================================================
	   Code block (fenced)
	   ========================================================== */
	.code-block {
		margin: 12px 0;
		border-radius: 6px;
		overflow: hidden;
		background: #21222c;
		border: 1px solid rgba(98,114,164,0.25);
		font-family: "JetBrains Mono", monospace;
	}
	.code-block__header {
		display: flex; align-items: center; gap: 10px;
		padding: 6px 10px;
		background: rgba(0,0,0,0.25);
		border-bottom: 1px solid rgba(98,114,164,0.18);
		font-size: 10.5px; color: #6272a4;
		letter-spacing: 0.06em;
	}
	.code-block__lang {
		text-transform: lowercase;
		font-weight: 600;
		padding: 1px 6px; border-radius: 2px;
		border: 1px solid;
	}
	.code-block__lang[data-lang="typescript"],
	.code-block__lang[data-lang="tsx"],
	.code-block__lang[data-lang="ts"] {
		color: #8be9fd; border-color: rgba(139,233,253,0.36);
		background: rgba(139,233,253,0.06);
	}
	.code-block__lang[data-lang="javascript"],
	.code-block__lang[data-lang="jsx"],
	.code-block__lang[data-lang="js"] {
		color: #f1fa8c; border-color: rgba(241,250,140,0.36);
		background: rgba(241,250,140,0.06);
	}
	.code-block__lang[data-lang="bash"],
	.code-block__lang[data-lang="sh"],
	.code-block__lang[data-lang="shell"] {
		color: #50fa7b; border-color: rgba(80,250,123,0.36);
		background: rgba(80,250,123,0.06);
	}
	.code-block__lang[data-lang="css"] {
		color: #bd93f9; border-color: rgba(189,147,249,0.36);
		background: rgba(189,147,249,0.06);
	}
	.code-block__lang[data-lang="json"] {
		color: #ffb86c; border-color: rgba(255,184,108,0.36);
		background: rgba(255,184,108,0.06);
	}
	.code-block__lang[data-lang="python"],
	.code-block__lang[data-lang="py"] {
		color: #50fa7b; border-color: rgba(80,250,123,0.36);
		background: rgba(80,250,123,0.06);
	}
	.code-block__meta {
		color: #6272a4; font-size: 10.5px;
	}
	.code-block__actions {
		margin-left: auto;
		display: flex; align-items: center; gap: 2px;
	}
	.code-block__action {
		display: inline-flex; align-items: center; gap: 4px;
		padding: 3px 7px; border-radius: 3px;
		background: transparent; border: none;
		color: #6272a4; cursor: pointer;
		font-family: "JetBrains Mono", monospace;
		font-size: 10.5px;
		transition: color 0.12s, background 0.12s;
	}
	.code-block__action:hover {
		color: #ff79c6;
		background: rgba(255,121,198,0.08);
	}
	.code-block__action.success {
		color: #50fa7b;
	}
	.code-block__body {
		display: grid;
		grid-template-columns: auto 1fr;
		font-size: 12px;
		line-height: 1.65;
	}
	.code-block__gutter {
		user-select: none;
		text-align: right;
		padding: 8px 10px 8px 12px;
		color: rgba(98,114,164,0.55);
		font-size: 11px;
		background: rgba(0,0,0,0.15);
		border-right: 1px solid rgba(98,114,164,0.12);
	}
	.code-block__gutter div { line-height: 1.65; }
	.code-block__code {
		margin: 0; padding: 8px 12px;
		overflow-x: auto;
		color: #f8f8f2;
		white-space: pre;
		font-family: "JetBrains Mono", monospace;
		background: transparent;
	}
	.code-block__code::-webkit-scrollbar { height: 6px; }
	.code-block__code::-webkit-scrollbar-thumb { background: rgba(98,114,164,0.3); border-radius: 3px; }

	.code-block--no-header .code-block__body {
		grid-template-columns: 1fr;
	}

	/* Dracula syntax colors */
	.tok-keyword { color: #ff79c6; }
	.tok-string  { color: #f1fa8c; }
	.tok-number  { color: #bd93f9; }
	.tok-comment { color: #6272a4; font-style: italic; }
	.tok-fn      { color: #50fa7b; }
	.tok-type    { color: #8be9fd; font-style: italic; }
	.tok-const   { color: #bd93f9; font-style: italic; }
	.tok-op      { color: #ff79c6; }
	.tok-punct   { color: #f8f8f2; }
	.tok-prop    { color: #50fa7b; }
	.tok-attr    { color: #50fa7b; font-style: italic; }
	.tok-tag     { color: #ff79c6; }
	.tok-var     { color: #f8f8f2; }
	.tok-flag    { color: #50fa7b; }
	.tok-path    { color: #f1fa8c; }
	`;
	document.head.appendChild(s);
}

// ==========================================================
// Code block component with fake syntax highlighting
// ==========================================================
function CodeBlock({ lang, code, meta, showLineNumbers = true, tokens }) {
	const [copied, setCopied] = useState(false);
	const lines = code.split("\n");
	const copyCode = () => {
		navigator.clipboard?.writeText(code);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};
	return (
		<div className="code-block">
			<div className="code-block__header">
				<span className="code-block__lang" data-lang={lang}>
					{lang}
				</span>
				{meta && <span className="code-block__meta">{meta}</span>}
				<div className="code-block__actions">
					<button
						className={`code-block__action${copied ? " success" : ""}`}
						onClick={copyCode}
					>
						{copied ? "✓ copied" : "copy"}
					</button>
				</div>
			</div>
			<div className="code-block__body">
				{showLineNumbers && (
					<div className="code-block__gutter">
						{lines.map((_, i) => (
							<div key={i}>{i + 1}</div>
						))}
					</div>
				)}
				<pre className="code-block__code">{tokens ?? code}</pre>
			</div>
		</div>
	);
}

// Helper: tokenize a small TS sample with hand-crafted syntax coloring
function tsTokens() {
	const T = (cls, txt) => <span className={cls}>{txt}</span>;
	return (
		<>
			{T("tok-keyword", "async")} {T("tok-keyword", "function")}{" "}
			{T("tok-fn", "cancel")}({T("tok-var", "sessionId")}
			{T("tok-op", ":")} {T("tok-type", "string")}){T("tok-op", ":")}{" "}
			{T("tok-type", "Promise")}
			{T("tok-op", "<")}
			{T("tok-type", "void")}
			{T("tok-op", ">")} {"{"}
			<br />
			{"  "}
			{T("tok-keyword", "if")} ({T("tok-op", "!")}
			{T("tok-var", "session")}) {T("tok-keyword", "return")}
			{T("tok-op", ";")}
			<br />
			{"  "}
			{T("tok-keyword", "await")} {T("tok-var", "session")}.
			{T("tok-fn", "actions")}.{T("tok-fn", "cancel")}();
			<br />
			{"  "}
			{T("tok-var", "console")}.{T("tok-fn", "log")}(
			{T("tok-string", '"Session cancelled"')}
			{T("tok-op", ",")} {T("tok-var", "sessionId")});
			<br />
			{"}"}
			<br />
			<br />
			{T("tok-comment", "// Cancel every pending permission before closing.")}
			<br />
			{T("tok-keyword", "const")} {T("tok-const", "pending")} {T("tok-op", "=")}{" "}
			{T("tok-var", "state")}.{T("tok-prop", "pendingPermissions")};
		</>
	);
}

function bashTokens() {
	const T = (cls, txt) => <span className={cls}>{txt}</span>;
	return (
		<>
			{T("tok-comment", "# Run pane-specific tests with focused path")}
			<br />
			{T("tok-fn", "bun")} {T("tok-var", "test")}{" "}
			{T("tok-path", "src/renderer/screens/main/components/**/AcpSessionPane")}
			<br />
			<br />
			{T("tok-comment", "# Then lint just the touched directory")}
			<br />
			{T("tok-fn", "bunx")} @biomejs/biome@2.4.2 {T("tok-var", "check")}{" "}
			{T("tok-flag", "--write")}{" "}
			{T("tok-path", "src/renderer/.../AcpSessionPane/")}
		</>
	);
}

// ==========================================================
// Message renderer
// ==========================================================
function AgentMsg({ children }) {
	return (
		<div className="md-msg">
			<div className="md-msg__author">Claude</div>
			<div className="md-msg__content">{children}</div>
		</div>
	);
}

// ==========================================================
// Sections
// ==========================================================
function App() {
	return (
		<div className="md-page">
			<div className="md-topbar">
				<span style={{ color: "#ff79c6", fontSize: 16 }}>◆</span>
				<span>
					Superset · <b>Markdown & Code</b> in Chat Bubble
				</span>
				<span className="dim">V03 上下文 · 完整 markdown 元素测试</span>
			</div>
			<div className="md-stage">
				{/* ===================================== */}
				<section className="md-section">
					<header className="md-section__head">
						<span className="md-section__num">01</span>
						<span className="md-section__title">
							Prose · headings / lists / emphasis / links
						</span>
						<span className="md-section__desc">
							正文/标题/列表/加粗斜体/链接
						</span>
					</header>
					<div className="md-pane">
						<AgentMsg>
							<h2>ACP Session Overview</h2>
							<p>
								The ACP session pane bridges Superset's UI to the host-service
								<code>AcpSessionManager</code>. When a user opens a pane, we
								create a<em> stable session id</em> and stream envelopes over
								WebSocket.
							</p>
							<p>Key responsibilities:</p>
							<ul>
								<li>
									<strong>State projection</strong> — fold envelopes into{" "}
									<code>FoldedTimeline</code>
								</li>
								<li>
									<strong>Permission handling</strong> — pending requests block
									the composer
								</li>
								<li>
									<strong>Reconnection</strong> — resumes from{" "}
									<code>lastSeq</code> after network drop
									<ul>
										<li>WebSocket auto-reconnect with backoff</li>
										<li>Optimistic UI keeps the timeline visible</li>
									</ul>
								</li>
							</ul>
							<h3>Where to look next</h3>
							<p>
								Start with{" "}
								<a href="#">packages/session-protocol/src/fold/fold.ts</a> and
								follow the envelope flow. See also the{" "}
								<a href="#">design plan document</a> for context.
							</p>
						</AgentMsg>
					</div>
				</section>

				{/* ===================================== */}
				<section className="md-section">
					<header className="md-section__head">
						<span className="md-section__num">02</span>
						<span className="md-section__title">
							Inline code / blockquote / horizontal rule
						</span>
						<span className="md-section__desc">行内代码 · 引用 · 分隔线</span>
					</header>
					<div className="md-pane">
						<AgentMsg>
							<p>
								Use <code>useAcpSession()</code> to subscribe. It returns{" "}
								<code>state</code>,<code> timeline</code>, and{" "}
								<code>actions</code>. Both <code>state</code> and
								<code> timeline</code> are stable references between polls.
							</p>
							<blockquote>
								<p>
									<strong>Note</strong> — the <code>timeline</code> hook uses
									cache-first rendering. Never hide data just because{" "}
									<code>isReady</code> is false.
								</p>
							</blockquote>
							<hr />
							<p>Ordered next steps:</p>
							<ol>
								<li>
									Verify <code>hostUrl</code> resolves before mounting the pane
								</li>
								<li>
									Wire <code>renderToolbar</code> so pane actions land in the
									header slot
								</li>
								<li>
									Test <em>reconnect</em> by killing the host mid-turn
								</li>
							</ol>
						</AgentMsg>
					</div>
				</section>

				{/* ===================================== */}
				<section className="md-section">
					<header className="md-section__head">
						<span className="md-section__num">03</span>
						<span className="md-section__title">
							TypeScript code block · with line numbers + copy
						</span>
						<span className="md-section__desc">
							带语言标签、meta、行号、复制按钮
						</span>
					</header>
					<div className="md-pane">
						<AgentMsg>
							<p>Here's the cancel handler:</p>
							<CodeBlock
								lang="typescript"
								meta="AcpSessionPane.tsx · L84-L96"
								code={`async function cancel(sessionId: string): Promise<void> {
  if (!session) return;
  await session.actions.cancel();
  console.log("Session cancelled", sessionId);
}

// Cancel every pending permission before closing.
const pending = state.pendingPermissions;`}
								tokens={tsTokens()}
							/>
							<p>
								Notice how <code>await</code> is used before{" "}
								<code>cancel()</code>.
							</p>
						</AgentMsg>
					</div>
				</section>

				{/* ===================================== */}
				<section className="md-section">
					<header className="md-section__head">
						<span className="md-section__num">04</span>
						<span className="md-section__title">
							Bash code block · no line numbers
						</span>
						<span className="md-section__desc">
							short snippet · language 只有 shell
						</span>
					</header>
					<div className="md-pane">
						<AgentMsg>
							<p>Run this to test the pane in isolation:</p>
							<CodeBlock
								lang="bash"
								code={`# Run pane-specific tests with focused path
bun test src/renderer/screens/main/components/**/AcpSessionPane

# Then lint just the touched directory
bunx @biomejs/biome@2.4.2 check --write src/renderer/.../AcpSessionPane/`}
								tokens={bashTokens()}
								showLineNumbers={false}
							/>
						</AgentMsg>
					</div>
				</section>

				{/* ===================================== */}
				<section className="md-section">
					<header className="md-section__head">
						<span className="md-section__num">05</span>
						<span className="md-section__title">Table</span>
						<span className="md-section__desc">
							Markdown 表格 · Dracula pink 表头
						</span>
					</header>
					<div className="md-pane">
						<AgentMsg>
							<p>Session status legend:</p>
							<table>
								<thead>
									<tr>
										<th>Status</th>
										<th>Meaning</th>
										<th>Composer behavior</th>
									</tr>
								</thead>
								<tbody>
									<tr>
										<td>
											<code>idle</code>
										</td>
										<td>Waiting for user input</td>
										<td>Enabled · sends on ⏎</td>
									</tr>
									<tr>
										<td>
											<code>running</code>
										</td>
										<td>Agent is generating a response</td>
										<td>Disabled · Cancel button visible</td>
									</tr>
									<tr>
										<td>
											<code>awaiting_permission</code>
										</td>
										<td>Blocked on user approval</td>
										<td>Disabled until responded</td>
									</tr>
									<tr>
										<td>
											<code>offline</code>
										</td>
										<td>Host disconnected</td>
										<td>Disabled · shows retry banner</td>
									</tr>
								</tbody>
							</table>
						</AgentMsg>
					</div>
				</section>

				{/* ===================================== */}
				<section className="md-section">
					<header className="md-section__head">
						<span className="md-section__num">06</span>
						<span className="md-section__title">
							Long line / horizontal scroll
						</span>
						<span className="md-section__desc">代码超宽时的横向滚动</span>
					</header>
					<div className="md-pane">
						<AgentMsg>
							<CodeBlock
								lang="json"
								code={`{ "event": "session_update", "sessionId": "acp_01HZR3K9Y4M2QPN8SXT9CRWJV1", "payload": { "kind": "tool_call_start", "toolCallId": "call_01J1EQZ2X0FBFV4Y6WNZTM6HGA", "title": "Edit confirmCloseAcpSession.ts", "kind": "edit", "status": "pending_permission" } }`}
								showLineNumbers={false}
							/>
						</AgentMsg>
					</div>
				</section>
			</div>
		</div>
	);
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
