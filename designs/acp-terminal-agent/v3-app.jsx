// v3-app.jsx — interactive App: state machine, streaming timer, keyboard, palettes
const { useState, useRef, useEffect, useCallback, useReducer } = React;

// State shape
//   session:    static session/agent/model/branch info
//   timeline:   array of items (message | tool | plan | permission)
//   status:     idle | running | awaiting_permission
//   usage:      { used, size, cost }
//   turnStart:  ms epoch when the current turn began (for turn timer)
//   composer:   string (composer text)
//   scheduled:  [{ at, event, id }] — pending scripted events being played
//   afterPerm:  which follow-up script (allow / reject) is queued

function reducer(state, action) {
	switch (action.type) {
		case "reset":
			return {
				...action.initial,
				composer: window.INITIAL_USER_PROMPT,
			};
		case "set_composer":
			return { ...state, composer: action.value };
		case "set_status":
			return { ...state, status: action.value };
		case "set_turn_start":
			return { ...state, turnStart: action.value };
		case "add_item":
			return {
				...state,
				timeline: [
					...state.timeline,
					{ ...action.item, _id: state.timeline.length },
				],
			};
		case "update_last_tool": {
			// Update the last tool matching filter (targetKind optional)
			const idx = [...state.timeline]
				.reverse()
				.findIndex(
					(i) =>
						i.kind === "tool" &&
						(!action.targetKind || i.toolKind === action.targetKind),
				);
			if (idx < 0) return state;
			const realIdx = state.timeline.length - 1 - idx;
			const next = [...state.timeline];
			next[realIdx] = { ...next[realIdx], ...action.patch };
			return { ...state, timeline: next };
		}
		case "update_plan_step": {
			const idx = [...state.timeline]
				.reverse()
				.findIndex((i) => i.kind === "plan");
			if (idx < 0) return state;
			const realIdx = state.timeline.length - 1 - idx;
			const plan = state.timeline[realIdx];
			const entries = plan.entries.map((e, i) =>
				i === action.index ? { ...e, status: action.status } : e,
			);
			const next = [...state.timeline];
			next[realIdx] = { ...plan, entries };
			return { ...state, timeline: next };
		}
		case "stream_char": {
			// Append characters to the last streaming message
			const idx = [...state.timeline]
				.reverse()
				.findIndex(
					(i) => i.kind === "message" && i.streaming && !i.streamingDone,
				);
			if (idx < 0) return state;
			const realIdx = state.timeline.length - 1 - idx;
			const m = state.timeline[realIdx];
			const already = m.displayText || "";
			const nextText = m.text.slice(0, already.length + action.step);
			const done = nextText.length >= m.text.length;
			const next = [...state.timeline];
			next[realIdx] = { ...m, displayText: nextText, streamingDone: done };
			return { ...state, timeline: next };
		}
		case "resolve_permission": {
			const idx = [...state.timeline]
				.reverse()
				.findIndex((i) => i.kind === "permission" && !i.resolved);
			if (idx < 0) return state;
			const realIdx = state.timeline.length - 1 - idx;
			const p = state.timeline[realIdx];
			const next = [...state.timeline];
			next[realIdx] = {
				...p,
				resolved: true,
				resolvedKind: action.optionKind,
				resolvedName: action.optionName,
			};
			return { ...state, timeline: next };
		}
		case "update_usage":
			return { ...state, usage: { ...state.usage, ...action.usage } };
		case "set_mode":
			return { ...state, session: { ...state.session, mode: action.value } };
		case "set_model":
			return { ...state, session: { ...state.session, model: action.value } };
		default:
			return state;
	}
}

function useScriptRunner(dispatch) {
	const timeoutsRef = useRef([]);
	const clear = useCallback(() => {
		timeoutsRef.current.forEach((t) => clearTimeout(t));
		timeoutsRef.current = [];
	}, []);
	const run = useCallback(
		(script, offset = 0) => {
			script.forEach((event) => {
				const t = setTimeout(
					() => applyScriptEvent(event, dispatch),
					event.at + offset,
				);
				timeoutsRef.current.push(t);
			});
		},
		[dispatch],
	);
	useEffect(() => clear, [clear]);
	return { run, clear };
}

