// final-complete.jsx — Complete integrated ACP pane design
// Combining: V03 chat bubbles + Plan A progress bar + Markdown/Code +
// full toolbar + composer + status bar
const { useState, useEffect } = React;

// ==========================================================
// Global page styles + all component styles combined
// ==========================================================
if (!document.getElementById("fc-shell")) {
	const s = document.createElement("style");
	s.id = "fc-shell";
	s.textContent = `
	*, *::before, *::after { box-sizing: border-box; }
	body {
		margin: 0; background: #191a21; min-height: 100vh;
		font-family: -apple-system, "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif;
	}
	.fc-topbar {
		padding: 10px 24px;
		border-bottom: 1px solid rgba(98,114,164,0.15);
		background: #21222c;
		display: flex; align-items: baseline; gap: 12px;
		font-family: "JetBrains Mono", ui-monospace, monospace;
	}
	.fc-topbar .glyph { color: #ff79c6; font-size: 15px; }
	.fc-topbar .title { color: #f8f8f2; font-size: 13px; }
	.fc-topbar .title b { color: #ff79c6; font-weight: 500; }
	.fc-topbar .dim { color: #6272a4; font-size: 11px; margin-left: 4px; }
	.fc-topbar .kbd {
		display: inline-flex; align-items: center;
		padding: 0 5px; height: 16px;
		background: #2d2f3f; border: 1px solid rgba(98,114,164,0.4);
		border-radius: 3px; color: #f8f8f2;
		font-size: 10.5px; margin: 0 2px;
	}
	/* Context indicator preview panel */
	.ctxv {
		max-width: 1000px; margin: 16px auto 0; padding: 14px 18px;
		background: #21222c; border: 1px solid rgba(98,114,164,0.25);
		border-radius: 6px;
		font-family: "JetBrains Mono", ui-monospace, monospace;
	}
	.ctxv__title { color: #f8f8f2; font-size: 12px; margin-bottom: 12px; }
	.ctxv__title code { color: #ff79c6; background: rgba(255,121,198,0.1); padding: 1px 4px; border-radius: 2px; font-size: 11px; }
	.ctxv__grid {
		display: grid;
		grid-template-columns: 160px repeat(4, 1fr);
		row-gap: 4px; column-gap: 10px;
		align-items: center;
	}
	.ctxv__col--head { padding: 6px 8px; border-bottom: 1px solid rgba(98,114,164,0.2); display: flex; flex-direction: column; gap: 2px; }
	.ctxv__pct { color: #f8f8f2; font-size: 11px; font-weight: 500; }
	.ctxv__lvl { color: #6272a4; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
	.ctxv__col--name { color: #d0d3e0; font-size: 11.5px; display: inline-flex; align-items: center; gap: 8px; padding: 8px 4px; }
	.ctxv__id {
		display: inline-flex; align-items: center; justify-content: center;
		width: 18px; height: 18px; border-radius: 3px;
		background: rgba(189,147,249,0.15); color: #bd93f7;
		font-size: 10px; font-weight: 600;
	}
	.ctxv__cell {
		padding: 8px 4px; font-size: 11.5px;
		background: rgba(40,42,54,0.4); border-radius: 3px;
		display: flex; align-items: center; justify-content: flex-start;
		min-height: 30px;
	}
	.ctxv__mono { font-family: "JetBrains Mono", ui-monospace, monospace; letter-spacing: 0.5px; }
	.ctxv__num { font-variant-numeric: tabular-nums; }
	.ctxv__donut { font-size: 14px; display: inline-flex; align-items: baseline; gap: 4px; }
	.ctxv__donut .ctxv__unit { font-size: 11px; }
	.ctxv__unit { color: #6272a4; font-size: 10.5px; margin-left: 3px; }
	/* tone coloring — same 4 buckets: ok / mid / warn / danger */
	[data-tone="ok"]     { color: #6272a4; }
	[data-tone="mid"]    { color: #8be9fd; }
	[data-tone="warn"]   { color: #ffb86c; }
	[data-tone="danger"] { color: #ff5555; }
	.fc-stage {
		display: flex; justify-content: center;
		padding: 24px; min-height: calc(100vh - 40px);
	}
	.fc-frame {
		width: 100%;
		max-width: 1000px;
		height: min(900px, calc(100vh - 100px));
		display: flex; flex-direction: column;
		background: #282a36; border-radius: 8px; overflow: hidden;
		box-shadow: 0 40px 100px rgba(0,0,0,0.7),
		            0 0 0 1px rgba(255,121,198,0.06),
		            0 0 60px rgba(189,147,249,0.05);
	}

	/* ===== V03 Chat Bubble ===== */
	.fc-body { flex: 1; min-height: 0; overflow-y: auto; padding: 20px 22px; scrollbar-width: thin; }
	.fc-body::-webkit-scrollbar { width: 6px; }
	.fc-body::-webkit-scrollbar-thumb { background: rgba(98,114,164,0.3); border-radius: 3px; }

	.fc-turns { display: flex; flex-direction: column; gap: 14px; font-family: "JetBrains Mono", ui-monospace, monospace; }

	.fc-msg { display: flex; flex-direction: column; }
	.fc-msg[data-role="user"] { align-items: flex-end; }
	.fc-msg__author {
		font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase;
		color: #6272a4; margin-bottom: 4px; padding: 0 4px;
	}
	.fc-msg[data-role="user"] .fc-msg__author { color: #8be9fd; }
	.fc-msg[data-role="agent"] .fc-msg__author { color: #ff79c6; }
	.fc-msg__bubble { max-width: 82%; font-size: 13.5px; line-height: 1.7; color: #f8f8f2; white-space: pre-wrap;
		font-family: -apple-system, "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif; }
	.fc-msg[data-role="user"] .fc-msg__bubble {
		padding: 9px 14px;
		background: rgba(139,233,253,0.08);
		border: 1px solid rgba(139,233,253,0.22);
		border-radius: 12px 12px 4px 12px;
	}
	.fc-msg[data-role="agent"] .fc-msg__bubble { padding: 0 4px; }
	.fc-msg[data-role="thought"] .fc-msg__bubble {
		padding: 8px 12px;
		border: 1px dashed rgba(98,114,164,0.36);
		border-radius: 8px;
		color: #6272a4; font-style: italic; font-size: 12.5px;
	}

	/* ===== Tool call inline ===== */
	.fc-tool {
		display: flex; align-items: center; gap: 8px;
		padding: 6px 10px;
		background: rgba(255,255,255,0.02);
		border: 1px solid rgba(98,114,164,0.22);
		border-radius: 5px;
		font-size: 11.5px; cursor: pointer;
		color: #d0d3e0;
		max-width: 82%;
		font-family: "JetBrains Mono", monospace;
	}
	.fc-tool:hover { border-color: rgba(98,114,164,0.4); }
	.fc-tool__caret { color: #6272a4; }
	.fc-tool__kind {
		text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.1em;
		padding: 1px 6px; border-radius: 2px; font-weight: 500;
		border: 1px solid; white-space: nowrap;
	}
	.fc-tool__kind[data-k="search"] { color: #bd93f9; border-color: rgba(189,147,249,0.4); }
	.fc-tool__kind[data-k="read"] { color: #8be9fd; border-color: rgba(139,233,253,0.4); }
	.fc-tool__kind[data-k="edit"] { color: #ffb86c; border-color: rgba(255,184,108,0.4); }
	.fc-tool__title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.fc-tool__title code { background: rgba(255,255,255,0.05); padding: 1px 4px; border-radius: 2px; font-size: 11px; color: #f8f8f2; }
	.fc-tool__meta { color: #6272a4; font-size: 10.5px; flex-shrink: 0; font-family: monospace; }
	.fc-tool__meta[data-warn="true"] { color: #ffb86c; }
	.fc-tool-wrap {
		display: flex; flex-direction: column;
		max-width: 82%;
	}
	.fc-tool-wrap .fc-tool { max-width: 100%; }
	.fc-tool-wrap:has(.fc-tool-body),
	.fc-tool-wrap:has(.fc-diff) {
		border: 1px solid rgba(98,114,164,0.22);
		border-radius: 5px;
		overflow: hidden;
	}
	.fc-tool-wrap:has(.fc-tool-body) .fc-tool,
	.fc-tool-wrap:has(.fc-diff) .fc-tool {
		border: none;
		border-radius: 0;
		border-bottom: 1px solid rgba(98,114,164,0.18);
		background: rgba(255,255,255,0.02);
	}
	.fc-tool-body {
		background: rgba(0,0,0,0.28);
		padding: 8px 12px;
		font-size: 11.5px; color: #d0d3e0;
		white-space: pre-wrap;
		font-family: "JetBrains Mono", monospace;
	}
	.fc-tool-wrap:has(.fc-tool-body) .fc-tool-body {
		border: none;
		border-radius: 0;
	}

	/* ===== Plan A · progress bar ===== */
	.fc-plan {
		max-width: 82%;
		background: rgba(255,255,255,0.02);
		border: 1px solid rgba(255,121,198,0.2);
		border-radius: 8px;
		padding: 12px 14px;
		font-family: "JetBrains Mono", monospace;
	}
	.fc-plan__head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; }
	.fc-plan__title { color: #ff79c6; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 600; }
	.fc-plan__count { color: #6272a4; font-size: 11px; }
	.fc-plan__count b { color: #ff79c6; font-weight: 500; }
	.fc-plan__progress { flex: 1; height: 3px; background: rgba(98,114,164,0.2); border-radius: 2px; overflow: hidden; align-self: center; margin-left: 4px; }
	.fc-plan__progress-fill { height: 100%; background: linear-gradient(to right, #50fa7b 0%, #50fa7b 60%, #ffb86c 60%, #ffb86c 85%, transparent 85%); border-radius: 2px; }
	.fc-plan__items { display: flex; flex-direction: column; gap: 3px; }
	.fc-plan__item { display: flex; align-items: center; gap: 10px; font-size: 12.5px; padding: 4px 0; }
	.fc-plan__dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
	.fc-plan__item[data-s="completed"] .fc-plan__dot { background: #50fa7b; }
	.fc-plan__item[data-s="in_progress"] .fc-plan__dot { background: #ffb86c; box-shadow: 0 0 0 3px rgba(255,184,108,0.15); animation: fc-plan-pulse 1.8s ease-in-out infinite; }
	.fc-plan__item[data-s="pending"] .fc-plan__dot { background: transparent; border: 1.5px solid #44475a; }
	.fc-plan__item[data-s="completed"] .fc-plan__txt { color: #6272a4; text-decoration: line-through; text-decoration-color: rgba(98,114,164,0.5); }
	.fc-plan__item[data-s="in_progress"] .fc-plan__txt { color: #f8f8f2; font-weight: 500; }
	.fc-plan__item[data-s="pending"] .fc-plan__txt { color: #d0d3e0; }
	.fc-plan__txt { flex: 1; }
	@keyframes fc-plan-pulse {
		0%, 100% { box-shadow: 0 0 0 3px rgba(255,184,108,0.15); }
		50% { box-shadow: 0 0 0 6px rgba(255,184,108,0.05); }
	}

	/* ===== Diff (inside tool body) ===== */
	.fc-diff {
		border: none;
		border-radius: 0;
		overflow: hidden;
		background: rgba(0,0,0,0.28);
		font-family: "JetBrains Mono", monospace;
	}
	.fc-diff__head { padding: 5px 10px; border-bottom: 1px solid rgba(98,114,164,0.18); display: flex; align-items: center; gap: 10px; color: #6272a4; font-size: 10.5px; }
	.fc-diff__head-p { color: #f8f8f2; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.fc-diff__head-stat .plus { color: #50fa7b; }
	.fc-diff__head-stat .minus { color: #ff5555; }
	.fc-diff__body { padding: 4px 0; font-size: 11.5px; }
	.fc-diff__line { display: grid; grid-template-columns: 32px 12px 1fr; gap: 4px; padding: 0 12px; white-space: pre; line-height: 1.6; }
	.fc-diff__line-num { color: rgba(255,255,255,0.24); text-align: right; font-size: 10.5px; }
	.fc-diff__line[data-k="add"] { background: rgba(80,250,123,0.08); }
	.fc-diff__line[data-k="add"] .fc-diff__line-mark, .fc-diff__line[data-k="add"] .fc-diff__line-txt { color: #50fa7b; }
	.fc-diff__line[data-k="del"] { background: rgba(255,85,85,0.08); }
	.fc-diff__line[data-k="del"] .fc-diff__line-mark, .fc-diff__line[data-k="del"] .fc-diff__line-txt { color: #ff5555; }
	.fc-diff__line[data-k="ctx"] .fc-diff__line-txt { color: rgba(248,248,242,0.55); }

	/* ===== Permission card ===== */
	.fc-perm {
		max-width: 82%;
		border: 1px solid rgba(255,121,198,0.5);
		background: linear-gradient(180deg, rgba(255,121,198,0.14), rgba(255,121,198,0.03));
		border-radius: 6px;
		padding: 12px 14px;
		box-shadow: 0 0 32px rgba(255,121,198,0.12);
		font-family: "JetBrains Mono", monospace;
	}
	.fc-perm__head { color: #ff79c6; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
	.fc-perm__pulse { width: 6px; height: 6px; border-radius: 50%; background: #ff79c6; animation: fc-pulse-pink 1.6s infinite; }
	@keyframes fc-pulse-pink {
		0% { box-shadow: 0 0 0 0 rgba(255,121,198,0.6); }
		70% { box-shadow: 0 0 0 8px rgba(255,121,198,0); }
		100% { box-shadow: 0 0 0 0 rgba(255,121,198,0); }
	}
	.fc-perm__q { color: #f8f8f2; font-size: 13px; margin-bottom: 10px; line-height: 1.5; font-family: -apple-system, "PingFang SC", sans-serif; }
	.fc-perm__q code { background: rgba(0,0,0,0.4); color: #ff79c6; padding: 1px 6px; border-radius: 3px; font-family: "JetBrains Mono", monospace; font-size: 11.5px; }
	.fc-perm__opts { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
	.fc-perm__opt {
		display: grid; grid-template-columns: 22px 1fr auto; gap: 10px;
		align-items: center; padding: 7px 10px;
		background: rgba(40,42,54,0.7); border: 1px solid rgba(98,114,164,0.28);
		color: #f8f8f2; border-radius: 5px; cursor: pointer;
		font: inherit; font-size: 12px; text-align: left;
	}
	.fc-perm__opt:hover { border-color: #ff79c6; background: rgba(40,42,54,0.9); }
	.fc-perm__key { color: #ff79c6; font-weight: 600; font-size: 11px; text-align: center; border: 1px solid rgba(255,121,198,0.4); border-radius: 3px; padding: 1px 4px; }
	.fc-perm__hint { color: #6272a4; font-size: 10.5px; }

	/* ===== Markdown in agent messages ===== */
	.fc-md h2 { font-size: 16px; font-weight: 600; color: #ff79c6; margin: 12px 0 6px; line-height: 1.4; }
	.fc-md h2:first-child { margin-top: 0; }
	.fc-md h3 { font-size: 14px; font-weight: 600; color: #ff79c6; margin: 10px 0 4px; }
	.fc-md p { margin: 6px 0; }
	.fc-md p:first-child { margin-top: 0; }
	.fc-md p:last-child { margin-bottom: 0; }
	.fc-md ul, .fc-md ol { margin: 6px 0; padding-left: 22px; }
	.fc-md li { margin: 2px 0; padding-left: 4px; }
	.fc-md ul li::marker { color: #ff79c6; }
	.fc-md ol li::marker { color: #ff79c6; font-weight: 500; }
	.fc-md strong { color: #f8f8f2; font-weight: 600; }
	.fc-md em { color: #d0d3e0; font-style: italic; }
	.fc-md a { color: #8be9fd; text-decoration: underline; text-decoration-color: rgba(139,233,253,0.3); text-underline-offset: 3px; }
	.fc-md a:hover { text-decoration-color: #8be9fd; }
	.fc-md code:not(pre code) {
		background: rgba(255,121,198,0.1); color: #ff79c6;
		padding: 1px 6px; border-radius: 3px;
		font-family: "JetBrains Mono", monospace; font-size: 12px;
		border: 1px solid rgba(255,121,198,0.18);
	}

	/* ===== Code block ===== */
	.fc-code {
		margin: 8px 0;
		border-radius: 6px; overflow: hidden;
		background: #21222c;
		border: 1px solid rgba(98,114,164,0.25);
		font-family: "JetBrains Mono", monospace;
	}
	.fc-code__hd {
		display: flex; align-items: center; gap: 10px;
		padding: 6px 10px;
		background: rgba(0,0,0,0.25);
		border-bottom: 1px solid rgba(98,114,164,0.18);
		font-size: 10.5px; color: #6272a4;
		letter-spacing: 0.04em;
	}
	.fc-code__lang { text-transform: lowercase; font-weight: 600; padding: 1px 6px; border-radius: 2px; border: 1px solid; }
	.fc-code__lang[data-lang="typescript"] { color: #8be9fd; border-color: rgba(139,233,253,0.36); background: rgba(139,233,253,0.06); }
	.fc-code__lang[data-lang="bash"] { color: #50fa7b; border-color: rgba(80,250,123,0.36); background: rgba(80,250,123,0.06); }
	.fc-code__lang[data-lang="json"] { color: #ffb86c; border-color: rgba(255,184,108,0.36); background: rgba(255,184,108,0.06); }
	.fc-code__meta { color: #6272a4; font-size: 10.5px; }
	.fc-code__copy { margin-left: auto; padding: 3px 8px; border-radius: 3px; background: transparent; border: none; color: #6272a4; cursor: pointer; font: inherit; font-size: 10.5px; }
	.fc-code__copy:hover { color: #ff79c6; background: rgba(255,121,198,0.08); }
	.fc-code__copy.success { color: #50fa7b; }
	.fc-code__body { display: grid; grid-template-columns: auto 1fr; font-size: 12px; line-height: 1.65; }
	.fc-code__gutter { user-select: none; text-align: right; padding: 8px 10px 8px 12px; color: rgba(98,114,164,0.55); font-size: 11px; background: rgba(0,0,0,0.15); border-right: 1px solid rgba(98,114,164,0.12); }
	.fc-code__pre { margin: 0; padding: 8px 12px; overflow-x: auto; color: #f8f8f2; white-space: pre; }
	.fc-code__pre::-webkit-scrollbar { height: 6px; }
	.fc-code__pre::-webkit-scrollbar-thumb { background: rgba(98,114,164,0.3); border-radius: 3px; }
	.fc-code--nolines .fc-code__body { grid-template-columns: 1fr; }

	.tok-keyword { color: #ff79c6; }
	.tok-string  { color: #f1fa8c; }
	.tok-number  { color: #bd93f9; }
	.tok-comment { color: #6272a4; font-style: italic; }
	.tok-fn      { color: #50fa7b; }
	.tok-type    { color: #8be9fd; font-style: italic; }
	.tok-const   { color: #bd93f9; font-style: italic; }
	.tok-op      { color: #ff79c6; }
	.tok-var     { color: #f8f8f2; }
	.tok-flag    { color: #50fa7b; }

	/* ===== Toolbar (top of pane) ===== */
	.fc-toolbar {
		flex-shrink: 0;
		display: flex; align-items: center; gap: 10px;
		padding: 5px 12px; width: 100%; height: 34px;
		background: linear-gradient(to bottom, #343746, #2d2f3f);
		border-bottom: 1px solid rgba(98,114,164,0.28);
		box-shadow: 0 1px 0 rgba(0,0,0,0.2);
		font-family: "JetBrains Mono", monospace;
	}
	.fc-chip {
		display: inline-flex; align-items: center;
		padding: 2px 12px; line-height: 1.4;
		background: rgba(255,121,198,0.1);
		border: 1px solid rgba(255,121,198,0.7);
		border-radius: 999px;
		color: #ff79c6; font-size: 11.5px; font-weight: 500; letter-spacing: 0.03em;
		white-space: nowrap; flex-shrink: 0;
		text-shadow: 0 0 6px rgba(255,121,198,0.4);
		box-shadow:
			inset 0 0 8px rgba(255,121,198,0.15),
			0 0 0 1px rgba(255,121,198,0.12),
			0 0 20px rgba(255,121,198,0.35),
			0 2px 8px rgba(0,0,0,0.3);
	}
	.fc-toolbar__title {
		color: #d0d3e0; font-size: 12px; flex-shrink: 1;
		overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
		font-family: -apple-system, "PingFang SC", sans-serif;
	}
	.fc-toolbar__spacer { flex: 1; }
	.fc-toolbar__actions { display: inline-flex; align-items: center; gap: 4px; padding-left: 8px; border-left: 1px solid rgba(98,114,164,0.2); margin-left: 4px; }
	.fc-toolbar__actions button {
		background: transparent; border: none; outline: none;
		color: #d0d3e0; padding: 4px; border-radius: 4px; cursor: pointer;
		display: inline-flex; align-items: center; justify-content: center;
	}
	.fc-toolbar__actions button:hover { color: #ff79c6; background: rgba(255,121,198,0.08); }
	.fc-toolbar__actions svg { width: 14px; height: 14px; stroke: currentColor; fill: none; }

	/* ===== Composer ===== */
	.fc-composer {
		flex-shrink: 0;
		border-top: 1px solid rgba(98,114,164,0.2);
		padding: 8px 14px;
		background: linear-gradient(to top, #2d2f3f, #282a36);
	}
	.fc-composer__box {
		border: 1px solid rgba(98,114,164,0.36);
		border-radius: 6px;
		padding: 7px 12px;
		background: rgba(0,0,0,0.22);
		display: flex; align-items: flex-end; gap: 8px;
	}
	.fc-composer__box:focus-within { border-color: rgba(255,121,198,0.5); }
	.fc-composer__glyph { color: #ff79c6; font-weight: 500; font-family: "JetBrains Mono", monospace; flex-shrink: 0; padding-bottom: 1px; }
	.fc-composer__input {
		flex: 1; background: transparent; border: none; outline: none;
		color: #f8f8f2; font: inherit; font-size: 13px; padding: 0;
		font-family: -apple-system, "PingFang SC", sans-serif;
		caret-color: #ff79c6;
		resize: none; overflow-y: auto;
		min-height: 20px; max-height: 120px;
		line-height: 1.54; display: block;
		scrollbar-width: thin;
	}
	.fc-composer__input::-webkit-scrollbar { width: 4px; }
	.fc-composer__input::-webkit-scrollbar-thumb { background: rgba(98,114,164,0.3); border-radius: 2px; }
	.fc-composer__input::placeholder { color: #6272a4; }
	.fc-composer__send {
		background: rgba(255,121,198,0.16); color: #ff79c6;
		border: 1px solid rgba(255,121,198,0.4);
		padding: 3px 10px; border-radius: 4px;
		cursor: pointer; font: inherit;
		font-family: "JetBrains Mono", monospace;
		font-size: 11px; letter-spacing: 0.02em;
		flex-shrink: 0;
	}
	.fc-composer__send:hover { background: rgba(255,121,198,0.24); }

	/* ===== Permission / AskUser popover (floats above composer, modal) ===== */
	.fc-perm-pop-wrap {
		position: relative;
		flex-shrink: 0;
	}
	.fc-perm-pop {
		position: absolute;
		left: 14px; right: 14px; bottom: calc(100% + 8px);
		z-index: 30;
		border: 1px solid rgba(255,121,198,0.55);
		border-radius: 8px;
		background: linear-gradient(180deg, #2a2635, #241f2c);
		box-shadow:
			0 -2px 0 rgba(255,121,198,0.04),
			0 12px 32px rgba(0,0,0,0.55),
			0 0 40px rgba(255,121,198,0.14);
		padding: 12px 14px;
		font-family: "JetBrains Mono", monospace;
		animation: fc-perm-rise 0.18s ease-out;
	}
	/* Askuser variant — cyan, softer than pink permission */
	.fc-perm-pop[data-type="askuser"] {
		border-color: rgba(139,233,253,0.5);
		background: linear-gradient(180deg, #22303a, #1d2932);
		box-shadow:
			0 -2px 0 rgba(139,233,253,0.04),
			0 12px 32px rgba(0,0,0,0.55),
			0 0 40px rgba(139,233,253,0.12);
	}
	@keyframes fc-perm-rise {
		from { transform: translateY(6px); opacity: 0; }
		to   { transform: translateY(0);   opacity: 1; }
	}
	.fc-perm-pop::after {
		/* small arrow pointing down to composer */
		content: ""; position: absolute;
		left: 24px; top: 100%;
		border: 6px solid transparent;
		border-top-color: rgba(255,121,198,0.55);
	}
	.fc-perm-pop::before {
		content: ""; position: absolute;
		left: 25px; top: 100%;
		border: 5px solid transparent;
		border-top-color: #241f2c;
		margin-top: -1px;
	}
	.fc-perm-pop[data-type="askuser"]::after { border-top-color: rgba(139,233,253,0.5); }
	.fc-perm-pop[data-type="askuser"]::before { border-top-color: #1d2932; }

	.fc-perm-pop__head {
		display: flex; align-items: center; gap: 8px;
		color: #ff79c6; font-size: 10px;
		letter-spacing: 0.14em; text-transform: uppercase;
		font-weight: 600; margin-bottom: 8px;
	}
	.fc-perm-pop[data-type="askuser"] .fc-perm-pop__head { color: #8be9fd; }
	.fc-perm-pop__pulse {
		width: 6px; height: 6px; border-radius: 50%;
		background: #ff79c6;
		animation: fc-pulse-pink 1.6s infinite;
		box-shadow: 0 0 8px rgba(255,121,198,0.5);
	}
	.fc-perm-pop[data-type="askuser"] .fc-perm-pop__pulse {
		background: #8be9fd;
		box-shadow: 0 0 8px rgba(139,233,253,0.5);
		animation: fc-pulse-cyan 1.6s infinite;
	}
	@keyframes fc-pulse-cyan {
		0%   { box-shadow: 0 0 0 0 rgba(139,233,253,0.6); }
		70%  { box-shadow: 0 0 0 8px rgba(139,233,253,0); }
		100% { box-shadow: 0 0 0 0 rgba(139,233,253,0); }
	}
	.fc-perm-pop__lock {
		margin-left: auto;
		color: #6272a4; font-size: 10px; letter-spacing: 0.08em;
		display: inline-flex; align-items: center; gap: 4px;
		font-family: "JetBrains Mono", monospace; text-transform: none;
	}
	.fc-perm-pop__lock svg { width: 10px; height: 10px; stroke: currentColor; fill: none; }
	.fc-perm-pop__q {
		color: #f8f8f2; font-size: 13px; line-height: 1.5;
		margin-bottom: 10px;
		font-family: -apple-system, "PingFang SC", sans-serif;
	}
	.fc-perm-pop__q code {
		background: rgba(0,0,0,0.4); color: #ff79c6;
		padding: 1px 6px; border-radius: 3px;
		font-family: "JetBrains Mono", monospace; font-size: 11.5px;
	}
	.fc-perm-pop[data-type="askuser"] .fc-perm-pop__q code { color: #8be9fd; }
	.fc-perm-pop__opts {
		display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
	}
	.fc-perm-pop[data-type="askuser"] .fc-perm-pop__opts {
		grid-template-columns: 1fr;
	}
	.fc-perm-pop__opt {
		display: grid; grid-template-columns: 20px 1fr auto;
		gap: 10px; align-items: center;
		padding: 7px 10px;
		background: rgba(40,42,54,0.75);
		border: 1px solid rgba(98,114,164,0.28);
		color: #f8f8f2; border-radius: 5px;
		cursor: pointer; font: inherit;
		font-size: 12px; text-align: left;
		font-family: "JetBrains Mono", monospace;
	}
	.fc-perm-pop__opt[data-k="allow"]:hover,
	.fc-perm-pop__opt[data-k="session"]:hover { border-color: #ff79c6; background: rgba(255,121,198,0.08); }
	.fc-perm-pop__opt[data-k="reject"]:hover,
	.fc-perm-pop__opt[data-k="never"]:hover  { border-color: rgba(98,114,164,0.5); background: rgba(98,114,164,0.08); }
	.fc-perm-pop__opt[data-k="answer"]:hover { border-color: #8be9fd; background: rgba(139,233,253,0.08); }
	.fc-perm-pop__key {
		color: #ff79c6; font-weight: 600; font-size: 11px;
		text-align: center;
		border: 1px solid rgba(255,121,198,0.4);
		border-radius: 3px; padding: 1px 4px;
	}
	.fc-perm-pop__opt[data-k="reject"] .fc-perm-pop__key,
	.fc-perm-pop__opt[data-k="never"]  .fc-perm-pop__key {
		color: #6272a4; border-color: rgba(98,114,164,0.3);
	}
	.fc-perm-pop__opt[data-k="answer"] .fc-perm-pop__key {
		color: #8be9fd; border-color: rgba(139,233,253,0.4);
	}
	.fc-perm-pop__hint {
		color: #6272a4; font-size: 10.5px;
	}

	/* AskUser inline text input (for free-form questions) */
	.fc-perm-pop__answer {
		display: flex; gap: 6px; align-items: stretch;
		margin-top: 4px;
	}
	.fc-perm-pop__answer-input {
		flex: 1;
		background: rgba(0,0,0,0.28);
		border: 1px solid rgba(139,233,253,0.35);
		border-radius: 5px;
		padding: 7px 10px;
		color: #f8f8f2; font: inherit; font-size: 12.5px;
		outline: none;
		font-family: -apple-system, "PingFang SC", sans-serif;
	}
	.fc-perm-pop__answer-input:focus { border-color: #8be9fd; }
	.fc-perm-pop__answer-input::placeholder { color: #6272a4; }
	.fc-perm-pop__answer-send {
		background: rgba(139,233,253,0.16); color: #8be9fd;
		border: 1px solid rgba(139,233,253,0.4);
		padding: 0 12px; border-radius: 5px;
		cursor: pointer; font: inherit;
		font-family: "JetBrains Mono", monospace;
		font-size: 11px; letter-spacing: 0.02em;
	}
	.fc-perm-pop__answer-send:hover { background: rgba(139,233,253,0.24); }

	/* ===== AskUser: full picker (multi-select checklist + notes + footer) ===== */
	.fc-ask__hint {
		display: flex; align-items: center; gap: 8px;
		color: #6272a4; font-size: 10.5px;
		margin-bottom: 6px;
		font-family: "JetBrains Mono", monospace;
	}
	.fc-ask__hint b { color: #8be9fd; font-weight: 500; }
	.fc-ask__list {
		display: flex; flex-direction: column; gap: 4px;
		max-height: 200px; overflow-y: auto;
		padding: 2px; scrollbar-width: thin;
	}
	.fc-ask__list::-webkit-scrollbar { width: 4px; }
	.fc-ask__list::-webkit-scrollbar-thumb { background: rgba(98,114,164,0.3); border-radius: 2px; }
	.fc-ask__opt {
		display: grid;
		grid-template-columns: 18px 20px 1fr auto;
		gap: 10px; align-items: center;
		padding: 7px 10px;
		background: rgba(40,42,54,0.65);
		border: 1px solid rgba(98,114,164,0.25);
		color: #d0d3e0; border-radius: 5px;
		cursor: pointer; font: inherit;
		font-size: 12.5px; text-align: left;
		font-family: -apple-system, "PingFang SC", sans-serif;
		transition: border-color 0.12s, background 0.12s;
	}
	.fc-ask__opt:hover { border-color: rgba(139,233,253,0.4); background: rgba(139,233,253,0.05); }
	.fc-ask__opt[data-checked="true"] {
		border-color: rgba(139,233,253,0.5);
		background: rgba(139,233,253,0.08);
		color: #f8f8f2;
	}
	.fc-ask__check {
		width: 14px; height: 14px; border-radius: 3px;
		border: 1.5px solid rgba(98,114,164,0.6);
		display: inline-flex; align-items: center; justify-content: center;
		flex-shrink: 0;
	}
	.fc-ask__opt[data-checked="true"] .fc-ask__check {
		background: #8be9fd; border-color: #8be9fd;
	}
	.fc-ask__check svg {
		width: 10px; height: 10px; stroke: #21222c;
		fill: none; stroke-width: 2.5;
		visibility: hidden;
	}
	.fc-ask__opt[data-checked="true"] .fc-ask__check svg { visibility: visible; }
	.fc-ask__key {
		color: #8be9fd; font-weight: 600; font-size: 10.5px;
		border: 1px solid rgba(139,233,253,0.4);
		border-radius: 3px; padding: 0 4px;
		text-align: center; font-family: "JetBrains Mono", monospace;
	}
	.fc-ask__opt-label { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
	.fc-ask__opt-title { color: inherit; overflow: hidden; text-overflow: ellipsis; }
	.fc-ask__opt-sub {
		color: #6272a4; font-size: 10.5px;
		overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
		font-family: "JetBrains Mono", monospace;
	}
	.fc-ask__opt[data-checked="true"] .fc-ask__opt-sub { color: rgba(139,233,253,0.7); }
	.fc-ask__opt-tag {
		font-size: 10px; padding: 1px 6px; border-radius: 3px;
		background: rgba(98,114,164,0.15); color: #6272a4;
		font-family: "JetBrains Mono", monospace;
		white-space: nowrap;
	}
	.fc-ask__opt[data-checked="true"] .fc-ask__opt-tag {
		background: rgba(139,233,253,0.12); color: #8be9fd;
	}
	/* Radio variant for single-select askuser */
	.fc-ask__radio {
		width: 14px; height: 14px; border-radius: 50%;
		border: 1.5px solid rgba(98,114,164,0.6);
		display: inline-flex; align-items: center; justify-content: center;
		flex-shrink: 0;
	}
	.fc-ask__opt[data-checked="true"] .fc-ask__radio {
		border-color: #8be9fd;
	}
	.fc-ask__radio::after {
		content: ""; width: 7px; height: 7px; border-radius: 50%;
		background: #8be9fd; opacity: 0;
		transition: opacity 0.12s;
	}
	.fc-ask__opt[data-checked="true"] .fc-ask__radio::after { opacity: 1; }

	/* Notes / free-text area */
	.fc-ask__notes {
		display: flex; flex-direction: column; gap: 5px;
		margin-top: 10px;
	}
	.fc-ask__notes-label {
		color: #6272a4; font-size: 10px;
		letter-spacing: 0.08em; text-transform: uppercase;
		font-family: "JetBrains Mono", monospace;
	}
	.fc-ask__notes-input {
		background: rgba(0,0,0,0.28);
		border: 1px solid rgba(139,233,253,0.28);
		border-radius: 5px;
		padding: 7px 10px;
		color: #f8f8f2; font: inherit; font-size: 12.5px;
		outline: none; resize: vertical;
		min-height: 44px; max-height: 120px;
		font-family: -apple-system, "PingFang SC", sans-serif;
		line-height: 1.5;
	}
	.fc-ask__notes-input:focus { border-color: #8be9fd; }
	.fc-ask__notes-input::placeholder { color: #6272a4; }

	/* Footer with summary + buttons */
	.fc-ask__footer {
		display: flex; align-items: center; gap: 10px;
		margin-top: 12px; padding-top: 10px;
		border-top: 1px solid rgba(98,114,164,0.18);
	}
	.fc-ask__summary {
		flex: 1; color: #6272a4;
		font-family: "JetBrains Mono", monospace;
		font-size: 11px;
	}
	.fc-ask__summary b { color: #8be9fd; font-weight: 500; }
	.fc-ask__skip, .fc-ask__submit {
		border-radius: 5px; padding: 5px 12px;
		cursor: pointer; font: inherit;
		font-family: "JetBrains Mono", monospace;
		font-size: 11px; letter-spacing: 0.02em;
	}
	.fc-ask__skip {
		background: transparent; border: 1px solid rgba(98,114,164,0.3);
		color: #6272a4;
	}
	.fc-ask__skip:hover { border-color: rgba(98,114,164,0.5); color: #d0d3e0; }
	.fc-ask__submit {
		background: rgba(139,233,253,0.16); color: #8be9fd;
		border: 1px solid rgba(139,233,253,0.4);
	}
	.fc-ask__submit:hover { background: rgba(139,233,253,0.24); }
	.fc-ask__submit:disabled { opacity: 0.4; cursor: not-allowed; }

	/* ===== AskUser multi-question stepper ===== */
	.fc-ask__steps {
		display: flex; align-items: center; gap: 8px;
		margin-bottom: 10px;
		padding-bottom: 8px;
		border-bottom: 1px solid rgba(98,114,164,0.18);
		font-family: "JetBrains Mono", monospace;
	}
	.fc-ask__step {
		flex: 1; display: flex; flex-direction: column; gap: 4px;
		cursor: pointer;
		padding: 4px 8px; border-radius: 4px;
		transition: background 0.12s;
	}
	.fc-ask__step:hover { background: rgba(139,233,253,0.04); }
	.fc-ask__step-head { display: flex; align-items: center; gap: 6px; }
	.fc-ask__step-num {
		width: 16px; height: 16px; border-radius: 50%;
		border: 1px solid rgba(98,114,164,0.4);
		font-size: 9.5px; color: #6272a4; font-weight: 600;
		display: inline-flex; align-items: center; justify-content: center;
		flex-shrink: 0;
	}
	.fc-ask__step[data-state="active"] .fc-ask__step-num {
		border-color: #8be9fd; background: #8be9fd; color: #21222c;
	}
	.fc-ask__step[data-state="done"] .fc-ask__step-num {
		border-color: rgba(80,250,123,0.6);
		background: rgba(80,250,123,0.16); color: #50fa7b;
	}
	.fc-ask__step-title {
		font-size: 10px; color: #6272a4;
		letter-spacing: 0.04em;
		overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
	}
	.fc-ask__step[data-state="active"] .fc-ask__step-title { color: #f8f8f2; }
	.fc-ask__step[data-state="done"] .fc-ask__step-title { color: #50fa7b; }
	.fc-ask__step-track {
		height: 2px; border-radius: 2px;
		background: rgba(98,114,164,0.18);
	}
	.fc-ask__step[data-state="active"] .fc-ask__step-track { background: #8be9fd; }
	.fc-ask__step[data-state="done"] .fc-ask__step-track { background: rgba(80,250,123,0.6); }
	.fc-ask__step-sep { color: rgba(98,114,164,0.4); font-size: 12px; }

	.fc-ask__pager {
		display: flex; align-items: center; gap: 8px;
		color: #6272a4; font-family: "JetBrains Mono", monospace;
		font-size: 10.5px; letter-spacing: 0.04em;
	}
	.fc-ask__pager b { color: #8be9fd; font-weight: 500; }
	.fc-ask__nav-btn {
		background: transparent; border: 1px solid rgba(98,114,164,0.3);
		color: #6272a4; padding: 4px 8px; border-radius: 4px;
		cursor: pointer; font: inherit;
		font-family: "JetBrains Mono", monospace;
		font-size: 11px;
	}
	.fc-ask__nav-btn:hover:not(:disabled) { border-color: rgba(139,233,253,0.4); color: #8be9fd; }
	.fc-ask__nav-btn:disabled { opacity: 0.35; cursor: not-allowed; }

	/* Small demo toggle to switch popover state (design review only) */
	.fc-pop-toggle {
		position: fixed; top: 12px; right: 16px;
		z-index: 100;
		display: flex; gap: 4px; align-items: center;
		padding: 6px 8px;
		background: rgba(33,34,44,0.95);
		border: 1px solid rgba(98,114,164,0.3);
		border-radius: 6px;
		font-family: "JetBrains Mono", monospace;
		font-size: 10px;
		box-shadow: 0 4px 12px rgba(0,0,0,0.4);
	}
	.fc-pop-toggle__label {
		color: #6272a4; letter-spacing: 0.06em;
		text-transform: uppercase; padding-right: 4px;
		border-right: 1px solid rgba(98,114,164,0.25);
	}
	.fc-pop-toggle button {
		background: rgba(40,42,54,0.7);
		border: 1px solid rgba(98,114,164,0.3);
		color: #6272a4; padding: 3px 8px; border-radius: 3px;
		cursor: pointer; font: inherit;
	}
	.fc-pop-toggle button[data-on="true"][data-t="permission"] {
		border-color: rgba(255,121,198,0.5); color: #ff79c6;
		background: rgba(255,121,198,0.08);
	}
	.fc-pop-toggle button[data-on="true"][data-t="askuser"] {
		border-color: rgba(139,233,253,0.5); color: #8be9fd;
		background: rgba(139,233,253,0.08);
	}
	.fc-pop-toggle button[data-on="true"][data-t="none"] {
		border-color: rgba(98,114,164,0.5); color: #d0d3e0;
		background: rgba(98,114,164,0.15);
	}

	/* ===== Status bar ===== */
	.fc-status {
		flex-shrink: 0;
		border-top: 1px solid rgba(98,114,164,0.28);
		background: #21222c;
		padding: 5px 14px;
		display: flex; align-items: center;
		color: #6272a4;
		font-family: "JetBrains Mono", monospace;
		font-size: 11px; letter-spacing: 0.02em;
		white-space: nowrap; height: 30px;
	}
	.fc-status__group {
		display: inline-flex; align-items: center; gap: 10px;
		padding: 0 12px;
		border-right: 1px solid rgba(98,114,164,0.18);
	}
	.fc-status__group:first-child { padding-left: 0; }
	.fc-status__group:last-child { border-right: none; padding-right: 0; }
	.fc-status__mode {
		display: inline-flex; align-items: center; gap: 5px;
		padding: 1px 8px 1px 6px; border-radius: 3px;
		font-size: 10.5px; font-weight: 500; letter-spacing: 0.02em;
		text-transform: none;
	}
	.fc-status__mode-glyph { font-size: 9px; }
	/* mode risk tones — manual=cautious pink, default=neutral cyan, accept=fast green, plan=readonly purple */
	.fc-status__mode[data-mode="manual"]       { color:#ff79c6; background:rgba(255,121,198,0.1);  border:1px solid rgba(255,121,198,0.32); }
	.fc-status__mode[data-mode="default"]      { color:#8be9fd; background:rgba(139,233,253,0.08); border:1px solid rgba(139,233,253,0.28); }
	.fc-status__mode[data-mode="accept-edits"] { color:#50fa7b; background:rgba(80,250,123,0.08);  border:1px solid rgba(80,250,123,0.28); }
	.fc-status__mode[data-mode="plan"]         { color:#bd93f7; background:rgba(189,147,249,0.08); border:1px solid rgba(189,147,249,0.3);  }
	.fc-status__seg { display: inline-flex; align-items: center; gap: 5px; }
	.fc-status__label {
		color: #6272a4; font-size: 10px;
		letter-spacing: 0.06em; text-transform: uppercase;
	}
	.fc-status__val { color: #d0d3e0; }
	.fc-status__val--dim { color: #6272a4; }
	.fc-status__bar {
		width: 64px; height: 3px;
		background: rgba(98,114,164,0.22);
		border-radius: 2px; overflow: hidden;
	}
	.fc-status__pct { color: #d0d3e0; font-variant-numeric: tabular-nums; min-width: 26px; text-align: right; }
	.fc-status__pct[data-warn="true"] { color: #ffb86c; }
	.fc-status__pct[data-danger="true"] { color: #ff5555; }
	/* Donut context indicator — color tracks severity level */
	.fc-status__ctx { gap: 3px; }
	.fc-status__ctx .fc-status__pct { min-width: 0; text-align: left; }
	.fc-status__donut { display: inline-block; vertical-align: middle; }
	.fc-status__donut .fc-status__donut-track { stroke: rgba(98,114,164,0.28); }
	.fc-status__donut .fc-status__donut-fill  { transition: stroke-dasharray 0.3s, stroke 0.3s; stroke-linecap: butt; }
	.fc-status__donut[data-level="low"]  .fc-status__donut-fill { stroke: #6272a4; }
	.fc-status__donut[data-level="mid"]  .fc-status__donut-fill { stroke: #8be9fd; }
	.fc-status__donut[data-level="high"] .fc-status__donut-fill { stroke: #ffb86c; }
	.fc-status__donut[data-level="crit"] .fc-status__donut-fill { stroke: #ff5555; animation: fc-pulse-red 1.2s infinite; }
	.fc-status__seg[data-level="low"]  .fc-status__pct { color: #d0d3e0; }
	.fc-status__seg[data-level="mid"]  .fc-status__pct { color: #8be9fd; }
	.fc-status__seg[data-level="high"] .fc-status__pct { color: #ffb86c; }
	.fc-status__seg[data-level="crit"] .fc-status__pct { color: #ff5555; }
	@keyframes fc-pulse-red { 50% { opacity: 0.5; } }
	.fc-status__bar-fill {
		height: 100%;
		background: #50fa7b;
		border-radius: 2px;
		transition: width 0.3s;
	}
	.fc-status__bar-fill[data-warn="true"] { background: #ffb86c; }
	.fc-status__bar-fill[data-danger="true"] { background: #ff5555; }
	.fc-status__spacer { flex: 1; }
	.fc-status__cost { color: #f1fa8c; font-weight: 500; }
	.fc-status__branch { color: #8be9fd; display: inline-flex; align-items: center; gap: 6px; }
	.fc-status__branch svg { width: 12px; height: 12px; stroke: currentColor; fill: none; opacity: 0.85; }
	.fc-status__dirty { color: #ffb86c; font-size: 10px; padding: 0 4px; border-radius: 2px; background: rgba(255,184,108,0.1); }
	.fc-status__conn {
		display: inline-flex; align-items: center; gap: 5px;
		padding: 1px 8px; border-radius: 3px;
	}
	.fc-status__conn[data-tone="ok"]      { color: #50fa7b; background: rgba(80,250,123,0.1); border: 1px solid rgba(80,250,123,0.24); }
	.fc-status__conn[data-tone="running"] { color: #ffb86c; background: rgba(255,184,108,0.1); border: 1px solid rgba(255,184,108,0.28); }
	.fc-status__conn[data-tone="await"]   { color: #ff79c6; background: rgba(255,121,198,0.1); border: 1px solid rgba(255,121,198,0.32); }
	.fc-status__conn[data-tone="offline"] { color: #ff5555; background: rgba(255,85,85,0.1); border: 1px solid rgba(255,85,85,0.28); }
	.fc-status__dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; box-shadow: 0 0 6px currentColor; }
	.fc-status__conn[data-tone="await"] .fc-status__dot { animation: fc-pulse-pink 1.6s infinite; }
	.fc-status__conn[data-tone="running"] .fc-status__dot { animation: fc-blink 1.2s ease-in-out infinite; }
	@keyframes fc-blink { 50% { opacity: 0.35; } }
	`;
	document.head.appendChild(s);
}

