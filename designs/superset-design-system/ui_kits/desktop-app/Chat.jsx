const { Icon, Kbd } = window.SupersetDesignSystem_91a6da;

function UserMsg({ files, text }) {
	return (
		<div className="msg-user">
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 8,
					alignItems: "flex-end",
				}}
			>
				{files?.length ? (
					<div className="files">
						{files.map((f) => (
							<span className="msg-file-chip" key={f}>
								<Icon name="file" className="glyph" size={12} />
								<span className="name">{f}</span>
							</span>
						))}
					</div>
				) : null}
				<div className="bubble">{text}</div>
			</div>
		</div>
	);
}

function ExploringGroup({ rows }) {
	return (
		<div className="exploring-group">
			{rows.map((r, i) => (
				<div className="exploring-row" key={i}>
					<Icon name={r.icon || "file"} className="glyph" size={11} />
					<span className="verb">{r.verb}</span>
					<span>{r.path}</span>
				</div>
			))}
		</div>
	);
}

function BashTool({ command, stdout }) {
	return (
		<div className="tool-block">
			<div className="head">
				<Icon name="terminal" className="glyph" />
				<span className="verb">Bash</span>
				<span className="path">{command}</span>
				<span className="status">exit 0</span>
			</div>
			<div className="body">{stdout}</div>
		</div>
	);
}

function EditTool({ path, addLines, delLines, ctxLines }) {
	return (
		<div className="tool-block">
			<div className="head">
				<Icon name="edit" className="glyph" />
				<span className="verb">Edit</span>
				<span className="path">{path}</span>
				<span className="status">
					+{addLines.length} −{delLines.length}
				</span>
			</div>
			<div className="body" style={{ fontFamily: "var(--font-mono)" }}>
				{ctxLines.map((l, i) => (
					<div key={`c${i}`} style={{ paddingLeft: 12 }}>
						{l}
					</div>
				))}
				{delLines.map((l, i) => (
					<div key={`d${i}`} className="diff-line del">
						{l}
					</div>
				))}
				{addLines.map((l, i) => (
					<div key={`a${i}`} className="diff-line add">
						{l}
					</div>
				))}
			</div>
		</div>
	);
}

function ErrorPart({ text }) {
	return (
		<div className="msg-error">
			<Icon name="alert" className="glyph" />
			<div>{text}</div>
		</div>
	);
}

function AsstMsg({ children, streaming }) {
	return (
		<div className="msg-asst">
			{streaming ? <span className="shimmer">Thinking…</span> : null}
			{children}
		</div>
	);
}

function Composer() {
	return (
		<div className="composer-wrap">
			<div className="composer">
				<div className="attachments">
					<span className="msg-file-chip">
						<Icon name="file" className="glyph" size={12} />
						<span className="name">MainView.tsx</span>
					</span>
				</div>
				<div
					className="prompt"
					contentEditable
					suppressContentEditableWarning
					style={{ minHeight: 40 }}
				>
					修一下 host-service-coordinator 的竞态,别再拉住 pty 了
				</div>
				<div className="composer-row">
					<div className="left">
						<button className="pill-btn">
							<span
								style={{
									width: 6,
									height: 6,
									borderRadius: "999px",
									background: "var(--accent)",
								}}
							/>
							default
						</button>
						<button className="pill-btn">
							<Icon name="spark" className="glyph" />
							Sonnet 5
						</button>
						<button className="pill-btn">
							<Icon name="cloud" className="glyph" />
							thinking
						</button>
					</div>
					<div className="right">
						<button
							className="pill-btn"
							style={{ borderRadius: "999px", padding: 5, gap: 0 }}
						>
							<Icon name="paperclip" className="glyph" size={12} />
						</button>
						<button className="send-btn" aria-label="Send">
							<Icon name="arrowUp" className="glyph" />
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

function ChatKit() {
	return (
		<div className="chat">
			<div className="chat-stream">
				<UserMsg
					files={["host-service-coordinator.ts", "session.ts"]}
					text={
						"host-service-coordinator 会在 shutdown 时死锁,能定位吗?复现步骤:开两个 pty,同时按 ⌘W。"
					}
				/>
				<AsstMsg>
					<div className="prose">
						我先读一下 coordinator 的关停逻辑,再对比 pty session
						的引用计数——如果两边都在等对方 flush,就是典型循环等待。
					</div>
					<ExploringGroup
						rows={[
							{
								icon: "file",
								verb: "Reading",
								path: "host-service-coordinator.ts",
							},
							{ icon: "file", verb: "Reading", path: "session.ts" },
							{ icon: "search", verb: "Grep", path: "coordinator\\.shutdown" },
							{
								icon: "changes",
								verb: "Listing",
								path: "apps/desktop/src/main/terminal-host/",
							},
						]}
					/>
					<div className="prose" style={{ paddingTop: 4 }}>
						找到了:
						<code
							style={{
								fontFamily: "var(--font-mono)",
								background: "var(--hover)",
								padding: "1px 4px",
								borderRadius: 4,
							}}
						>
							coordinator.shutdown()
						</code>{" "}
						里{" "}
						<code
							style={{
								fontFamily: "var(--font-mono)",
								background: "var(--hover)",
								padding: "1px 4px",
								borderRadius: 4,
							}}
						>
							await session.dispose()
						</code>{" "}
						会在 pty 已经在等 coordinator 释放锁时死锁。把 dispose 改成
						fire-and-forget + 5s 兜底 timeout 即可。
					</div>
					<BashTool
						command="bun test apps/desktop/src/main/lib/host-service-coordinator.test.ts"
						stdout={
							"✓ dispatches shutdown to sessions in parallel\n✓ bounds shutdown at 5s if a session hangs\n✓ ignores late resolution after timeout\n\n3 pass · 0 fail"
						}
					/>
					<EditTool
						path="apps/desktop/src/main/lib/host-service-coordinator.ts"
						ctxLines={["  async shutdown() {"]}
						delLines={[
							"    for (const s of this.sessions) {",
							"      await s.dispose();",
							"    }",
						]}
						addLines={[
							"    const doneAll = Promise.all(",
							"      this.sessions.map((s) => s.dispose()),",
							"    );",
							"    await Promise.race([doneAll, sleep(5000)]);",
						]}
					/>
					<div className="prose">
						测试跑通了。要一起把 timeout 值放到{" "}
						<code
							style={{
								fontFamily: "var(--font-mono)",
								background: "var(--hover)",
								padding: "1px 4px",
								borderRadius: 4,
							}}
						>
							settings.ptyShutdownGraceMs
						</code>{" "}
						让用户可调吗?
					</div>
				</AsstMsg>
				<UserMsg text="先不用,合进去看看再说。@config-owner 帮我 review 一下 timeout 值。" />
				<AsstMsg streaming>
					<div className="prose">
						已经开好 PR,正在等 lint pass。5s 是我看 pty-subprocess-ipc 里默认的
						kill grace…
					</div>
					<ErrorPart text="Tool call failed: rate limited by GitHub, will retry in 30s (429)." />
				</AsstMsg>
			</div>
			<Composer />
		</div>
	);
}

const chatRoot = ReactDOM.createRoot(document.getElementById("root"));
chatRoot.render(<ChatKit />);