function applyScriptEvent(event, dispatch) {
	switch (event.type) {
		case "status":
			dispatch({ type: "set_status", value: event.value });
			return;
		case "turn_start":
			dispatch({ type: "set_turn_start", value: Date.now() });
			return;
		case "add":
			dispatch({
				type: "add_item",
				item: {
					...event.item,
					ts: event.item.ts === "now" ? nowHHMMSS() : event.item.ts,
					displayText: event.item.streaming ? "" : undefined,
				},
			});
			return;
		case "update_last_tool":
			dispatch({
				type: "update_last_tool",
				targetKind: event.targetKind,
				patch: event.patch,
			});
			return;
		case "update_plan_step":
			dispatch({
				type: "update_plan_step",
				index: event.index,
				status: event.status,
			});
			return;
		case "resolve_permission":
			dispatch({
				type: "resolve_permission",
				optionKind: `${event.value}_once`,
				optionName: event.value === "allow" ? "Allow once" : "Reject once",
			});
			return;
	}
}

function nowHHMMSS() {
	const d = new Date();
	const pad = (n) => String(n).padStart(2, "0");
	return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function _usageBumpForTokens(chars) {
	return {
		used: Math.round(chars * 3.5),
		cost: Math.round(chars * 3.5) * 0.000003,
	};
}

function App() {
	// Only pre-fill the composer when `?demo=1` is set — otherwise start empty
	// so the empty state (placeholder + slash chips) is what the user sees.
	const preFillDemo =
		new URLSearchParams(window.location.search).get("demo") === "1" ||
		new URLSearchParams(window.location.search).get("autostart") === "1";
	const [state, dispatch] = useReducer(reducer, {
		...window.SCENARIO_INITIAL_STATE,
		composer: preFillDemo ? window.INITIAL_USER_PROMPT : "",
	});
	const { run, clear } = useScriptRunner(dispatch);
	const textareaRef = useRef(null);
	const streamTimerRef = useRef(null);
	const turnTimerRef = useRef(null);
	const [turnElapsed, setTurnElapsed] = useState(null);
	const [showCommandPalette, setShowCommandPalette] = useState(false);
	const [commandFilter, setCommandFilter] = useState("");
	const [showFilesMenu, setShowFilesMenu] = useState(false);
	const [filesFilter, setFilesFilter] = useState("");
	const [theme, _setTheme] = useState(() => {
		const params = new URLSearchParams(window.location.search);
		return (
			params.get("theme") || localStorage.getItem("acp-theme") || "dracula"
		);
	});

	// Persist theme + apply to body/pane
	useEffect(() => {
		document.body.setAttribute("data-theme", theme);
		localStorage.setItem("acp-theme", theme);
	}, [theme]);

	// Auto-start prompt for demo screenshots via ?autostart=1
	const autoStartRef = useRef(false);
	useEffect(() => {
		if (autoStartRef.current) return;
		const params = new URLSearchParams(window.location.search);
		if (
			params.get("autostart") === "1" &&
			state.timeline.length === 0 &&
			state.composer.trim()
		) {
			autoStartRef.current = true;
			setTimeout(() => handleSubmit(), 600);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [state.timeline.length]);

	// Streaming ticker: every 30ms consumes chars from any active streaming message
	useEffect(() => {
		if (state.status !== "running") return;
		streamTimerRef.current = setInterval(() => {
			dispatch({ type: "stream_char", step: 4 });
			dispatch({
				type: "update_usage",
				usage: {
					used: state.usage.used + 12,
					cost: state.usage.cost + 0.00004,
				},
			});
		}, 30);
		return () => clearInterval(streamTimerRef.current);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [state.status]);

	// Turn timer
	useEffect(() => {
		if (!state.turnStart || state.status === "idle") {
			setTurnElapsed(null);
			return;
		}
		turnTimerRef.current = setInterval(() => {
			const s = Math.floor((Date.now() - state.turnStart) / 1000);
			setTurnElapsed(`${s}s`);
		}, 200);
		return () => clearInterval(turnTimerRef.current);
	}, [state.turnStart, state.status]);

	// Keyboard: 1/2/3/4 respond to pending permission; Esc closes palette
	const activePermission = state.timeline.find(
		(i) => i.kind === "permission" && !i.resolved,
	);
	useEffect(() => {
		const handler = (e) => {
			if (showCommandPalette || showFilesMenu) {
				if (e.key === "Escape") {
					setShowCommandPalette(false);
					setShowFilesMenu(false);
					return;
				}
				if (e.key === "Enter") {
					e.preventDefault();
					const first = window.SLASH_COMMANDS.find(
						(c) => !commandFilter || c.name.startsWith(commandFilter),
					);
					if (showCommandPalette && first) handleSelectCommand(first);
					const firstF = window.MENTION_FILES.find(
						(f) =>
							!filesFilter ||
							f.short.toLowerCase().includes(filesFilter.toLowerCase()),
					);
					if (showFilesMenu && firstF) handleSelectFile(firstF);
					return;
				}
			}
			// Only handle 1-4 for permission if not typing in composer
			if (
				activePermission &&
				["1", "2", "3", "4"].includes(e.key) &&
				document.activeElement !== textareaRef.current
			) {
				const opt = activePermission.options.find((o) => o.keybind === e.key);
				if (opt) {
					e.preventDefault();
					handleRespondPermission(opt);
				}
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		activePermission,
		showCommandPalette,
		showFilesMenu,
		commandFilter,
		filesFilter,
	]);

	// Detect / and @ in composer
	useEffect(() => {
		const text = state.composer;
		const caret = textareaRef.current?.selectionStart ?? text.length;
		// Grab word around caret starting with / or @
		const before = text.slice(0, caret);
		const slashMatch = before.match(/(?:^|\s)(\/[a-z]*)$/i);
		const atMatch = before.match(/(?:^|\s)(@[\S]*)$/i);
		if (slashMatch) {
			setShowCommandPalette(true);
			setCommandFilter(slashMatch[1]);
			setShowFilesMenu(false);
		} else if (atMatch) {
			setShowFilesMenu(true);
			setFilesFilter(atMatch[1].slice(1));
			setShowCommandPalette(false);
		} else {
			setShowCommandPalette(false);
			setShowFilesMenu(false);
		}
	}, [state.composer]);

	const handleSubmit = useCallback(() => {
		const text = state.composer.trim();
		if (!text) return;
		clear();
		dispatch({
			type: "add_item",
			item: {
				kind: "message",
				role: "user",
				text,
				ts: nowHHMMSS(),
			},
		});
		dispatch({ type: "set_composer", value: "" });
		// Kick off the scripted response
		run(window.SCENARIO_SCRIPT);
	}, [state.composer, clear, run]);

	const handleCancel = useCallback(() => {
		clear();
		if (streamTimerRef.current) clearInterval(streamTimerRef.current);
		dispatch({ type: "set_status", value: "idle" });
		dispatch({
			type: "add_item",
			item: {
				kind: "message",
				role: "assistant",
				text: "(用户已取消当前 turn)",
				displayText: "(用户已取消当前 turn)",
				ts: nowHHMMSS(),
			},
		});
	}, [clear]);

	const handleRespondPermission = useCallback(
		(opt) => {
			dispatch({
				type: "resolve_permission",
				optionKind: opt.kind,
				optionName: opt.name,
			});
			const isAllow = opt.kind.startsWith("allow");
			const nextScript = isAllow
				? window.SCENARIO_AFTER_ALLOW
				: window.SCENARIO_AFTER_REJECT;
			run(nextScript, 0);
		},
		[run],
	);

	const handleReset = useCallback(() => {
		clear();
		if (streamTimerRef.current) clearInterval(streamTimerRef.current);
		if (turnTimerRef.current) clearInterval(turnTimerRef.current);
		dispatch({ type: "reset", initial: window.SCENARIO_INITIAL_STATE });
	}, [clear]);

	const handleSelectCommand = useCallback(
		(cmd) => {
			// Replace the current slash token with the command name
			const text = state.composer;
			const caret = textareaRef.current?.selectionStart ?? text.length;
			const before = text.slice(0, caret);
			const after = text.slice(caret);
			const replaced = before.replace(/(\/[a-z]*)$/i, `${cmd.name} `);
			dispatch({ type: "set_composer", value: replaced + after });
			setShowCommandPalette(false);
			// Handle specific commands
			if (cmd.name === "/clear") {
				handleReset();
			} else if (cmd.name === "/mode") {
				// Cycle mode as a demo
				const modes = ["default", "plan", "accept-edits"];
				const idx = modes.indexOf(state.session.mode);
				const nextMode = modes[(idx + 1) % modes.length];
				dispatch({ type: "set_mode", value: nextMode });
				dispatch({ type: "set_composer", value: "" });
			} else if (cmd.name === "/model") {
				const models = ["sonnet-4.5", "opus-4.8", "haiku-4.5"];
				const idx = models.indexOf(state.session.model);
				const nextModel = models[(idx + 1) % models.length];
				dispatch({ type: "set_model", value: nextModel });
				dispatch({ type: "set_composer", value: "" });
			}
			textareaRef.current?.focus();
		},
		[state.composer, state.session.mode, state.session.model, handleReset],
	);

	const handleSelectFile = useCallback(
		(file) => {
			const text = state.composer;
			const caret = textareaRef.current?.selectionStart ?? text.length;
			const before = text.slice(0, caret);
			const after = text.slice(caret);
			const replaced = before.replace(/(@[\S]*)$/, `@${file.short} `);
			dispatch({ type: "set_composer", value: replaced + after });
			setShowFilesMenu(false);
			textareaRef.current?.focus();
		},
		[state.composer],
	);

	const handleComposerChange = useCallback((value) => {
		dispatch({ type: "set_composer", value });
	}, []);

	// Enter to submit (unless Shift or palette open)
	useEffect(() => {
		const ta = textareaRef.current;
		if (!ta) return;
		const handler = (e) => {
			if (
				e.key === "Enter" &&
				!e.shiftKey &&
				!showCommandPalette &&
				!showFilesMenu
			) {
				e.preventDefault();
				handleSubmit();
			}
		};
		ta.addEventListener("keydown", handler);
		return () => ta.removeEventListener("keydown", handler);
	}, [handleSubmit, showCommandPalette, showFilesMenu]);

	return (
		<div className="v3-shell">
			<div className="v3-shell__topbar">
				<div className="v3-shell__title">
					<span style={{ color: "#ff79c6" }}>◆</span>
					<span>
						Superset · ACP Session Pane · <b>Live Preview</b>
					</span>
					<span className="v3-shell__note">
						mirror of <code>apps/desktop/…/AcpSessionPane/</code>
					</span>
				</div>
				<div className="v3-shell__hint">
					<span className="kbd">Enter</span> send ·{" "}
					<span className="kbd">1-4</span> permission
				</div>
			</div>

			<div className="v3-shell__stage">
				<div className="v3-shell__frame">
					<F01Pane
						state={state.session}
						timeline={state.timeline}
						status={state.status}
						usage={state.usage}
						turnElapsed={turnElapsed}
						composerValue={state.composer}
						onComposerChange={handleComposerChange}
						onSubmit={handleSubmit}
						onCancel={handleCancel}
						onRespondPermission={handleRespondPermission}
						showCommandPalette={showCommandPalette}
						commandFilter={commandFilter}
						onSelectCommand={handleSelectCommand}
						showFilesMenu={showFilesMenu}
						filesFilter={filesFilter}
						onSelectFile={handleSelectFile}
						textareaRef={textareaRef}
						onReset={handleReset}
					/>
				</div>
			</div>
		</div>
	);
}

// One-time <style> for the outer shell
if (
	typeof document !== "undefined" &&
	!document.getElementById("v3-shell-styles")
) {
	const s = document.createElement("style");
	s.id = "v3-shell-styles";
	s.textContent = `
    body {
      background: #191a21;
      min-height: 100vh;
      margin: 0;
      font-family: "JetBrains Mono", "IBM Plex Mono", "SF Mono", ui-monospace, Menlo, monospace;
    }
    .v3-shell {
      min-height: 100vh;
      display: flex; flex-direction: column;
    }
    .v3-shell__topbar {
      display: flex; align-items: center; gap: 20px;
      padding: 10px 24px;
      border-bottom: 1px solid rgba(98, 114, 164, 0.15);
      background: #21222c;
    }
    .v3-shell__title {
      display: flex; align-items: baseline; gap: 8px;
      color: #f8f8f2; font-size: 13px;
      font-family: inherit;
    }
    .v3-shell__title b { color: #ff79c6; font-weight: 500; }
    .v3-shell__note {
      color: #6272a4; font-size: 11px;
    }
    .v3-shell__note code {
      color: #8be9fd; background: rgba(139, 233, 253, 0.08);
      padding: 1px 5px; border-radius: 3px; font-size: 10.5px;
    }
    .v3-shell__hint {
      color: #6272a4; font-size: 11.5px;
      flex: 1; text-align: right;
    }
    .v3-shell__hint .kbd {
      display: inline-flex; align-items: center;
      padding: 0 5px; height: 16px;
      background: #2d2f3f;
      border: 1px solid rgba(98, 114, 164, 0.4);
      border-radius: 3px;
      color: #f8f8f2;
      font-family: inherit;
      font-size: 10.5px;
      margin: 0 2px;
    }
    .v3-shell__stage {
      flex: 1; display: flex;
      align-items: center; justify-content: center;
      padding: 24px;
      min-height: 0;
    }
    .v3-shell__frame {
      width: 100%;
      max-width: 1100px;
      height: min(780px, calc(100vh - 120px));
      display: flex; flex-direction: column;
      background: #282a36;
      border-radius: 8px;
      box-shadow:
        0 40px 100px rgba(0, 0, 0, 0.7),
        0 0 0 1px rgba(255, 121, 198, 0.06),
        0 0 60px rgba(189, 147, 249, 0.05);
      overflow: hidden;
    }
  `;
	document.head.appendChild(s);
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