// ==========================================================
// Small helpers
// ==========================================================
function Copy({ text, children }) {
	const [ok, setOk] = useState(false);
	return (
		<button
			className={`fc-code__copy${ok ? " success" : ""}`}
			onClick={() => {
				navigator.clipboard?.writeText(text);
				setOk(true);
				setTimeout(() => setOk(false), 1500);
			}}
		>
			{ok ? "✓ copied" : children || "copy"}
		</button>
	);
}

function CodeBlock({ lang, meta, code, showLines = true, tokens }) {
	const lines = code.split("\n");
	return (
		<div className={`fc-code${showLines ? "" : " fc-code--nolines"}`}>
			<div className="fc-code__hd">
				<span className="fc-code__lang" data-lang={lang}>
					{lang}
				</span>
				{meta && <span className="fc-code__meta">{meta}</span>}
				<Copy text={code} />
			</div>
			<div className="fc-code__body">
				{showLines && (
					<div className="fc-code__gutter">
						{lines.map((_, i) => (
							<div key={i}>{i + 1}</div>
						))}
					</div>
				)}
				<pre className="fc-code__pre">{tokens ?? code}</pre>
			</div>
		</div>
	);
}

// ==========================================================
// The complete conversation
// ==========================================================
function Tool({
	kind,
	title,
	arg,
	meta,
	warn,
	expandedByDefault = false,
	body,
	diff,
}) {
	const [open, setOpen] = useState(expandedByDefault);
	return (
		<div className="fc-tool-wrap">
			<div className="fc-tool" onClick={() => setOpen((o) => !o)}>
				<span className="fc-tool__caret">{open ? "▾" : "›"}</span>
				<span className="fc-tool__kind" data-k={kind}>
					{kind}
				</span>
				<span className="fc-tool__title">
					<code>{title}</code>
					{arg && ` ${arg}`}
				</span>
				<span className="fc-tool__meta" data-warn={warn}>
					{meta}
				</span>
			</div>
			{open && body && <div className="fc-tool-body">{body}</div>}
			{open && diff && (
				<div className="fc-diff">
					<div className="fc-diff__head">
						<span>diff</span>
						<span className="fc-diff__head-p">{diff.path}</span>
						<span className="fc-diff__head-stat">
							<span className="plus">+{diff.stats.plus}</span>{" "}
							<span className="minus">−{diff.stats.minus}</span>
						</span>
					</div>
					<div className="fc-diff__body">
						{diff.hunk.map((h, i) => (
							<div key={i} className="fc-diff__line" data-k={h.type}>
								<span className="fc-diff__line-num">{h.ln}</span>
								<span className="fc-diff__line-mark">
									{h.type === "add" ? "+" : h.type === "del" ? "−" : " "}
								</span>
								<span className="fc-diff__line-txt">{h.txt}</span>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

// Fake TS syntax highlighting for demo
function tsCode() {
	const T = (c, t) => <span className={c}>{t}</span>;
	return (
		<>
			{T("tok-comment", "// Confirm dialog copy — driven by session status")}
			<br />
			{T("tok-keyword", "export function")}{" "}
			{T("tok-fn", "confirmCloseAcpSessionMessage")}({T("tok-var", "status")}
			{T("tok-op", ":")} {T("tok-type", "SessionStatus")}){T("tok-op", ":")}{" "}
			{T("tok-type", "string")} {"{"}
			<br />
			{"  "}
			{T("tok-keyword", "if")} ({T("tok-var", "status")} {T("tok-op", "===")}{" "}
			{T("tok-string", '"running"')}) {"{"}
			<br />
			{"    "}
			{T("tok-keyword", "return")}{" "}
			{T("tok-string", '"Agent 正在运行,关闭会取消当前 turn。仍要关闭吗?"')}
			{T("tok-op", ";")}
			<br />
			{"  "}
			{"}"}
			<br />
			{"  "}
			{T("tok-keyword", "if")} ({T("tok-var", "status")} {T("tok-op", "===")}{" "}
			{T("tok-string", '"awaiting_permission"')}) {"{"}
			<br />
			{"    "}
			{T("tok-keyword", "return")}{" "}
			{T(
				"tok-string",
				'"Agent 正在等待你的授权,关闭将拒绝本次请求。仍要关闭吗?"',
			)}
			{T("tok-op", ";")}
			<br />
			{"  "}
			{"}"}
			<br />
			{"  "}
			{T("tok-keyword", "return")} {T("tok-string", '"Close this session?"')}
			{T("tok-op", ";")}
			<br />
			{"}"}
		</>
	);
}

// SVG donut for context usage — precise fill, threshold-tinted
function CtxDonut({ pct, size = 12, stroke = 2.5 }) {
	const r = (size - stroke) / 2;
	const c = 2 * Math.PI * r;
	const level =
		pct >= 90 ? "crit" : pct >= 80 ? "high" : pct >= 50 ? "mid" : "low";
	return (
		<svg
			className="fc-status__donut"
			data-level={level}
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
			aria-hidden
		>
			<circle
				cx={size / 2}
				cy={size / 2}
				r={r}
				fill="none"
				stroke="rgba(98,114,164,0.3)"
				strokeWidth={stroke}
			/>
			<circle
				cx={size / 2}
				cy={size / 2}
				r={r}
				fill="none"
				stroke="currentColor"
				strokeWidth={stroke}
				strokeDasharray={`${(c * pct) / 100} ${c}`}
				transform={`rotate(-90 ${size / 2} ${size / 2})`}
				strokeLinecap="butt"
			/>
		</svg>
	);
}

// Context usage variants for design review
function CtxVariantsPanel() {
	const levels = [
		{ pct: 6, used: "12.4k", left: "188k", label: "low" },
		{ pct: 45, used: "90k", left: "110k", label: "mid" },
		{ pct: 82, used: "164k", left: "36k", label: "high" },
		{ pct: 95, used: "190k", left: "10k", label: "critical" },
	];
	const tone = (p) =>
		p >= 90 ? "danger" : p >= 75 ? "warn" : p >= 50 ? "mid" : "ok";
	const donut = (p) => (p < 25 ? "◔" : p < 55 ? "◑" : p < 85 ? "◕" : "●");
	const dots = (p) => {
		const filled = Math.round(p / 10);
		return "●".repeat(filled) + "○".repeat(10 - filled);
	};
	const battery = (p) => {
		const filled = Math.round(p / 20);
		return "▮".repeat(filled) + "▯".repeat(5 - filled);
	};
	const variants = [
		{
			id: "A",
			name: "Dots · 10 段",
			render: (l) => (
				<span className="ctxv__mono" data-tone={tone(l.pct)}>
					{dots(l.pct)}
				</span>
			),
		},
		{
			id: "B",
			name: "Remaining 剩余",
			render: (l) => (
				<span className="ctxv__num" data-tone={tone(l.pct)}>
					{l.left}
					<span className="ctxv__unit"> left</span>
					{l.pct >= 90 && " ⚠"}
				</span>
			),
		},
		{
			id: "C",
			name: "Donut 圆环",
			render: (l) => (
				<span className="ctxv__donut" data-tone={tone(l.pct)}>
					{donut(l.pct)} <span className="ctxv__unit">{l.pct}%</span>
				</span>
			),
		},
		{
			id: "D",
			name: "Percent 纯数",
			render: (l) => (
				<span className="ctxv__num" data-tone={tone(l.pct)}>
					{l.pct}%
				</span>
			),
		},
		{
			id: "E",
			name: "Battery 5 格",
			render: (l) => (
				<span className="ctxv__mono" data-tone={tone(l.pct)}>
					{battery(l.pct)}
				</span>
			),
		},
		{
			id: "F",
			name: "Bracket meter",
			render: (l) => {
				const w = 10,
					filled = Math.round((l.pct / 100) * w);
				return (
					<span className="ctxv__mono" data-tone={tone(l.pct)}>
						[{"▮".repeat(filled)}
						{"·".repeat(w - filled)}]
					</span>
				);
			},
		},
	];
	return (
		<div className="ctxv">
			<div className="ctxv__title">
				Context indicator · 6 variants × 4 levels · no <code>CTX</code> label
			</div>
			<div className="ctxv__grid">
				<div className="ctxv__col ctxv__col--head" />
				{levels.map((l) => (
					<div key={l.label} className="ctxv__col ctxv__col--head">
						<span className="ctxv__pct">{l.pct}%</span>
						<span className="ctxv__lvl">{l.label}</span>
					</div>
				))}
				{variants.map((v) => (
					<React.Fragment key={v.id}>
						<div className="ctxv__col ctxv__col--name">
							<span className="ctxv__id">{v.id}</span>
							<span>{v.name}</span>
						</div>
						{levels.map((l) => (
							<div key={l.label} className="ctxv__col ctxv__cell">
								{v.render(l)}
							</div>
						))}
					</React.Fragment>
				))}
			</div>
		</div>
	);
}

function App() {
	const [popType, setPopType] = React.useState("permission"); // "permission" | "askuser" | "none"
	const [askMode, setAskMode] = React.useState("multi"); // "multi" | "single" | "text" | "multiq"
	const askOptions = [
		{
			id: "tests",
			key: "1",
			title: "更新对应的单元测试用例",
			sub: "confirmCloseAcpSession.test.ts",
			tag: "testing",
		},
		{
			id: "stories",
			key: "2",
			title: "更新 Storybook 的展示",
			sub: "ConfirmCloseDialog.stories.tsx",
			tag: "stories",
		},
		{
			id: "changelog",
			key: "3",
			title: "在 CHANGELOG 中记录",
			sub: "CHANGELOG.md · Unreleased",
			tag: "changelog",
		},
		{
			id: "docs",
			key: "4",
			title: "同步更新中文文档",
			sub: "docs/zh/acp-session.md",
			tag: "docs",
		},
	];
	const singleOptions = [
		{
			id: "keep",
			key: "1",
			title: "保留 English 原文,只加中文注释",
			sub: "最保守",
			tag: "safest",
		},
		{
			id: "bilingual",
			key: "2",
			title: "英中双语并列,用 · 分隔",
			sub: "折中方案",
			tag: "middle",
		},
		{
			id: "zh-only",
			key: "3",
			title: "完全替换成中文,原文放 i18n 兜底",
			sub: "最激进",
			tag: "aggressive",
		},
	];
	const [multiChecked, setMultiChecked] = React.useState(
		() => new Set(["tests"]),
	);
	const [singleChecked, setSingleChecked] = React.useState("bilingual");
	const toggleMulti = (id) =>
		setMultiChecked((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});

	// Multi-question stepper state
	const questions = [
		{
			id: "strategy",
			label: "翻译策略",
			kind: "single",
			q: (
				<>
					改写 <code>confirmCloseAcpSession.ts</code> 有
					<b style={{ color: "#8be9fd" }}>三种</b>翻译策略,你更倾向哪一种?
				</>
			),
			options: singleOptions,
		},
		{
			id: "extras",
			label: "顺带改动",
			kind: "multi",
			q: (
				<>
					确定策略后,还希望我<b style={{ color: "#8be9fd" }}>同时</b>
					处理下面哪些相关改动?
				</>
			),
			options: askOptions,
		},
		{
			id: "tone",
			label: "文案语气",
			kind: "text",
			q: (
				<>
					能否描述一下 <code>awaiting_permission</code>{" "}
					状态下的期望文案风格?正式?随和?
				</>
			),
		},
	];
	const [qIndex, setQIndex] = React.useState(0);
	const [qAnswers, setQAnswers] = React.useState({
		strategy: "bilingual",
		extras: new Set(["tests"]),
		tone: "",
	});
	const currentQ = questions[qIndex];
	const isAnswered = (i) => {
		const q = questions[i],
			a = qAnswers[q.id];
		if (q.kind === "single") return !!a;
		if (q.kind === "multi") return a && a.size > 0;
		if (q.kind === "text") return a && a.trim().length > 0;
		return false;
	};
	const stepState = (i) =>
		i === qIndex ? "active" : isAnswered(i) ? "done" : "pending";
	const setSingleAnswer = (id) =>
		setQAnswers((a) => ({ ...a, [currentQ.id]: id }));
	const toggleMultiAnswer = (id) =>
		setQAnswers((a) => {
			const prev = a[currentQ.id] || new Set();
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return { ...a, [currentQ.id]: next };
		});
	const setTextAnswer = (v) => setQAnswers((a) => ({ ...a, [currentQ.id]: v }));
	return (
		<>
			{/* Demo-only toggle — fixed to viewport so it can't be covered */}
			<div className="fc-pop-toggle">
				<span className="fc-pop-toggle__label">弹窗</span>
				<button
					data-t="permission"
					data-on={popType === "permission"}
					onClick={() => setPopType("permission")}
				>
					Permission
				</button>
				<button
					data-t="askuser"
					data-on={popType === "askuser" && askMode === "multi"}
					onClick={() => {
						setPopType("askuser");
						setAskMode("multi");
					}}
				>
					AskUser · 多选
				</button>
				<button
					data-t="askuser"
					data-on={popType === "askuser" && askMode === "single"}
					onClick={() => {
						setPopType("askuser");
						setAskMode("single");
					}}
				>
					AskUser · 单选
				</button>
				<button
					data-t="askuser"
					data-on={popType === "askuser" && askMode === "text"}
					onClick={() => {
						setPopType("askuser");
						setAskMode("text");
					}}
				>
					AskUser · 纯文本
				</button>
				<button
					data-t="askuser"
					data-on={popType === "askuser" && askMode === "multiq"}
					onClick={() => {
						setPopType("askuser");
						setAskMode("multiq");
					}}
				>
					AskUser · 多问题
				</button>
				<button
					data-t="none"
					data-on={popType === "none"}
					onClick={() => setPopType("none")}
				>
					关闭
				</button>
			</div>
			<div className="fc-topbar">
				<span className="glyph">◆</span>
				<span className="title">
					Superset · ACP Session Pane · <b>Final Design</b>
				</span>
				<span className="dim">
					V03 chat bubble · Plan A · Markdown/Code · Dracula
				</span>
			</div>
			<CtxVariantsPanel />
			<div className="fc-stage">
				<div className="fc-frame">
					{/* ===== Toolbar ===== */}
					<div className="fc-toolbar">
						<span className="fc-chip">Claude Code</span>
						<span className="fc-toolbar__title">改中文关闭提示</span>
						<span className="fc-toolbar__spacer" />
						<div className="fc-toolbar__actions">
							<button title="Split">
								<svg viewBox="0 0 16 16">
									<rect x="1.5" y="2.5" width="6" height="11" rx="1" />
									<rect x="8.5" y="2.5" width="6" height="11" rx="1" />
								</svg>
							</button>
							<button title="Close">
								<svg
									viewBox="0 0 16 16"
									strokeWidth="1.4"
									strokeLinecap="round"
								>
									<path d="M3 3l10 10M13 3L3 13" />
								</svg>
							</button>
						</div>
					</div>

					{/* ===== Body ===== */}
					<div className="fc-body">
						<div className="fc-turns">
							{/* User msg */}
							<div className="fc-msg" data-role="user">
								<div className="fc-msg__author">You</div>
								<div className="fc-msg__bubble">
									把 ACP session pane 关闭时的确认提示改成中文,并且区分 running
									和 awaiting_permission 两种状态的措辞。
								</div>
							</div>

							{/* Thought */}
							<div className="fc-msg" data-role="thought">
								<div className="fc-msg__bubble">
									先找一下关闭 pane 的入口逻辑,看看当前是怎么区分 idle / running
									的。
								</div>
							</div>

							{/* Tools */}
							<Tool
								kind="search"
								title="grep"
								arg='"confirmCloseAcpSession"'
								meta="3 matches · 148ms"
								expandedByDefault
								body={`V1PanesWorkspace/confirmCloseAcpSession.ts:12
V1PanesWorkspace/useV1PanesWorkspace.tsx:184
V1PanesWorkspace/useV1PanesWorkspace.tsx:210`}
							/>
							<Tool
								kind="read"
								title="Read"
								arg="confirmCloseAcpSession.ts"
								meta="52 lines · 82ms"
							/>

							{/* Agent msg with markdown */}
							<div className="fc-msg" data-role="agent">
								<div className="fc-msg__author">Claude</div>
								<div className="fc-msg__bubble fc-md">
									<h3>找到了入口</h3>
									<p>
										关闭确认逻辑集中在 <code>confirmCloseAcpSession.ts</code>
										。当前是一个纯 English 字符串,没有区分状态。我准备:
									</p>
									<ol>
										<li>
											把返回值改成基于 <code>status</code> 分支的中文
										</li>
										<li>
											更新对应 pane <em>关闭测试</em> 的期望文案
										</li>
										<li>
											跑 <strong>typecheck</strong> + lint 确保没有破坏引用
										</li>
									</ol>
									<CodeBlock
										lang="typescript"
										meta="confirmCloseAcpSession.ts · after change"
										code={`export function confirmCloseAcpSessionMessage(status: SessionStatus): string {
  if (status === "running") {
    return "Agent 正在运行,关闭会取消当前 turn。仍要关闭吗?";
  }
  if (status === "awaiting_permission") {
    return "Agent 正在等待你的授权,关闭将拒绝本次请求。仍要关闭吗?";
  }
  return "Close this session?";
}`}
										tokens={tsCode()}
									/>
								</div>
							</div>

							{/* Plan A */}
							<div className="fc-plan">
								<div className="fc-plan__head">
									<span className="fc-plan__title">◫ Plan</span>
									<span className="fc-plan__count">
										<b>1</b> of 4 done · <b>1</b> in progress
									</span>
									<span className="fc-plan__progress">
										<span
											className="fc-plan__progress-fill"
											style={{ width: "85%" }}
										/>
									</span>
								</div>
								<div className="fc-plan__items">
									<div className="fc-plan__item" data-s="completed">
										<span className="fc-plan__dot" />
										<span className="fc-plan__txt">
											定位所有关闭 pane 的确认入口
										</span>
									</div>
									<div className="fc-plan__item" data-s="in_progress">
										<span className="fc-plan__dot" />
										<span className="fc-plan__txt">
											改写英文提示为中文,区分 running / awaiting
										</span>
									</div>
									<div className="fc-plan__item" data-s="pending">
										<span className="fc-plan__dot" />
										<span className="fc-plan__txt">更新对应 pane 测试用例</span>
									</div>
									<div className="fc-plan__item" data-s="pending">
										<span className="fc-plan__dot" />
										<span className="fc-plan__txt">跑 typecheck + lint</span>
									</div>
								</div>
							</div>

							{/* Edit tool with diff, awaiting */}
							<Tool
								kind="edit"
								title="Edit"
								arg="confirmCloseAcpSession.ts · L17-L20"
								meta="blocked on permission"
								warn
								expandedByDefault
								diff={{
									path: "confirmCloseAcpSession.ts",
									stats: { plus: 2, minus: 2 },
									hunk: [
										{
											type: "ctx",
											ln: 16,
											txt: '  if (status === "running") {',
										},
										{
											type: "del",
											ln: 17,
											txt: '    return "Agent is running. Closing will cancel the current turn. Close anyway?";',
										},
										{
											type: "add",
											ln: 17,
											txt: '    return "Agent 正在运行,关闭会取消当前 turn。仍要关闭吗?";',
										},
										{ type: "ctx", ln: 18, txt: "  }" },
										{
											type: "ctx",
											ln: 19,
											txt: '  if (status === "awaiting_permission") {',
										},
										{
											type: "del",
											ln: 20,
											txt: '    return "Agent is awaiting your approval. Close?";',
										},
										{
											type: "add",
											ln: 20,
											txt: '    return "Agent 正在等待你的授权,关闭将拒绝本次请求。仍要关闭吗?";',
										},
										{ type: "ctx", ln: 21, txt: "  }" },
									],
								}}
							/>
						</div>
					</div>

					{/* ===== Composer with floating popover (permission or askuser) ===== */}
					<div className="fc-perm-pop-wrap">
						{popType === "permission" && (
							<div
								className="fc-perm-pop"
								data-type="permission"
								role="alertdialog"
								aria-modal="true"
								aria-label="Permission required"
							>
								<div className="fc-perm-pop__head">
									<span className="fc-perm-pop__pulse" />
									<span>Permission required · Edit</span>
									<span className="fc-perm-pop__lock" title="必须响应,不能关闭">
										<svg viewBox="0 0 16 16">
											<rect
												x="3.5"
												y="7"
												width="9"
												height="6.5"
												rx="1"
												strokeWidth="1.3"
											/>
											<path
												d="M5.5 7V5a2.5 2.5 0 015 0v2"
												strokeWidth="1.3"
												fill="none"
											/>
										</svg>
										blocking
									</span>
								</div>
								<div className="fc-perm-pop__q">
									Claude 想编辑 <code>confirmCloseAcpSession.ts</code> —— 2
									处替换,+2 −2 行。
								</div>
								<div className="fc-perm-pop__opts">
									<button className="fc-perm-pop__opt" data-k="allow">
										<span className="fc-perm-pop__key">1</span>
										<span>Allow once</span>
										<span className="fc-perm-pop__hint">本次</span>
									</button>
									<button className="fc-perm-pop__opt" data-k="session">
										<span className="fc-perm-pop__key">2</span>
										<span>Allow for session</span>
										<span className="fc-perm-pop__hint">本会话</span>
									</button>
									<button className="fc-perm-pop__opt" data-k="reject">
										<span className="fc-perm-pop__key">3</span>
										<span>Reject once</span>
										<span className="fc-perm-pop__hint">本次拒绝</span>
									</button>
									<button className="fc-perm-pop__opt" data-k="never">
										<span className="fc-perm-pop__key">4</span>
										<span>Never for session</span>
										<span className="fc-perm-pop__hint">永久拒绝</span>
									</button>
								</div>
							</div>
						)}

						{popType === "askuser" && (
							<div
								className="fc-perm-pop"
								data-type="askuser"
								role="alertdialog"
								aria-modal="true"
								aria-label="Agent is asking a question"
							>
								<div className="fc-perm-pop__head">
									<span className="fc-perm-pop__pulse" />
									<span>
										Agent asking · AskUser
										<span
											style={{
												color: "#6272a4",
												marginLeft: 6,
												letterSpacing: 0,
											}}
										>
											{askMode === "multi" && "· 多选"}
											{askMode === "single" && "· 单选"}
											{askMode === "text" && "· 纯文本"}
											{askMode === "multiq" &&
												`· 多问题 (${qIndex + 1}/${questions.length})`}
										</span>
									</span>
									<span className="fc-perm-pop__lock" title="必须回答,不能关闭">
										<svg viewBox="0 0 16 16">
											<rect
												x="3.5"
												y="7"
												width="9"
												height="6.5"
												rx="1"
												strokeWidth="1.3"
											/>
											<path
												d="M5.5 7V5a2.5 2.5 0 015 0v2"
												strokeWidth="1.3"
												fill="none"
											/>
										</svg>
										blocking
									</span>
								</div>

								{askMode === "multi" && (
									<>
										<div className="fc-perm-pop__q">
											我准备把 <code>confirmCloseAcpSession.ts</code>{" "}
											的英文提示改成中文。你希望我
											<b style={{ color: "#8be9fd" }}>同时</b>
											处理下面哪些相关改动?
										</div>
										<div className="fc-ask__hint">
											<span>
												可 <b>多选</b> · 数字键 1-4 快捷勾选 ·
												也可直接输入补充说明
											</span>
										</div>
										<div className="fc-ask__list">
											{askOptions.map((o) => (
												<button
													key={o.id}
													className="fc-ask__opt"
													data-checked={multiChecked.has(o.id)}
													onClick={() => toggleMulti(o.id)}
												>
													<span className="fc-ask__check">
														<svg viewBox="0 0 16 16">
															<path
																d="M3.5 8.5l3 3 6-7"
																strokeLinecap="round"
																strokeLinejoin="round"
															/>
														</svg>
													</span>
													<span className="fc-ask__key">{o.key}</span>
													<span className="fc-ask__opt-label">
														<span className="fc-ask__opt-title">{o.title}</span>
														<span className="fc-ask__opt-sub">{o.sub}</span>
													</span>
													<span className="fc-ask__opt-tag">{o.tag}</span>
												</button>
											))}
										</div>
										<div className="fc-ask__notes">
											<label className="fc-ask__notes-label">
												补充说明 · 可选
											</label>
											<textarea
												className="fc-ask__notes-input"
												placeholder="例如:测试请一起把 awaiting_permission 的分支也覆盖到……"
												rows={2}
											/>
										</div>
										<div className="fc-ask__footer">
											<span className="fc-ask__summary">
												已选 <b>{multiChecked.size}</b> / {askOptions.length} 项
												{multiChecked.size === 0 && " · 也可只填补充说明"}
											</span>
											<button className="fc-ask__skip">Skip</button>
											<button className="fc-ask__submit">Submit ⏎</button>
										</div>
									</>
								)}

								{askMode === "single" && (
									<>
										<div className="fc-perm-pop__q">
											改写 <code>confirmCloseAcpSession.ts</code> 有
											<b style={{ color: "#8be9fd" }}>三种</b>
											翻译策略,你更倾向哪一种?
										</div>
										<div className="fc-ask__hint">
											<span>
												<b>单选</b> · 数字键 1-3 快捷选中 · 也可直接输入补充说明
											</span>
										</div>
										<div className="fc-ask__list">
											{singleOptions.map((o) => (
												<button
													key={o.id}
													className="fc-ask__opt"
													data-checked={singleChecked === o.id}
													onClick={() => setSingleChecked(o.id)}
												>
													<span className="fc-ask__radio" />
													<span className="fc-ask__key">{o.key}</span>
													<span className="fc-ask__opt-label">
														<span className="fc-ask__opt-title">{o.title}</span>
														<span className="fc-ask__opt-sub">{o.sub}</span>
													</span>
													<span className="fc-ask__opt-tag">{o.tag}</span>
												</button>
											))}
										</div>
										<div className="fc-ask__notes">
											<label className="fc-ask__notes-label">
												补充说明 · 可选
											</label>
											<textarea
												className="fc-ask__notes-input"
												placeholder="例如:如果选双语,分隔符请用 / 而不是 ·"
												rows={2}
											/>
										</div>
										<div className="fc-ask__footer">
											<span className="fc-ask__summary">
												已选{" "}
												<b>
													{singleOptions.find((o) => o.id === singleChecked)
														?.title || "无"}
												</b>
											</span>
											<button className="fc-ask__skip">Skip</button>
											<button className="fc-ask__submit">Submit ⏎</button>
										</div>
									</>
								)}

								{askMode === "text" && (
									<>
										<div className="fc-perm-pop__q">
											能否描述一下 <code>awaiting_permission</code>{" "}
											状态下的期望文案风格?我需要知道语气偏正式还是随和,以便统一整体表达。
										</div>
										<div className="fc-ask__hint">
											<span>
												需要你的<b>文字回答</b> · Enter 发送,Shift+Enter 换行
											</span>
										</div>
										<div className="fc-ask__notes" style={{ marginTop: 0 }}>
											<textarea
												className="fc-ask__notes-input"
												placeholder="在这里输入你的回答……"
												rows={4}
												style={{ minHeight: 88 }}
												defaultValue=""
											/>
										</div>
										<div className="fc-ask__footer">
											<span className="fc-ask__summary">
												<b style={{ color: "#8be9fd" }}>纯文本</b> 回答 ·
												无预设选项
											</span>
											<button className="fc-ask__skip">Skip</button>
											<button className="fc-ask__submit">Send ⏎</button>
										</div>
									</>
								)}

								{askMode === "multiq" && (
									<>
										{/* Stepper header */}
										<div className="fc-ask__steps">
											{questions.map((q, i) => (
												<React.Fragment key={q.id}>
													<div
														className="fc-ask__step"
														data-state={stepState(i)}
														onClick={() => setQIndex(i)}
													>
														<div className="fc-ask__step-head">
															<span className="fc-ask__step-num">
																{stepState(i) === "done" ? "✓" : i + 1}
															</span>
															<span className="fc-ask__step-title">
																{q.label}
															</span>
														</div>
														<div className="fc-ask__step-track" />
													</div>
													{i < questions.length - 1 && (
														<span className="fc-ask__step-sep">›</span>
													)}
												</React.Fragment>
											))}
										</div>

										{/* Current question */}
										<div className="fc-perm-pop__q">{currentQ.q}</div>
										<div className="fc-ask__hint">
											<span>
												问题 <b>{qIndex + 1}</b> / {questions.length} ·{" "}
												{currentQ.kind === "single" && "单选"}
												{currentQ.kind === "multi" && "多选"}
												{currentQ.kind === "text" && "文字回答"}
												{" · 完成后可回到任意步骤修改"}
											</span>
										</div>

										{currentQ.kind === "single" && (
											<div className="fc-ask__list">
												{currentQ.options.map((o) => (
													<button
														key={o.id}
														className="fc-ask__opt"
														data-checked={qAnswers[currentQ.id] === o.id}
														onClick={() => setSingleAnswer(o.id)}
													>
														<span className="fc-ask__radio" />
														<span className="fc-ask__key">{o.key}</span>
														<span className="fc-ask__opt-label">
															<span className="fc-ask__opt-title">
																{o.title}
															</span>
															<span className="fc-ask__opt-sub">{o.sub}</span>
														</span>
														<span className="fc-ask__opt-tag">{o.tag}</span>
													</button>
												))}
											</div>
										)}

										{currentQ.kind === "multi" && (
											<div className="fc-ask__list">
												{currentQ.options.map((o) => (
													<button
														key={o.id}
														className="fc-ask__opt"
														data-checked={(
															qAnswers[currentQ.id] || new Set()
														).has(o.id)}
														onClick={() => toggleMultiAnswer(o.id)}
													>
														<span className="fc-ask__check">
															<svg viewBox="0 0 16 16">
																<path
																	d="M3.5 8.5l3 3 6-7"
																	strokeLinecap="round"
																	strokeLinejoin="round"
																/>
															</svg>
														</span>
														<span className="fc-ask__key">{o.key}</span>
														<span className="fc-ask__opt-label">
															<span className="fc-ask__opt-title">
																{o.title}
															</span>
															<span className="fc-ask__opt-sub">{o.sub}</span>
														</span>
														<span className="fc-ask__opt-tag">{o.tag}</span>
													</button>
												))}
											</div>
										)}

										{currentQ.kind === "text" && (
											<div className="fc-ask__notes" style={{ marginTop: 0 }}>
												<textarea
													className="fc-ask__notes-input"
													placeholder="在这里输入你的回答……"
													rows={4}
													style={{ minHeight: 88 }}
													value={qAnswers[currentQ.id] || ""}
													onChange={(e) => setTextAnswer(e.target.value)}
												/>
											</div>
										)}

										<div className="fc-ask__footer">
											<div className="fc-ask__pager">
												<button
													className="fc-ask__nav-btn"
													disabled={qIndex === 0}
													onClick={() => setQIndex((i) => Math.max(0, i - 1))}
												>
													‹ 上一题
												</button>
												<span>
													<b>{qIndex + 1}</b> / {questions.length}
												</span>
												<button
													className="fc-ask__nav-btn"
													disabled={qIndex === questions.length - 1}
													onClick={() =>
														setQIndex((i) =>
															Math.min(questions.length - 1, i + 1),
														)
													}
												>
													下一题 ›
												</button>
											</div>
											<span
												className="fc-ask__summary"
												style={{ textAlign: "right" }}
											>
												{questions.filter((_, i) => isAnswered(i)).length} /{" "}
												{questions.length} 已作答
											</span>
											<button className="fc-ask__skip">Skip all</button>
											<button
												className="fc-ask__submit"
												disabled={questions.some((_, i) => !isAnswered(i))}
											>
												Submit all ⏎
											</button>
										</div>
									</>
								)}
							</div>
						)}

						<div className="fc-composer">
							<div className="fc-composer__box">
								<span className="fc-composer__glyph">›</span>
								<textarea
									className="fc-composer__input"
									placeholder="Type a follow-up…"
									rows={1}
									onInput={(e) => {
										const el = e.target;
										el.style.height = "auto";
										el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
									}}
								/>
								<button className="fc-composer__send">Send ⏎</button>
							</div>
						</div>
					</div>

					{/* ===== Status bar ===== */}
					<div className="fc-status">
						{/* Group 1: identity — mode + model */}
						<span className="fc-status__group">
							<span
								className="fc-status__mode"
								data-mode="manual"
								title="Permission mode: every tool call requires approval"
							>
								<span className="fc-status__mode-glyph">◐</span>
								<span>manual</span>
							</span>
							<span className="fc-status__seg">
								<span className="fc-status__val">sonnet-4.5</span>
							</span>
						</span>

						{/* Group 2: usage — donut */}
						<span className="fc-status__group">
							<span
								className="fc-status__seg fc-status__ctx"
								data-level="low"
								title="Context: 12,400 / 200,000 tokens (6%)"
							>
								<CtxDonut pct={6} />
								<span className="fc-status__pct">6%</span>
							</span>
						</span>

						<span className="fc-status__spacer" />

						{/* Group 3: workspace — branch + dirty */}
						<span className="fc-status__group">
							<span
								className="fc-status__branch"
								title="Branch: feat/acp-agent-control-plane · 9 uncommitted"
							>
								<svg viewBox="0 0 16 16" aria-hidden>
									<circle cx="4" cy="3" r="1.5" strokeWidth="1.3" />
									<circle cx="4" cy="13" r="1.5" strokeWidth="1.3" />
									<circle cx="12" cy="6" r="1.5" strokeWidth="1.3" />
									<path d="M4 4.5v7" strokeWidth="1.3" />
									<path
										d="M4 8c0-1.5 1-2 2.5-2H10.5"
										strokeWidth="1.3"
										strokeLinecap="round"
									/>
								</svg>
								<span>acp-agent-control-plane</span>
								<span className="fc-status__dirty">+9</span>
							</span>
						</span>

						{/* Group 4: connection */}
						<span className="fc-status__group">
							<span
								className="fc-status__conn"
								data-tone="await"
								title="Session waiting for permission"
							>
								<span className="fc-status__dot" />
								<span>awaiting</span>
							</span>
						</span>
					</div>
					{/* /fc-status */}
				</div>
				{/* /fc-frame */}
			</div>
		</>
	);
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
