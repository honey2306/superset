/* @ds-bundle: {"format":3,"namespace":"SupersetDesignSystem_91a6da","components":[{"name":"Badge","sourcePath":"components/core/Badge/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button/Button.jsx"},{"name":"Chip","sourcePath":"components/core/Chip/Chip.jsx"},{"name":"Icon","sourcePath":"components/core/Icon/Icon.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton/IconButton.jsx"},{"name":"Kbd","sourcePath":"components/core/Kbd/Kbd.jsx"},{"name":"Pill","sourcePath":"components/core/Pill/Pill.jsx"},{"name":"Tag","sourcePath":"components/core/Tag/Tag.jsx"},{"name":"ConfirmCard","sourcePath":"components/feedback/ConfirmCard/ConfirmCard.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast/Toast.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox/Checkbox.jsx"},{"name":"Input","sourcePath":"components/forms/Input/Input.jsx"},{"name":"SegmentedControl","sourcePath":"components/forms/SegmentedControl/SegmentedControl.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch/Switch.jsx"},{"name":"FileRow","sourcePath":"components/navigation/FileRow/FileRow.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs/Tabs.jsx"},{"name":"WorkspaceItem","sourcePath":"components/navigation/WorkspaceItem/WorkspaceItem.jsx"},{"name":"ContextMenu","sourcePath":"components/overlays/ContextMenu/ContextMenu.jsx"},{"name":"MenuHeading","sourcePath":"components/overlays/ContextMenu/ContextMenu.jsx"},{"name":"MenuSep","sourcePath":"components/overlays/ContextMenu/ContextMenu.jsx"},{"name":"MenuGroup","sourcePath":"components/overlays/ContextMenu/ContextMenu.jsx"},{"name":"MenuItem","sourcePath":"components/overlays/ContextMenu/ContextMenu.jsx"},{"name":"Popover","sourcePath":"components/overlays/Popover/Popover.jsx"},{"name":"PopoverHeader","sourcePath":"components/overlays/Popover/Popover.jsx"},{"name":"PopoverGroup","sourcePath":"components/overlays/Popover/Popover.jsx"},{"name":"PopoverRow","sourcePath":"components/overlays/Popover/Popover.jsx"},{"name":"PopoverSep","sourcePath":"components/overlays/Popover/Popover.jsx"},{"name":"PopoverHint","sourcePath":"components/overlays/Popover/Popover.jsx"}],"sourceHashes":{"app.jsx":"8bce227006d3","components/core/Badge/Badge.jsx":"39130c4af1cb","components/core/Button/Button.jsx":"5d7471a0dfd0","components/core/Chip/Chip.jsx":"fc5ec5d4bf25","components/core/Icon/Icon.jsx":"522ddd192e72","components/core/IconButton/IconButton.jsx":"af4cc38d9dfd","components/core/Kbd/Kbd.jsx":"91ff82673730","components/core/Pill/Pill.jsx":"b825841ed948","components/core/Tag/Tag.jsx":"95d1598e7020","components/feedback/ConfirmCard/ConfirmCard.jsx":"dbe4552667ab","components/feedback/Toast/Toast.jsx":"f848577aff18","components/forms/Checkbox/Checkbox.jsx":"520dc7f6a910","components/forms/Input/Input.jsx":"45b796581632","components/forms/SegmentedControl/SegmentedControl.jsx":"cf1e17837c0b","components/forms/Switch/Switch.jsx":"3366628b4439","components/navigation/FileRow/FileRow.jsx":"466f20b14bc1","components/navigation/Tabs/Tabs.jsx":"f614640074e1","components/navigation/WorkspaceItem/WorkspaceItem.jsx":"987dceb4a295","components/overlays/ContextMenu/ContextMenu.jsx":"f741ef8103f6","components/overlays/Popover/Popover.jsx":"4fd75af89da8","icons.jsx":"25140872a087","preview.jsx":"11e3fb903bc6","ui_kits/desktop-app/app.jsx":"3a9ce84f6130"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {
	const __ds_ns = (window.SupersetDesignSystem_91a6da =
		window.SupersetDesignSystem_91a6da || {});

	const __ds_scope = {};

	__ds_ns.__errors = __ds_ns.__errors || [];

	// app.jsx
	try {
		(() => {
			// Superset Design System — full app shell demo.
			// Uses everything in components.css + app.css + tokens.

			const WORKSPACES = [
				{
					id: "wf1",
					name: "feat/kro-suite",
					state: "running",
					meta: "3m",
					active: true,
				},
				{
					id: "wf2",
					name: "bugfix/reap-legacy-orphans",
					state: "ok",
					meta: "2d",
				},
				{
					id: "wf3",
					name: "backup/pre-filter-kro-suite",
					state: "idle",
					meta: "5h",
				},
				{
					id: "wf4",
					name: "feat/browser-extension-bridge",
					state: "warn",
					meta: "4d",
				},
				{
					id: "wf5",
					name: "electron-final",
					state: "err",
					meta: "3d",
				},
			];
			const BATCHED = [
				{
					id: "b1",
					name: "chore/deps-2026-08",
					state: "ok",
					meta: "1w",
				},
				{
					id: "b2",
					name: "release/2026-08",
					state: "idle",
					meta: "1w",
				},
			];
			function StatusDot({ state }) {
				const map = {
					running: "",
					ok: "ok",
					err: "err",
					warn: "",
					idle: "idle",
				};
				return /*#__PURE__*/ React.createElement("span", {
					className: `status-dot ${map[state] ?? ""}`,
				});
			}
			function WinChrome() {
				return /*#__PURE__*/ React.createElement(
					"div",
					{
						className: "win-chrome",
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "lights",
						},
						/*#__PURE__*/ React.createElement("span", {
							className: "light r",
						}),
						/*#__PURE__*/ React.createElement("span", {
							className: "light y",
						}),
						/*#__PURE__*/ React.createElement("span", {
							className: "light g",
						}),
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "mono faint",
								style: {
									marginLeft: "var(--s-6)",
									fontSize: "var(--fs-10)",
								},
							},
							"wufan \xB7 superset",
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "tabs-strip",
						},
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "win-tab is-active",
							},
							/*#__PURE__*/ React.createElement(IconBranch, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "name",
								},
								"feat/kro-suite",
							),
							/*#__PURE__*/ React.createElement("span", {
								className: "dot",
								title: "unsaved",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "close",
								},
								/*#__PURE__*/ React.createElement(IconX, {
									size: 10,
								}),
							),
						),
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "win-tab",
							},
							/*#__PURE__*/ React.createElement(IconBranch, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "name",
								},
								"bugfix/reap-legacy-orphans",
							),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "close",
								},
								/*#__PURE__*/ React.createElement(IconX, {
									size: 10,
								}),
							),
						),
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "win-tab",
							},
							/*#__PURE__*/ React.createElement(IconBranch, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "name",
								},
								"chore/deps-2026-08",
							),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "close",
								},
								/*#__PURE__*/ React.createElement(IconX, {
									size: 10,
								}),
							),
						),
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "icon-btn",
								title: "New tab",
							},
							/*#__PURE__*/ React.createElement(IconPlus, null),
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "win-actions",
						},
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "chip",
							},
							/*#__PURE__*/ React.createElement(IconSpark, null),
							/*#__PURE__*/ React.createElement("span", null, "Opus 5"),
						),
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "icon-btn",
							},
							/*#__PURE__*/ React.createElement(IconRefresh, null),
						),
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "icon-btn",
							},
							/*#__PURE__*/ React.createElement(IconMoreH, null),
						),
					),
				);
			}
			function Sidebar({ active, setActive }) {
				return /*#__PURE__*/ React.createElement(
					"aside",
					{
						className: "side",
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "head",
						},
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "avatar",
							},
							"SU",
						),
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "who",
							},
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "name",
								},
								"superset",
							),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "org",
								},
								"wufan17 \xB7 main",
							),
						),
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "push",
							},
							/*#__PURE__*/ React.createElement(
								"button",
								{
									className: "icon-btn",
									title: "New workspace",
								},
								/*#__PURE__*/ React.createElement(IconPlus, null),
							),
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "search-row",
						},
						/*#__PURE__*/ React.createElement(
							"label",
							{
								className: "input",
							},
							/*#__PURE__*/ React.createElement(IconSearch, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement("input", {
								placeholder: "Jump to workspace\u2026",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "kbd",
									style: {
										marginRight: "var(--s-3)",
									},
								},
								"\u2318K",
							),
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "group",
						},
						/*#__PURE__*/ React.createElement("span", null, "Workspaces"),
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "count",
							},
							"5",
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "ws-list",
						},
						WORKSPACES.map((w) =>
							/*#__PURE__*/ React.createElement(
								"button",
								{
									key: w.id,
									className: `ws-item${active === w.id ? " is-active" : ""}`,
									onClick: () => setActive(w.id),
								},
								/*#__PURE__*/ React.createElement(StatusDot, {
									state: w.state,
								}),
								/*#__PURE__*/ React.createElement(
									"span",
									{
										className: "name",
									},
									w.name,
								),
								/*#__PURE__*/ React.createElement(
									"span",
									{
										className: "meta",
									},
									w.meta,
								),
							),
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "group",
						},
						/*#__PURE__*/ React.createElement(
							"span",
							null,
							"Batch \xB7 release-2026-08",
						),
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "count",
							},
							"2",
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "ws-list",
						},
						BATCHED.map((w) =>
							/*#__PURE__*/ React.createElement(
								"button",
								{
									key: w.id,
									className: `ws-item${active === w.id ? " is-active" : ""}`,
									onClick: () => setActive(w.id),
								},
								/*#__PURE__*/ React.createElement(StatusDot, {
									state: w.state,
								}),
								/*#__PURE__*/ React.createElement(
									"span",
									{
										className: "name",
									},
									w.name,
								),
								/*#__PURE__*/ React.createElement(
									"span",
									{
										className: "meta",
									},
									w.meta,
								),
							),
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "foot",
						},
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "mono faint",
							},
							"v1.19.0",
						),
						/*#__PURE__*/ React.createElement("span", {
							className: "spacer",
						}),
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "icon-btn",
								title: "Settings",
							},
							/*#__PURE__*/ React.createElement(IconMoreH, null),
						),
					),
				);
			}
			function ToolCall({ name, arg, body, done = true, seconds = "1.2" }) {
				return /*#__PURE__*/ React.createElement(
					"div",
					{
						className: "tool-call",
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "th",
						},
						/*#__PURE__*/ React.createElement(IconTerminal, {
							className: "glyph",
						}),
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "name",
							},
							name,
						),
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "arg",
							},
							arg,
						),
						/*#__PURE__*/ React.createElement("span", {
							className: "spacer",
						}),
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "status",
							},
							done
								? /*#__PURE__*/ React.createElement(
										React.Fragment,
										null,
										/*#__PURE__*/ React.createElement(IconCheck, {
											size: 11,
										}),
										" ",
										seconds,
										"s",
									)
								: /*#__PURE__*/ React.createElement(
										React.Fragment,
										null,
										"\u2026 running",
									),
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "body",
						},
						body,
					),
				);
			}
			function CodeBlock({ file, children }) {
				return /*#__PURE__*/ React.createElement(
					"div",
					{
						className: "code-block",
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "th",
						},
						/*#__PURE__*/ React.createElement(IconFile, {
							size: 11,
						}),
						/*#__PURE__*/ React.createElement("span", null, file),
						/*#__PURE__*/ React.createElement("span", {
							className: "spacer",
						}),
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "icon-btn",
							},
							/*#__PURE__*/ React.createElement(IconCopy, null),
						),
					),
					/*#__PURE__*/ React.createElement("pre", null, children),
				);
			}
			function ChatThread() {
				return /*#__PURE__*/ React.createElement(
					"div",
					{
						className: "thread",
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "msg user",
						},
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "avatar",
							},
							"WF",
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "content",
							},
							/*#__PURE__*/ React.createElement(
								"div",
								{
									className: "who",
								},
								"You ",
								/*#__PURE__*/ React.createElement(
									"span",
									{
										className: "time",
									},
									"14:03",
								),
							),
							/*#__PURE__*/ React.createElement(
								"div",
								{
									className: "text",
								},
								/*#__PURE__*/ React.createElement(
									"p",
									null,
									"\u628A branch menu \u7684\u5408\u5E76\u6309\u94AE\u4ECE\u884C\u5185\u79FB\u5230\u53F3\u952E\u83DC\u5355\u91CC,\u5E76\u4E14\u52A0\u4E0A",
									" ",
									/*#__PURE__*/ React.createElement(
										"code",
										null,
										"\u4ECE\u6B64\u5206\u652F\u65B0\u5EFA\u2026",
									),
									" \u7684\u5165\u53E3\u3002\u8981\u4FDD\u7559 ahead/behind badge\u3002",
								),
							),
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "msg",
						},
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "avatar",
							},
							"Kro",
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "content",
							},
							/*#__PURE__*/ React.createElement(
								"div",
								{
									className: "who",
								},
								"Kro ",
								/*#__PURE__*/ React.createElement(
									"span",
									{
										className: "time",
									},
									"14:03 \xB7 Opus 5",
								),
							),
							/*#__PURE__*/ React.createElement(
								"div",
								{
									className: "text",
								},
								/*#__PURE__*/ React.createElement(
									"p",
									null,
									"\u597D,\u6211\u5148\u770B\u4E00\u4E0B\u5F53\u524D ",
									/*#__PURE__*/ React.createElement(
										"code",
										null,
										"BranchMenu.tsx",
									),
									" ",
									"\u662F\u600E\u4E48\u7EC4\u7EC7\u7684,\u518D\u6539\u5230\u53F3\u952E\u83DC\u5355\u91CC\u3002",
								),
							),
							/*#__PURE__*/ React.createElement(ToolCall, {
								name: "Grep",
								arg: '"onMerge" apps/desktop/src/renderer',
								body: /*#__PURE__*/ React.createElement(
									React.Fragment,
									null,
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "ctx",
										},
										"apps/desktop/\u2026/BranchMenu.tsx:104:",
									),
									" ",
									/*#__PURE__*/ React.createElement(
										"span",
										null,
										"onMerge=",
										"{",
										"actions.merge",
										"}",
									),
									"\n",
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "ctx",
										},
										"apps/desktop/\u2026/BranchRow.tsx:38:",
									),
									" ",
									/*#__PURE__*/ React.createElement(
										"span",
										null,
										"onMerge=",
										"{",
										"onRowMerge",
										"}",
									),
								),
							}),
							/*#__PURE__*/ React.createElement(
								"div",
								{
									className: "text",
								},
								/*#__PURE__*/ React.createElement(
									"p",
									null,
									"\u628A ",
									/*#__PURE__*/ React.createElement("code", null, "BranchRow"),
									" \u91CC\u7684 hover-only merge \u6309\u94AE\u5220\u6389,\u5408\u5E76\u52A8\u4F5C\u63A5\u5230 ",
									/*#__PURE__*/ React.createElement(
										"code",
										null,
										"ContextMenu",
									),
									" \u4E0A\u3002\u8FD9\u662F\u65B0\u7684\u884C:",
								),
							),
							/*#__PURE__*/ React.createElement(
								CodeBlock,
								{
									file: "apps/desktop/src/renderer/\u2026/BranchRow.tsx",
								},
								`<div className="b-row"
  onClick={onSwitch}
  onContextMenu={onRowContext}>
  <IconBranch className="glyph" />
  <span className="name">{branch.name}</span>
  {ab.length ? <span className="tag">{ab.join("  ")}</span> : null}
  <span className="end">
    {isCurrent ? <IconCheck size={12} /> : branch.relative}
  </span>
</div>`,
							),
							/*#__PURE__*/ React.createElement(ToolCall, {
								name: "Edit",
								arg: "apps/desktop/\u2026/BranchRow.tsx",
								body: /*#__PURE__*/ React.createElement(
									React.Fragment,
									null,
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "del",
										},
										"-",
										" ",
										'<button className="row-merge" onMerge={onMerge}>合并</button>',
									),
									"\n",
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "add",
										},
										"+",
										" ",
										"onContextMenu={(e) => { e.preventDefault(); onRowContext(branch, e.clientX, e.clientY); }}",
									),
								),
							}),
							/*#__PURE__*/ React.createElement(
								"div",
								{
									className: "text",
								},
								/*#__PURE__*/ React.createElement(
									"p",
									null,
									"\u8DD1\u4E00\u4E0B typecheck \u786E\u8BA4\u6CA1\u522B\u7684\u5730\u65B9\u8FD8\u5728\u5F15\u7528\u65E7\u7684 ",
									/*#__PURE__*/ React.createElement("code", null, "onMerge"),
									" ",
									"prop\u3002",
								),
							),
							/*#__PURE__*/ React.createElement(ToolCall, {
								name: "Bash",
								arg: "bun run typecheck --filter apps/desktop",
								done: false,
								body: /*#__PURE__*/ React.createElement(
									React.Fragment,
									null,
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "ctx",
										},
										"tsc --noEmit",
									),
									"\n",
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "ctx",
										},
										"Task apps/desktop:typecheck",
									),
									"\n",
									/*#__PURE__*/ React.createElement("span", null, "\u2026"),
								),
							}),
						),
					),
				);
			}
			function Composer() {
				return /*#__PURE__*/ React.createElement(
					"div",
					{
						className: "composer",
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "box",
						},
						/*#__PURE__*/ React.createElement("textarea", {
							defaultValue:
								"\u52A0\u4E0A \u2318\u21E7B \u6253\u5F00\u5206\u652F\u83DC\u5355\u7684\u5FEB\u6377\u952E,\u5E76\u4E14\u5728 popover header \u4E0A\u663E\u793A\u8FD9\u4E2A hint\u3002",
						}),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "toolbar",
							},
							/*#__PURE__*/ React.createElement(
								"button",
								{
									className: "icon-btn",
									title: "Attach",
								},
								/*#__PURE__*/ React.createElement(IconPlus, null),
							),
							/*#__PURE__*/ React.createElement(
								"button",
								{
									className: "icon-btn",
									title: "Slash commands",
								},
								/*#__PURE__*/ React.createElement(IconTerminal, null),
							),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "agent",
								},
								/*#__PURE__*/ React.createElement("span", {
									className: "dot",
								}),
								"Kro \xB7 Opus 5",
							),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "kbd",
									style: {
										marginLeft: "var(--s-4)",
									},
								},
								"\u2318 + \u21B5",
							),
							/*#__PURE__*/ React.createElement("span", {
								className: "spacer",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "mono faint",
								},
								"1,283 / 200k",
							),
							/*#__PURE__*/ React.createElement(
								"button",
								{
									className: "send",
								},
								/*#__PURE__*/ React.createElement(IconArrowRight, {
									size: 12,
								}),
								"Send",
							),
						),
					),
				);
			}
			function StatusBar() {
				return /*#__PURE__*/ React.createElement(
					"div",
					{
						className: "status-bar",
					},
					/*#__PURE__*/ React.createElement(
						"span",
						{
							className: "item ok",
						},
						/*#__PURE__*/ React.createElement(IconCheck, {
							className: "glyph",
						}),
						/*#__PURE__*/ React.createElement(
							"span",
							null,
							"connected \xB7 host-service :5881",
						),
					),
					/*#__PURE__*/ React.createElement(
						"span",
						{
							className: "item",
						},
						/*#__PURE__*/ React.createElement(IconBranch, {
							className: "glyph",
						}),
						/*#__PURE__*/ React.createElement(
							"span",
							null,
							"feat/kro-suite \xB7 \u2191 3 \u2193 0",
						),
					),
					/*#__PURE__*/ React.createElement(
						"span",
						{
							className: "item warn",
						},
						/*#__PURE__*/ React.createElement(IconAlert, {
							className: "glyph",
						}),
						/*#__PURE__*/ React.createElement("span", null, "5 files unstaged"),
					),
					/*#__PURE__*/ React.createElement("span", {
						className: "spacer",
					}),
					/*#__PURE__*/ React.createElement(
						"span",
						{
							className: "item",
						},
						"Opus 5 \xB7 200k ctx",
					),
					/*#__PURE__*/ React.createElement(
						"span",
						{
							className: "item",
						},
						"UTC+8 \xB7 14:03",
					),
				);
			}

			/* Right rail — the composed Changes panel (from preview.jsx, adapted) */
			function ChangesPanel() {
				return /*#__PURE__*/ React.createElement(
					"div",
					{
						className: "kit-changes",
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "tabs",
						},
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "tab is-active",
							},
							/*#__PURE__*/ React.createElement(IconChanges, null),
							" Changes",
						),
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "tab",
							},
							/*#__PURE__*/ React.createElement(IconFile, null),
							" Files",
						),
						/*#__PURE__*/ React.createElement("span", {
							style: {
								flex: 1,
							},
						}),
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "icon-btn",
							},
							/*#__PURE__*/ React.createElement(IconMax, null),
						),
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "icon-btn",
							},
							/*#__PURE__*/ React.createElement(IconX, null),
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "branch-bar",
						},
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "pill",
								"aria-expanded": "true",
							},
							/*#__PURE__*/ React.createElement(IconBranch, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "label",
								},
								"feat/kro-suite",
							),
							/*#__PURE__*/ React.createElement(IconChevron, {
								className: "chev",
								style: {
									transform: "rotate(180deg)",
								},
							}),
						),
						/*#__PURE__*/ React.createElement("span", {
							style: {
								flex: 1,
							},
						}),
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "icon-btn",
							},
							/*#__PURE__*/ React.createElement(IconSort, null),
						),
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "icon-btn",
							},
							/*#__PURE__*/ React.createElement(IconRefresh, null),
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							style: {
								position: "relative",
							},
						},
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "popover floating",
								style: {
									left: 12,
									top: -2,
									width: 340,
									position: "absolute",
								},
							},
							/*#__PURE__*/ React.createElement(
								"div",
								{
									className: "popover-head",
								},
								/*#__PURE__*/ React.createElement(IconSearch, {
									className: "glyph",
								}),
								/*#__PURE__*/ React.createElement("input", {
									placeholder: "Jump to branch, or type to create\u2026",
								}),
							),
							/*#__PURE__*/ React.createElement(
								"div",
								{
									className: "popover-group",
								},
								/*#__PURE__*/ React.createElement(
									"span",
									null,
									"\u672C\u5730\u5206\u652F \xB7 4",
								),
								/*#__PURE__*/ React.createElement(
									"button",
									{
										className: "action",
									},
									/*#__PURE__*/ React.createElement(IconPlus, null),
									" \u65B0\u5EFA",
								),
							),
							/*#__PURE__*/ React.createElement(
								"div",
								null,
								/*#__PURE__*/ React.createElement(
									"div",
									{
										className: "popover-row is-current",
									},
									/*#__PURE__*/ React.createElement(IconBranch, {
										className: "glyph",
									}),
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "name",
										},
										"feat/kro-suite",
									),
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "tag up",
										},
										"\u2191 3",
									),
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "end",
										},
										/*#__PURE__*/ React.createElement(IconCheck, {
											size: 12,
											className: "check-icon",
										}),
									),
								),
								/*#__PURE__*/ React.createElement(
									"div",
									{
										className: "popover-row is-focused",
									},
									/*#__PURE__*/ React.createElement(IconBranch, {
										className: "glyph",
									}),
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "name",
										},
										"main",
									),
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "tag down",
										},
										"\u2193 12",
									),
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "end",
										},
										"1w",
									),
								),
								/*#__PURE__*/ React.createElement(
									"div",
									{
										className: "popover-row",
									},
									/*#__PURE__*/ React.createElement(IconBranch, {
										className: "glyph",
									}),
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "name",
										},
										"bugfix/reap-legacy-orphans",
									),
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "tag down",
										},
										"\u2193 2",
									),
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "end",
										},
										"2d",
									),
								),
								/*#__PURE__*/ React.createElement(
									"div",
									{
										className: "popover-row",
									},
									/*#__PURE__*/ React.createElement(IconBranch, {
										className: "glyph",
									}),
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "name",
										},
										"feat/browser-extension-bridge",
									),
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "tag up",
										},
										"\u2191 6",
									),
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "end",
										},
										"4d",
									),
								),
							),
							/*#__PURE__*/ React.createElement("div", {
								className: "popover-sep",
							}),
							/*#__PURE__*/ React.createElement(
								"div",
								{
									className: "popover-group",
								},
								/*#__PURE__*/ React.createElement(
									"span",
									null,
									"\u8FDC\u7A0B \xB7 2",
								),
								/*#__PURE__*/ React.createElement(
									"button",
									{
										className: "action",
									},
									/*#__PURE__*/ React.createElement(IconRefresh, null),
									" Fetch",
								),
							),
							/*#__PURE__*/ React.createElement(
								"div",
								null,
								/*#__PURE__*/ React.createElement(
									"div",
									{
										className: "popover-row",
									},
									/*#__PURE__*/ React.createElement(IconCloud, {
										className: "glyph",
									}),
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "name",
										},
										"feat/mcp-cursor-connector",
									),
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "end",
										},
										"origin",
									),
								),
							),
							/*#__PURE__*/ React.createElement(
								"div",
								{
									className: "popover-hint",
								},
								/*#__PURE__*/ React.createElement(
									"span",
									null,
									"\u53F3\u952E\u4EFB\u610F\u5206\u652F\u67E5\u770B\u64CD\u4F5C",
								),
								/*#__PURE__*/ React.createElement(
									"span",
									{
										className: "row-3",
									},
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "kbd",
										},
										"\u21B5",
									),
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "faint",
										},
										"\u5207\u6362",
									),
								),
							),
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "summary-bar",
						},
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "chip",
							},
							/*#__PURE__*/ React.createElement("span", {
								className: "dot mod",
							}),
							" 5 modified",
						),
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "chip",
							},
							/*#__PURE__*/ React.createElement("span", {
								className: "dot add",
							}),
							" 2 added",
						),
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "chip",
							},
							/*#__PURE__*/ React.createElement("span", {
								className: "dot del",
							}),
							" 1 deleted",
						),
						/*#__PURE__*/ React.createElement("span", {
							className: "spacer",
						}),
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "icon-btn",
							},
							/*#__PURE__*/ React.createElement(IconMoreH, null),
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "files",
						},
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "file-row",
							},
							/*#__PURE__*/ React.createElement(IconFile, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "dir",
								},
								"apps/desktop/src/renderer/",
							),
							/*#__PURE__*/ React.createElement("span", null, "MainView.tsx"),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "badge mod",
								},
								"M",
							),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "file-row",
							},
							/*#__PURE__*/ React.createElement(IconFile, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "dir",
								},
								"apps/desktop/src/main/",
							),
							/*#__PURE__*/ React.createElement("span", null, "index.ts"),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "badge mod",
								},
								"M",
							),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "file-row",
							},
							/*#__PURE__*/ React.createElement(IconFile, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "dir",
								},
								"apps/desktop/src/lib/trpc/routers/",
							),
							/*#__PURE__*/ React.createElement("span", null, "branches.ts"),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "badge mod",
								},
								"M",
							),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "file-row",
							},
							/*#__PURE__*/ React.createElement(IconFile, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "dir",
								},
								"apps/desktop/src/renderer/hooks/",
							),
							/*#__PURE__*/ React.createElement(
								"span",
								null,
								"useBranchMenu.ts",
							),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "badge add",
								},
								"A",
							),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "file-row",
							},
							/*#__PURE__*/ React.createElement(IconFile, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "dir",
								},
								"apps/desktop/src/renderer/\u2026/",
							),
							/*#__PURE__*/ React.createElement("span", null, "BranchMenu.tsx"),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "badge mod",
								},
								"M",
							),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "file-row",
							},
							/*#__PURE__*/ React.createElement(IconFile, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "dir",
								},
								"packages/ui/src/",
							),
							/*#__PURE__*/ React.createElement("span", null, "popover.tsx"),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "badge del",
								},
								"D",
							),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "file-row",
							},
							/*#__PURE__*/ React.createElement(IconFile, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "dir",
								},
								"designs/branch-menu-redesign/",
							),
							/*#__PURE__*/ React.createElement("span", null, "v3.css"),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "badge add",
								},
								"A",
							),
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "commit",
						},
						/*#__PURE__*/ React.createElement("textarea", {
							defaultValue: "feat(branch-menu): move ops into right-click menu",
						}),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "row",
							},
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "hint",
								},
								"On ",
								/*#__PURE__*/ React.createElement("b", null, "feat/kro-suite"),
								" \xB7 8 files",
							),
							/*#__PURE__*/ React.createElement(
								"button",
								{
									className: "btn primary",
								},
								/*#__PURE__*/ React.createElement(IconGitPush, null),
								" Commit & Push",
							),
						),
					),
				);
			}
			function App() {
				const [active, setActive] = React.useState("wf1");
				return /*#__PURE__*/ React.createElement(
					"div",
					{
						className: "app-shell",
					},
					/*#__PURE__*/ React.createElement(WinChrome, null),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "app-body",
						},
						/*#__PURE__*/ React.createElement(Sidebar, {
							active: active,
							setActive: setActive,
						}),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "main",
							},
							/*#__PURE__*/ React.createElement(
								"div",
								{
									className: "bar",
								},
								/*#__PURE__*/ React.createElement(
									"span",
									{
										className: "crumb",
									},
									/*#__PURE__*/ React.createElement("span", null, "superset"),
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "sep",
										},
										"/",
									),
									/*#__PURE__*/ React.createElement("span", null, "apps"),
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "sep",
										},
										"/",
									),
									/*#__PURE__*/ React.createElement("span", null, "desktop"),
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "sep",
										},
										"/",
									),
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "mono",
										},
										"feat/kro-suite",
									),
								),
								/*#__PURE__*/ React.createElement("span", {
									className: "spacer",
								}),
								/*#__PURE__*/ React.createElement(
									"span",
									{
										className: "chip",
									},
									/*#__PURE__*/ React.createElement("span", {
										className: "dot",
										style: {
											background: "var(--success)",
										},
									}),
									"running",
								),
								/*#__PURE__*/ React.createElement(
									"button",
									{
										className: "icon-btn",
									},
									/*#__PURE__*/ React.createElement(IconTerminal, null),
								),
								/*#__PURE__*/ React.createElement(
									"button",
									{
										className: "icon-btn",
									},
									/*#__PURE__*/ React.createElement(IconMoreH, null),
								),
							),
							/*#__PURE__*/ React.createElement(
								"div",
								{
									className: "body",
								},
								/*#__PURE__*/ React.createElement(ChatThread, null),
							),
							/*#__PURE__*/ React.createElement(Composer, null),
							/*#__PURE__*/ React.createElement(StatusBar, null),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "right-rail",
							},
							/*#__PURE__*/ React.createElement(ChangesPanel, null),
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "toast-stack",
						},
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "toast success",
							},
							/*#__PURE__*/ React.createElement(IconCheck, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								null,
								"\u5DF2\u5207\u6362\u5230 feat/kro-suite",
							),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "toast",
							},
							/*#__PURE__*/ React.createElement(IconGitPull, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								null,
								"\u5DF2\u62C9\u53D6 main \xB7 12 commits",
							),
						),
					),
				);
			}
			ReactDOM.createRoot(document.getElementById("root")).render(
				/*#__PURE__*/ React.createElement(App, null),
			);
		})();
	} catch (e) {
		__ds_ns.__errors.push({ path: "app.jsx", error: String(e?.message || e) });
	}

	// components/core/Badge/Badge.jsx
	try {
		(() => {
			function _extends() {
				return (
					(_extends = Object.assign
						? Object.assign.bind()
						: function (n) {
								for (var e = 1; e < arguments.length; e++) {
									var t = arguments[e];
									for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
								}
								return n;
							}),
					_extends.apply(null, arguments)
				);
			}
			const _React = window.React;
			function Badge({ tone, pill, children, className, ...rest }) {
				const cls = ["badge", tone, pill && "pill", className]
					.filter(Boolean)
					.join(" ");
				return /*#__PURE__*/ React.createElement(
					"span",
					_extends(
						{
							className: cls,
						},
						rest,
					),
					children,
				);
			}
			Object.assign(__ds_scope, { Badge });
		})();
	} catch (e) {
		__ds_ns.__errors.push({
			path: "components/core/Badge/Badge.jsx",
			error: String(e?.message || e),
		});
	}

	// components/core/Button/Button.jsx
	try {
		(() => {
			function _extends() {
				return (
					(_extends = Object.assign
						? Object.assign.bind()
						: function (n) {
								for (var e = 1; e < arguments.length; e++) {
									var t = arguments[e];
									for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
								}
								return n;
							}),
					_extends.apply(null, arguments)
				);
			}
			const _React = window.React;
			function Button({
				variant = "default",
				size = "md",
				disabled,
				className,
				children,
				...rest
			}) {
				const cls = [
					"btn",
					variant === "primary" && "primary",
					variant === "ghost" && "ghost",
					variant === "danger" && "danger",
					size === "sm" && "sm",
					className,
				]
					.filter(Boolean)
					.join(" ");
				return /*#__PURE__*/ React.createElement(
					"button",
					_extends(
						{
							className: cls,
							disabled: disabled,
						},
						rest,
					),
					children,
				);
			}
			Object.assign(__ds_scope, { Button });
		})();
	} catch (e) {
		__ds_ns.__errors.push({
			path: "components/core/Button/Button.jsx",
			error: String(e?.message || e),
		});
	}

	// components/core/Chip/Chip.jsx
	try {
		(() => {
			function _extends() {
				return (
					(_extends = Object.assign
						? Object.assign.bind()
						: function (n) {
								for (var e = 1; e < arguments.length; e++) {
									var t = arguments[e];
									for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
								}
								return n;
							}),
					_extends.apply(null, arguments)
				);
			}
			const _React = window.React;
			function Chip({ tone, children, className, ...rest }) {
				return /*#__PURE__*/ React.createElement(
					"span",
					_extends(
						{
							className: ["chip", className].filter(Boolean).join(" "),
						},
						rest,
					),
					tone
						? /*#__PURE__*/ React.createElement("span", {
								className: `dot ${tone}`,
							})
						: null,
					children,
				);
			}
			Object.assign(__ds_scope, { Chip });
		})();
	} catch (e) {
		__ds_ns.__errors.push({
			path: "components/core/Chip/Chip.jsx",
			error: String(e?.message || e),
		});
	}

	// components/core/Icon/Icon.jsx
	try {
		(() => {
			function _extends() {
				return (
					(_extends = Object.assign
						? Object.assign.bind()
						: function (n) {
								for (var e = 1; e < arguments.length; e++) {
									var t = arguments[e];
									for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
								}
								return n;
							}),
					_extends.apply(null, arguments)
				);
			}
			// Superset DS — Icon
			// A single line-icon component that dispatches on `name`. All icons render at
			// 24-viewbox with stroke=currentColor so a parent can tint them via CSS.

			const _React = window.React;
			const P = {
				branch: /*#__PURE__*/ React.createElement(
					React.Fragment,
					null,
					/*#__PURE__*/ React.createElement("circle", {
						cx: "6",
						cy: "4",
						r: "2",
					}),
					/*#__PURE__*/ React.createElement("circle", {
						cx: "6",
						cy: "20",
						r: "2",
					}),
					/*#__PURE__*/ React.createElement("circle", {
						cx: "18",
						cy: "8",
						r: "2",
					}),
					/*#__PURE__*/ React.createElement("path", {
						d: "M6 6v12",
					}),
					/*#__PURE__*/ React.createElement("path", {
						d: "M18 10c0 3-2 4-6 4H6",
					}),
				),
				chevron: /*#__PURE__*/ React.createElement("polyline", {
					points: "6 9 12 15 18 9",
				}),
				search: /*#__PURE__*/ React.createElement(
					React.Fragment,
					null,
					/*#__PURE__*/ React.createElement("circle", {
						cx: "11",
						cy: "11",
						r: "7",
					}),
					/*#__PURE__*/ React.createElement("line", {
						x1: "21",
						y1: "21",
						x2: "16.65",
						y2: "16.65",
					}),
				),
				plus: /*#__PURE__*/ React.createElement(
					React.Fragment,
					null,
					/*#__PURE__*/ React.createElement("path", {
						d: "M12 5v14",
					}),
					/*#__PURE__*/ React.createElement("path", {
						d: "M5 12h14",
					}),
				),
				check: /*#__PURE__*/ React.createElement("polyline", {
					points: "20 6 9 17 4 12",
				}),
				refresh: /*#__PURE__*/ React.createElement(
					React.Fragment,
					null,
					/*#__PURE__*/ React.createElement("polyline", {
						points: "23 4 23 10 17 10",
					}),
					/*#__PURE__*/ React.createElement("polyline", {
						points: "1 20 1 14 7 14",
					}),
					/*#__PURE__*/ React.createElement("path", {
						d: "M3.51 9a9 9 0 0 1 14.85-3.36L23 10",
					}),
					/*#__PURE__*/ React.createElement("path", {
						d: "M20.49 15a9 9 0 0 1-14.85 3.36L1 14",
					}),
				),
				push: /*#__PURE__*/ React.createElement(
					React.Fragment,
					null,
					/*#__PURE__*/ React.createElement("line", {
						x1: "12",
						y1: "19",
						x2: "12",
						y2: "5",
					}),
					/*#__PURE__*/ React.createElement("polyline", {
						points: "5 12 12 5 19 12",
					}),
				),
				pull: /*#__PURE__*/ React.createElement(
					React.Fragment,
					null,
					/*#__PURE__*/ React.createElement("line", {
						x1: "12",
						y1: "5",
						x2: "12",
						y2: "19",
					}),
					/*#__PURE__*/ React.createElement("polyline", {
						points: "19 12 12 19 5 12",
					}),
				),
				merge: /*#__PURE__*/ React.createElement(
					React.Fragment,
					null,
					/*#__PURE__*/ React.createElement("circle", {
						cx: "6",
						cy: "4",
						r: "2",
					}),
					/*#__PURE__*/ React.createElement("circle", {
						cx: "6",
						cy: "20",
						r: "2",
					}),
					/*#__PURE__*/ React.createElement("circle", {
						cx: "18",
						cy: "12",
						r: "2",
					}),
					/*#__PURE__*/ React.createElement("path", {
						d: "M6 6v12",
					}),
					/*#__PURE__*/ React.createElement("path", {
						d: "M18 10c-4 0-8-3-12-6",
					}),
				),
				arrowRight: /*#__PURE__*/ React.createElement(
					React.Fragment,
					null,
					/*#__PURE__*/ React.createElement("line", {
						x1: "5",
						y1: "12",
						x2: "19",
						y2: "12",
					}),
					/*#__PURE__*/ React.createElement("polyline", {
						points: "12 5 19 12 12 19",
					}),
				),
				edit: /*#__PURE__*/ React.createElement(
					React.Fragment,
					null,
					/*#__PURE__*/ React.createElement("path", {
						d: "M12 20h9",
					}),
					/*#__PURE__*/ React.createElement("path", {
						d: "M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z",
					}),
				),
				copy: /*#__PURE__*/ React.createElement(
					React.Fragment,
					null,
					/*#__PURE__*/ React.createElement("rect", {
						x: "9",
						y: "9",
						width: "13",
						height: "13",
						rx: "2",
						ry: "2",
					}),
					/*#__PURE__*/ React.createElement("path", {
						d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
					}),
				),
				terminal: /*#__PURE__*/ React.createElement(
					React.Fragment,
					null,
					/*#__PURE__*/ React.createElement("polyline", {
						points: "4 17 10 11 4 5",
					}),
					/*#__PURE__*/ React.createElement("line", {
						x1: "12",
						y1: "19",
						x2: "20",
						y2: "19",
					}),
				),
				trash: /*#__PURE__*/ React.createElement(
					React.Fragment,
					null,
					/*#__PURE__*/ React.createElement("polyline", {
						points: "3 6 5 6 21 6",
					}),
					/*#__PURE__*/ React.createElement("path", {
						d: "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6",
					}),
					/*#__PURE__*/ React.createElement("path", {
						d: "M10 11v6M14 11v6",
					}),
				),
				alert: /*#__PURE__*/ React.createElement(
					React.Fragment,
					null,
					/*#__PURE__*/ React.createElement("path", {
						d: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
					}),
					/*#__PURE__*/ React.createElement("line", {
						x1: "12",
						y1: "9",
						x2: "12",
						y2: "13",
					}),
					/*#__PURE__*/ React.createElement("circle", {
						cx: "12",
						cy: "17",
						r: "0.5",
					}),
				),
				file: /*#__PURE__*/ React.createElement(
					React.Fragment,
					null,
					/*#__PURE__*/ React.createElement("path", {
						d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z",
					}),
					/*#__PURE__*/ React.createElement("polyline", {
						points: "14 2 14 8 20 8",
					}),
				),
				cloud: /*#__PURE__*/ React.createElement("path", {
					d: "M17.5 19a4.5 4.5 0 0 0 0-9c-.28 0-.55.03-.82.08A6.5 6.5 0 0 0 4 12a5 5 0 0 0 5 7h8.5z",
				}),
				changes: /*#__PURE__*/ React.createElement("path", {
					d: "M4 6h16M4 12h10M4 18h16",
				}),
				max: /*#__PURE__*/ React.createElement("rect", {
					x: "4",
					y: "4",
					width: "16",
					height: "16",
					rx: "2",
				}),
				x: /*#__PURE__*/ React.createElement(
					React.Fragment,
					null,
					/*#__PURE__*/ React.createElement("line", {
						x1: "6",
						y1: "6",
						x2: "18",
						y2: "18",
					}),
					/*#__PURE__*/ React.createElement("line", {
						x1: "6",
						y1: "18",
						x2: "18",
						y2: "6",
					}),
				),
				sort: /*#__PURE__*/ React.createElement(
					React.Fragment,
					null,
					/*#__PURE__*/ React.createElement("line", {
						x1: "5",
						y1: "7",
						x2: "19",
						y2: "7",
					}),
					/*#__PURE__*/ React.createElement("line", {
						x1: "7",
						y1: "12",
						x2: "17",
						y2: "12",
					}),
					/*#__PURE__*/ React.createElement("line", {
						x1: "10",
						y1: "17",
						x2: "14",
						y2: "17",
					}),
				),
				moreH: /*#__PURE__*/ React.createElement(
					React.Fragment,
					null,
					/*#__PURE__*/ React.createElement("circle", {
						cx: "6",
						cy: "12",
						r: "1.2",
					}),
					/*#__PURE__*/ React.createElement("circle", {
						cx: "12",
						cy: "12",
						r: "1.2",
					}),
					/*#__PURE__*/ React.createElement("circle", {
						cx: "18",
						cy: "12",
						r: "1.2",
					}),
				),
				spark: /*#__PURE__*/ React.createElement("path", {
					d: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
				}),
			};
			function Icon({ name, size = 14, className, style, ...rest }) {
				const paths = P[name];
				if (!paths) return null;
				return /*#__PURE__*/ React.createElement(
					"svg",
					_extends(
						{
							width: size,
							height: size,
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							strokeWidth: "1.7",
							strokeLinecap: "round",
							strokeLinejoin: "round",
							className: className,
							style: style,
							"aria-hidden": "true",
						},
						rest,
					),
					paths,
				);
			}
			Object.assign(__ds_scope, { Icon });
		})();
	} catch (e) {
		__ds_ns.__errors.push({
			path: "components/core/Icon/Icon.jsx",
			error: String(e?.message || e),
		});
	}

	// components/core/IconButton/IconButton.jsx
	try {
		(() => {
			function _extends() {
				return (
					(_extends = Object.assign
						? Object.assign.bind()
						: function (n) {
								for (var e = 1; e < arguments.length; e++) {
									var t = arguments[e];
									for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
								}
								return n;
							}),
					_extends.apply(null, arguments)
				);
			}
			const _React = window.React;
			function IconButton({ className, children, ...rest }) {
				return /*#__PURE__*/ React.createElement(
					"button",
					_extends(
						{
							className: ["icon-btn", className].filter(Boolean).join(" "),
						},
						rest,
					),
					children,
				);
			}
			Object.assign(__ds_scope, { IconButton });
		})();
	} catch (e) {
		__ds_ns.__errors.push({
			path: "components/core/IconButton/IconButton.jsx",
			error: String(e?.message || e),
		});
	}

	// components/core/Kbd/Kbd.jsx
	try {
		(() => {
			function _extends() {
				return (
					(_extends = Object.assign
						? Object.assign.bind()
						: function (n) {
								for (var e = 1; e < arguments.length; e++) {
									var t = arguments[e];
									for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
								}
								return n;
							}),
					_extends.apply(null, arguments)
				);
			}
			const _React = window.React;
			function Kbd({ children, className, ...rest }) {
				return /*#__PURE__*/ React.createElement(
					"span",
					_extends(
						{
							className: ["kbd", className].filter(Boolean).join(" "),
						},
						rest,
					),
					children,
				);
			}
			Object.assign(__ds_scope, { Kbd });
		})();
	} catch (e) {
		__ds_ns.__errors.push({
			path: "components/core/Kbd/Kbd.jsx",
			error: String(e?.message || e),
		});
	}

	// components/core/Pill/Pill.jsx
	try {
		(() => {
			function _extends() {
				return (
					(_extends = Object.assign
						? Object.assign.bind()
						: function (n) {
								for (var e = 1; e < arguments.length; e++) {
									var t = arguments[e];
									for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
								}
								return n;
							}),
					_extends.apply(null, arguments)
				);
			}
			const { Icon } = __ds_scope;
			const _React = window.React;
			function Pill({
				label,
				open,
				onClick,
				iconName = "branch",
				className,
				...rest
			}) {
				return /*#__PURE__*/ React.createElement(
					"button",
					_extends(
						{
							type: "button",
							className: ["pill", className].filter(Boolean).join(" "),
							"aria-expanded": open ? "true" : "false",
							onClick: onClick,
						},
						rest,
					),
					/*#__PURE__*/ React.createElement(Icon, {
						name: iconName,
						className: "glyph",
						size: 12,
					}),
					/*#__PURE__*/ React.createElement(
						"span",
						{
							className: "label",
						},
						label,
					),
					/*#__PURE__*/ React.createElement(Icon, {
						name: "chevron",
						className: "chev",
						size: 10,
						style: open
							? {
									transform: "rotate(180deg)",
								}
							: undefined,
					}),
				);
			}
			Object.assign(__ds_scope, { Pill });
		})();
	} catch (e) {
		__ds_ns.__errors.push({
			path: "components/core/Pill/Pill.jsx",
			error: String(e?.message || e),
		});
	}

	// components/core/Tag/Tag.jsx
	try {
		(() => {
			function _extends() {
				return (
					(_extends = Object.assign
						? Object.assign.bind()
						: function (n) {
								for (var e = 1; e < arguments.length; e++) {
									var t = arguments[e];
									for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
								}
								return n;
							}),
					_extends.apply(null, arguments)
				);
			}
			const _React = window.React;
			function Tag({ dir, children, className, ...rest }) {
				const cls = ["tag", dir, className].filter(Boolean).join(" ");
				return /*#__PURE__*/ React.createElement(
					"span",
					_extends(
						{
							className: cls,
						},
						rest,
					),
					dir === "up" ? "↑ " : dir === "down" ? "↓ " : null,
					children,
				);
			}
			Object.assign(__ds_scope, { Tag });
		})();
	} catch (e) {
		__ds_ns.__errors.push({
			path: "components/core/Tag/Tag.jsx",
			error: String(e?.message || e),
		});
	}

	// components/feedback/ConfirmCard/ConfirmCard.jsx
	try {
		(() => {
			const { Button } = __ds_scope;
			const { Icon } = __ds_scope;
			const _React = window.React;
			function ConfirmCard({
				title,
				body,
				confirmLabel = "确认",
				cancelLabel = "取消",
				danger,
				onConfirm,
				onCancel,
				className,
			}) {
				return /*#__PURE__*/ React.createElement(
					"div",
					{
						className: ["confirm", className].filter(Boolean).join(" "),
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "icon",
						},
						/*#__PURE__*/ React.createElement(Icon, {
							name: "alert",
							size: 16,
						}),
					),
					/*#__PURE__*/ React.createElement(
						"h3",
						{
							className: "title",
						},
						title,
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "body",
						},
						body,
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "actions",
						},
						/*#__PURE__*/ React.createElement(
							Button,
							{
								onClick: onCancel,
							},
							cancelLabel,
						),
						/*#__PURE__*/ React.createElement(
							Button,
							{
								variant: danger ? "danger" : "primary",
								onClick: onConfirm,
							},
							confirmLabel,
						),
					),
				);
			}
			Object.assign(__ds_scope, { ConfirmCard });
		})();
	} catch (e) {
		__ds_ns.__errors.push({
			path: "components/feedback/ConfirmCard/ConfirmCard.jsx",
			error: String(e?.message || e),
		});
	}

	// components/feedback/Toast/Toast.jsx
	try {
		(() => {
			function _extends() {
				return (
					(_extends = Object.assign
						? Object.assign.bind()
						: function (n) {
								for (var e = 1; e < arguments.length; e++) {
									var t = arguments[e];
									for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
								}
								return n;
							}),
					_extends.apply(null, arguments)
				);
			}
			const { Icon } = __ds_scope;
			const _React = window.React;
			const DEFAULT_ICON = {
				success: "check",
				info: "spark",
				warn: "alert",
				error: "x",
			};
			function Toast({
				tone = "info",
				iconName,
				children,
				className,
				...rest
			}) {
				const cls = ["toast", tone !== "info" && tone, className]
					.filter(Boolean)
					.join(" ");
				const name = iconName || DEFAULT_ICON[tone] || "spark";
				return /*#__PURE__*/ React.createElement(
					"div",
					_extends(
						{
							className: cls,
						},
						rest,
					),
					/*#__PURE__*/ React.createElement(Icon, {
						name: name,
						className: "glyph",
						size: 14,
					}),
					/*#__PURE__*/ React.createElement("span", null, children),
				);
			}
			Object.assign(__ds_scope, { Toast });
		})();
	} catch (e) {
		__ds_ns.__errors.push({
			path: "components/feedback/Toast/Toast.jsx",
			error: String(e?.message || e),
		});
	}

	// components/forms/Checkbox/Checkbox.jsx
	try {
		(() => {
			function _extends() {
				return (
					(_extends = Object.assign
						? Object.assign.bind()
						: function (n) {
								for (var e = 1; e < arguments.length; e++) {
									var t = arguments[e];
									for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
								}
								return n;
							}),
					_extends.apply(null, arguments)
				);
			}
			const _React = window.React;
			function Checkbox({
				checked,
				defaultChecked,
				onChange,
				children,
				className,
				...rest
			}) {
				return /*#__PURE__*/ React.createElement(
					"label",
					{
						className: ["check", className].filter(Boolean).join(" "),
					},
					/*#__PURE__*/ React.createElement(
						"input",
						_extends(
							{
								type: "checkbox",
								checked: checked,
								defaultChecked: defaultChecked,
								onChange: onChange,
							},
							rest,
						),
					),
					/*#__PURE__*/ React.createElement("span", {
						className: "box",
						"aria-hidden": true,
					}),
					children,
				);
			}
			Object.assign(__ds_scope, { Checkbox });
		})();
	} catch (e) {
		__ds_ns.__errors.push({
			path: "components/forms/Checkbox/Checkbox.jsx",
			error: String(e?.message || e),
		});
	}

	// components/forms/Input/Input.jsx
	try {
		(() => {
			function _extends() {
				return (
					(_extends = Object.assign
						? Object.assign.bind()
						: function (n) {
								for (var e = 1; e < arguments.length; e++) {
									var t = arguments[e];
									for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
								}
								return n;
							}),
					_extends.apply(null, arguments)
				);
			}
			const { Icon } = __ds_scope;
			const _React = window.React;
			function Input({
				iconName,
				trailing,
				transparent,
				className,
				inputRef,
				...inputProps
			}) {
				const cls = ["input", transparent && "transparent", className]
					.filter(Boolean)
					.join(" ");
				return /*#__PURE__*/ React.createElement(
					"label",
					{
						className: cls,
					},
					iconName
						? /*#__PURE__*/ React.createElement(Icon, {
								name: iconName,
								className: "glyph",
								size: 13,
							})
						: null,
					/*#__PURE__*/ React.createElement(
						"input",
						_extends(
							{
								ref: inputRef,
							},
							inputProps,
						),
					),
					trailing,
				);
			}
			Object.assign(__ds_scope, { Input });
		})();
	} catch (e) {
		__ds_ns.__errors.push({
			path: "components/forms/Input/Input.jsx",
			error: String(e?.message || e),
		});
	}

	// components/forms/SegmentedControl/SegmentedControl.jsx
	try {
		(() => {
			const _React = window.React;
			function SegmentedControl({ options, value, onChange, className }) {
				return /*#__PURE__*/ React.createElement(
					"div",
					{
						className: ["segmented", className].filter(Boolean).join(" "),
					},
					options.map((opt) => {
						const v = typeof opt === "string" ? opt : opt.value;
						const label = typeof opt === "string" ? opt : opt.label;
						return /*#__PURE__*/ React.createElement(
							"button",
							{
								key: v,
								className: v === value ? "is-active" : "",
								onClick: () => onChange?.(v),
							},
							label,
						);
					}),
				);
			}
			Object.assign(__ds_scope, { SegmentedControl });
		})();
	} catch (e) {
		__ds_ns.__errors.push({
			path: "components/forms/SegmentedControl/SegmentedControl.jsx",
			error: String(e?.message || e),
		});
	}

	// components/forms/Switch/Switch.jsx
	try {
		(() => {
			function _extends() {
				return (
					(_extends = Object.assign
						? Object.assign.bind()
						: function (n) {
								for (var e = 1; e < arguments.length; e++) {
									var t = arguments[e];
									for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
								}
								return n;
							}),
					_extends.apply(null, arguments)
				);
			}
			const _React = window.React;
			function Switch({ checked, onChange, className, ...rest }) {
				return /*#__PURE__*/ React.createElement(
					"span",
					_extends(
						{
							role: "switch",
							"aria-checked": checked ? "true" : "false",
							tabIndex: 0,
							onClick: () => onChange?.(!checked),
							onKeyDown: (e) => {
								if (e.key === " " || e.key === "Enter") {
									e.preventDefault();
									onChange?.(!checked);
								}
							},
							className: ["switch", className].filter(Boolean).join(" "),
						},
						rest,
					),
				);
			}
			Object.assign(__ds_scope, { Switch });
		})();
	} catch (e) {
		__ds_ns.__errors.push({
			path: "components/forms/Switch/Switch.jsx",
			error: String(e?.message || e),
		});
	}

	// components/navigation/FileRow/FileRow.jsx
	try {
		(() => {
			const { Badge } = __ds_scope;
			const { Icon } = __ds_scope;
			const _React = window.React;
			const TONE = {
				A: "add",
				M: "mod",
				D: "del",
				R: undefined,
			};
			function FileRow({
				dir,
				file,
				status,
				iconName = "file",
				trailing,
				onClick,
				className,
			}) {
				return /*#__PURE__*/ React.createElement(
					"div",
					{
						className: ["file-row", className].filter(Boolean).join(" "),
						role: "button",
						tabIndex: 0,
						onClick: onClick,
					},
					/*#__PURE__*/ React.createElement(Icon, {
						name: iconName,
						className: "glyph",
						size: 13,
					}),
					/*#__PURE__*/ React.createElement(
						"span",
						{
							className: "dir",
						},
						dir,
					),
					/*#__PURE__*/ React.createElement("span", null, file),
					trailing,
					status
						? /*#__PURE__*/ React.createElement(
								Badge,
								{
									tone: TONE[status],
								},
								status,
							)
						: null,
				);
			}
			Object.assign(__ds_scope, { FileRow });
		})();
	} catch (e) {
		__ds_ns.__errors.push({
			path: "components/navigation/FileRow/FileRow.jsx",
			error: String(e?.message || e),
		});
	}

	// components/navigation/Tabs/Tabs.jsx
	try {
		(() => {
			const { Icon } = __ds_scope;
			const _React = window.React;
			function Tabs({ items, value, onChange, trailing, className }) {
				return /*#__PURE__*/ React.createElement(
					"div",
					{
						className: ["tabs", className].filter(Boolean).join(" "),
					},
					items.map((it) => {
						const cls = `tab${it.value === value ? " is-active" : ""}`;
						return /*#__PURE__*/ React.createElement(
							"button",
							{
								key: it.value,
								className: cls,
								onClick: () => onChange?.(it.value),
							},
							it.iconName
								? /*#__PURE__*/ React.createElement(Icon, {
										name: it.iconName,
										size: 14,
									})
								: null,
							it.label,
						);
					}),
					trailing
						? /*#__PURE__*/ React.createElement("span", {
								style: {
									flex: 1,
								},
							})
						: null,
					trailing,
				);
			}
			Object.assign(__ds_scope, { Tabs });
		})();
	} catch (e) {
		__ds_ns.__errors.push({
			path: "components/navigation/Tabs/Tabs.jsx",
			error: String(e?.message || e),
		});
	}

	// components/navigation/WorkspaceItem/WorkspaceItem.jsx
	try {
		(() => {
			const _React = window.React;
			const TONE = {
				running: "",
				ok: "ok",
				err: "err",
				warn: "",
				idle: "idle",
			};
			function WorkspaceItem({
				name,
				state = "idle",
				meta,
				active,
				onClick,
				className,
			}) {
				const cls = ["ws-item", active && "is-active", className]
					.filter(Boolean)
					.join(" ");
				return /*#__PURE__*/ React.createElement(
					"button",
					{
						className: cls,
						onClick: onClick,
						type: "button",
					},
					/*#__PURE__*/ React.createElement("span", {
						className: `status-dot ${TONE[state] ?? ""}`,
					}),
					/*#__PURE__*/ React.createElement(
						"span",
						{
							className: "name",
						},
						name,
					),
					meta
						? /*#__PURE__*/ React.createElement(
								"span",
								{
									className: "meta",
								},
								meta,
							)
						: null,
				);
			}
			Object.assign(__ds_scope, { WorkspaceItem });
		})();
	} catch (e) {
		__ds_ns.__errors.push({
			path: "components/navigation/WorkspaceItem/WorkspaceItem.jsx",
			error: String(e?.message || e),
		});
	}

	// components/overlays/ContextMenu/ContextMenu.jsx
	try {
		(() => {
			function _extends() {
				return (
					(_extends = Object.assign
						? Object.assign.bind()
						: function (n) {
								for (var e = 1; e < arguments.length; e++) {
									var t = arguments[e];
									for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
								}
								return n;
							}),
					_extends.apply(null, arguments)
				);
			}
			// Right-click context menu. Compose with sections; the container handles no
			// positioning — pass fixed coordinates in a wrapping `style` at the call site.
			const { Icon } = __ds_scope;
			const _React = window.React;
			function ContextMenu({ children, className, style, ...rest }) {
				return /*#__PURE__*/ React.createElement(
					"div",
					_extends(
						{
							className: ["menu", className].filter(Boolean).join(" "),
							style: style,
							role: "menu",
						},
						rest,
					),
					children,
				);
			}
			function MenuHeading({ iconName = "branch", title, badge }) {
				return /*#__PURE__*/ React.createElement(
					"div",
					{
						className: "menu-heading",
					},
					/*#__PURE__*/ React.createElement(Icon, {
						name: iconName,
						className: "glyph",
						size: 12,
					}),
					/*#__PURE__*/ React.createElement("span", null, title),
					badge,
				);
			}
			function MenuSep() {
				return /*#__PURE__*/ React.createElement("div", {
					className: "menu-sep",
				});
			}
			function MenuGroup({ children }) {
				return /*#__PURE__*/ React.createElement(
					"div",
					{
						className: "menu-group",
					},
					children,
				);
			}
			function MenuItem({
				iconName,
				label,
				danger,
				disabled,
				kbd,
				tag,
				onClick,
				title,
			}) {
				const cls = [
					"menu-item",
					disabled && "is-disabled",
					danger && "is-danger",
				]
					.filter(Boolean)
					.join(" ");
				return /*#__PURE__*/ React.createElement(
					"button",
					{
						type: "button",
						className: cls,
						onClick: disabled ? undefined : onClick,
						title: disabled ? title : undefined,
					},
					iconName
						? /*#__PURE__*/ React.createElement(Icon, {
								name: iconName,
								className: "glyph",
								size: 13,
							})
						: null,
					/*#__PURE__*/ React.createElement(
						"span",
						{
							className: "label",
						},
						label,
					),
					tag,
					kbd,
				);
			}
			Object.assign(__ds_scope, {
				ContextMenu,
				MenuHeading,
				MenuSep,
				MenuGroup,
				MenuItem,
			});
		})();
	} catch (e) {
		__ds_ns.__errors.push({
			path: "components/overlays/ContextMenu/ContextMenu.jsx",
			error: String(e?.message || e),
		});
	}

	// components/overlays/Popover/Popover.jsx
	try {
		(() => {
			function _extends() {
				return (
					(_extends = Object.assign
						? Object.assign.bind()
						: function (n) {
								for (var e = 1; e < arguments.length; e++) {
									var t = arguments[e];
									for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
								}
								return n;
							}),
					_extends.apply(null, arguments)
				);
			}
			// Popover container — layout only. Compose with PopoverHeader / PopoverGroup /
			// PopoverRow / PopoverSep / PopoverHint. Positioning is the caller's job
			// (typically absolute-under a Pill trigger).
			const { Icon } = __ds_scope;
			const _React = window.React;
			function Popover({ children, className, style, ...rest }) {
				return /*#__PURE__*/ React.createElement(
					"div",
					_extends(
						{
							className: ["popover", className].filter(Boolean).join(" "),
							style: style,
						},
						rest,
					),
					children,
				);
			}
			function PopoverHeader({
				iconName = "search",
				placeholder,
				value,
				onChange,
				inputRef,
				trailing,
			}) {
				return /*#__PURE__*/ React.createElement(
					"div",
					{
						className: "popover-head",
					},
					/*#__PURE__*/ React.createElement(Icon, {
						name: iconName,
						className: "glyph",
						size: 13,
					}),
					/*#__PURE__*/ React.createElement("input", {
						ref: inputRef,
						value: value,
						onChange: onChange && ((e) => onChange(e.target.value)),
						placeholder: placeholder,
						spellCheck: false,
					}),
					trailing,
				);
			}
			function PopoverGroup({ label, count, action }) {
				return /*#__PURE__*/ React.createElement(
					"div",
					{
						className: "popover-group",
					},
					/*#__PURE__*/ React.createElement(
						"span",
						null,
						label,
						typeof count === "number" ? ` · ${count}` : null,
					),
					action,
				);
			}
			function PopoverRow({
				iconName = "branch",
				name,
				current,
				focused,
				tag,
				end,
				onClick,
				onContextMenu,
				className,
			}) {
				const cls = [
					"popover-row",
					current && "is-current",
					focused && "is-focused",
					className,
				]
					.filter(Boolean)
					.join(" ");
				return /*#__PURE__*/ React.createElement(
					"div",
					{
						className: cls,
						role: "button",
						tabIndex: 0,
						onClick: onClick,
						onContextMenu: onContextMenu,
					},
					/*#__PURE__*/ React.createElement(Icon, {
						name: iconName,
						className: "glyph",
						size: 12,
					}),
					/*#__PURE__*/ React.createElement(
						"span",
						{
							className: "name",
						},
						name,
					),
					tag,
					/*#__PURE__*/ React.createElement(
						"span",
						{
							className: "end",
						},
						current
							? /*#__PURE__*/ React.createElement(Icon, {
									name: "check",
									className: "check-icon",
									size: 12,
								})
							: end,
					),
				);
			}
			function PopoverSep() {
				return /*#__PURE__*/ React.createElement("div", {
					className: "popover-sep",
				});
			}
			function PopoverHint({ children }) {
				return /*#__PURE__*/ React.createElement(
					"div",
					{
						className: "popover-hint",
					},
					children,
				);
			}
			Object.assign(__ds_scope, {
				Popover,
				PopoverHeader,
				PopoverGroup,
				PopoverRow,
				PopoverSep,
				PopoverHint,
			});
		})();
	} catch (e) {
		__ds_ns.__errors.push({
			path: "components/overlays/Popover/Popover.jsx",
			error: String(e?.message || e),
		});
	}

	// icons.jsx
	try {
		(() => {
			function _extends() {
				return (
					(_extends = Object.assign
						? Object.assign.bind()
						: function (n) {
								for (var e = 1; e < arguments.length; e++) {
									var t = arguments[e];
									for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
								}
								return n;
							}),
					_extends.apply(null, arguments)
				);
			}
			// Shared icon set — 14x14 line icons matching the branch-menu v3 style.
			// stroke=currentColor, so any component can tint them via CSS.

			const Svg = ({ children, size = 14, ...rest }) =>
				/*#__PURE__*/ React.createElement(
					"svg",
					_extends(
						{
							width: size,
							height: size,
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							strokeWidth: "1.7",
							strokeLinecap: "round",
							strokeLinejoin: "round",
						},
						rest,
					),
					children,
				);
			const IconBranch = (p) =>
				/*#__PURE__*/ React.createElement(
					Svg,
					p,
					/*#__PURE__*/ React.createElement("circle", {
						cx: "6",
						cy: "4",
						r: "2",
					}),
					/*#__PURE__*/ React.createElement("circle", {
						cx: "6",
						cy: "20",
						r: "2",
					}),
					/*#__PURE__*/ React.createElement("circle", {
						cx: "18",
						cy: "8",
						r: "2",
					}),
					/*#__PURE__*/ React.createElement("path", {
						d: "M6 6v12",
					}),
					/*#__PURE__*/ React.createElement("path", {
						d: "M18 10c0 3-2 4-6 4H6",
					}),
				);
			const IconChevron = (p) =>
				/*#__PURE__*/ React.createElement(
					Svg,
					p,
					/*#__PURE__*/ React.createElement("polyline", {
						points: "6 9 12 15 18 9",
					}),
				);
			const IconSearch = (p) =>
				/*#__PURE__*/ React.createElement(
					Svg,
					p,
					/*#__PURE__*/ React.createElement("circle", {
						cx: "11",
						cy: "11",
						r: "7",
					}),
					/*#__PURE__*/ React.createElement("line", {
						x1: "21",
						y1: "21",
						x2: "16.65",
						y2: "16.65",
					}),
				);
			const IconPlus = (p) =>
				/*#__PURE__*/ React.createElement(
					Svg,
					p,
					/*#__PURE__*/ React.createElement("path", {
						d: "M12 5v14",
					}),
					/*#__PURE__*/ React.createElement("path", {
						d: "M5 12h14",
					}),
				);
			const IconCheck = (p) =>
				/*#__PURE__*/ React.createElement(
					Svg,
					p,
					/*#__PURE__*/ React.createElement("polyline", {
						points: "20 6 9 17 4 12",
					}),
				);
			const IconRefresh = (p) =>
				/*#__PURE__*/ React.createElement(
					Svg,
					p,
					/*#__PURE__*/ React.createElement("polyline", {
						points: "23 4 23 10 17 10",
					}),
					/*#__PURE__*/ React.createElement("polyline", {
						points: "1 20 1 14 7 14",
					}),
					/*#__PURE__*/ React.createElement("path", {
						d: "M3.51 9a9 9 0 0 1 14.85-3.36L23 10",
					}),
					/*#__PURE__*/ React.createElement("path", {
						d: "M20.49 15a9 9 0 0 1-14.85 3.36L1 14",
					}),
				);
			const IconGitPush = (p) =>
				/*#__PURE__*/ React.createElement(
					Svg,
					p,
					/*#__PURE__*/ React.createElement("line", {
						x1: "12",
						y1: "19",
						x2: "12",
						y2: "5",
					}),
					/*#__PURE__*/ React.createElement("polyline", {
						points: "5 12 12 5 19 12",
					}),
				);
			const IconGitPull = (p) =>
				/*#__PURE__*/ React.createElement(
					Svg,
					p,
					/*#__PURE__*/ React.createElement("line", {
						x1: "12",
						y1: "5",
						x2: "12",
						y2: "19",
					}),
					/*#__PURE__*/ React.createElement("polyline", {
						points: "19 12 12 19 5 12",
					}),
				);
			const IconMerge = (p) =>
				/*#__PURE__*/ React.createElement(
					Svg,
					p,
					/*#__PURE__*/ React.createElement("circle", {
						cx: "6",
						cy: "4",
						r: "2",
					}),
					/*#__PURE__*/ React.createElement("circle", {
						cx: "6",
						cy: "20",
						r: "2",
					}),
					/*#__PURE__*/ React.createElement("circle", {
						cx: "18",
						cy: "12",
						r: "2",
					}),
					/*#__PURE__*/ React.createElement("path", {
						d: "M6 6v12",
					}),
					/*#__PURE__*/ React.createElement("path", {
						d: "M18 10c-4 0-8-3-12-6",
					}),
				);
			const IconArrowRight = (p) =>
				/*#__PURE__*/ React.createElement(
					Svg,
					p,
					/*#__PURE__*/ React.createElement("line", {
						x1: "5",
						y1: "12",
						x2: "19",
						y2: "12",
					}),
					/*#__PURE__*/ React.createElement("polyline", {
						points: "12 5 19 12 12 19",
					}),
				);
			const IconEdit = (p) =>
				/*#__PURE__*/ React.createElement(
					Svg,
					p,
					/*#__PURE__*/ React.createElement("path", {
						d: "M12 20h9",
					}),
					/*#__PURE__*/ React.createElement("path", {
						d: "M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z",
					}),
				);
			const IconCopy = (p) =>
				/*#__PURE__*/ React.createElement(
					Svg,
					p,
					/*#__PURE__*/ React.createElement("rect", {
						x: "9",
						y: "9",
						width: "13",
						height: "13",
						rx: "2",
						ry: "2",
					}),
					/*#__PURE__*/ React.createElement("path", {
						d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
					}),
				);
			const IconTerminal = (p) =>
				/*#__PURE__*/ React.createElement(
					Svg,
					p,
					/*#__PURE__*/ React.createElement("polyline", {
						points: "4 17 10 11 4 5",
					}),
					/*#__PURE__*/ React.createElement("line", {
						x1: "12",
						y1: "19",
						x2: "20",
						y2: "19",
					}),
				);
			const IconTrash = (p) =>
				/*#__PURE__*/ React.createElement(
					Svg,
					p,
					/*#__PURE__*/ React.createElement("polyline", {
						points: "3 6 5 6 21 6",
					}),
					/*#__PURE__*/ React.createElement("path", {
						d: "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6",
					}),
					/*#__PURE__*/ React.createElement("path", {
						d: "M10 11v6M14 11v6",
					}),
				);
			const IconAlert = (p) =>
				/*#__PURE__*/ React.createElement(
					Svg,
					p,
					/*#__PURE__*/ React.createElement("path", {
						d: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
					}),
					/*#__PURE__*/ React.createElement("line", {
						x1: "12",
						y1: "9",
						x2: "12",
						y2: "13",
					}),
					/*#__PURE__*/ React.createElement("circle", {
						cx: "12",
						cy: "17",
						r: "0.5",
					}),
				);
			const IconFile = (p) =>
				/*#__PURE__*/ React.createElement(
					Svg,
					p,
					/*#__PURE__*/ React.createElement("path", {
						d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z",
					}),
					/*#__PURE__*/ React.createElement("polyline", {
						points: "14 2 14 8 20 8",
					}),
				);
			const IconCloud = (p) =>
				/*#__PURE__*/ React.createElement(
					Svg,
					p,
					/*#__PURE__*/ React.createElement("path", {
						d: "M17.5 19a4.5 4.5 0 0 0 0-9c-.28 0-.55.03-.82.08A6.5 6.5 0 0 0 4 12a5 5 0 0 0 5 7h8.5z",
					}),
				);
			const IconChanges = (p) =>
				/*#__PURE__*/ React.createElement(
					Svg,
					p,
					/*#__PURE__*/ React.createElement("path", {
						d: "M4 6h16M4 12h10M4 18h16",
					}),
				);
			const IconMax = (p) =>
				/*#__PURE__*/ React.createElement(
					Svg,
					p,
					/*#__PURE__*/ React.createElement("rect", {
						x: "4",
						y: "4",
						width: "16",
						height: "16",
						rx: "2",
					}),
				);
			const IconX = (p) =>
				/*#__PURE__*/ React.createElement(
					Svg,
					p,
					/*#__PURE__*/ React.createElement("line", {
						x1: "6",
						y1: "6",
						x2: "18",
						y2: "18",
					}),
					/*#__PURE__*/ React.createElement("line", {
						x1: "6",
						y1: "18",
						x2: "18",
						y2: "6",
					}),
				);
			const IconSort = (p) =>
				/*#__PURE__*/ React.createElement(
					Svg,
					p,
					/*#__PURE__*/ React.createElement("line", {
						x1: "5",
						y1: "7",
						x2: "19",
						y2: "7",
					}),
					/*#__PURE__*/ React.createElement("line", {
						x1: "7",
						y1: "12",
						x2: "17",
						y2: "12",
					}),
					/*#__PURE__*/ React.createElement("line", {
						x1: "10",
						y1: "17",
						x2: "14",
						y2: "17",
					}),
				);
			const IconMoreH = (p) =>
				/*#__PURE__*/ React.createElement(
					Svg,
					p,
					/*#__PURE__*/ React.createElement("circle", {
						cx: "6",
						cy: "12",
						r: "1.2",
					}),
					/*#__PURE__*/ React.createElement("circle", {
						cx: "12",
						cy: "12",
						r: "1.2",
					}),
					/*#__PURE__*/ React.createElement("circle", {
						cx: "18",
						cy: "12",
						r: "1.2",
					}),
				);
			const IconSpark = (p) =>
				/*#__PURE__*/ React.createElement(
					Svg,
					p,
					/*#__PURE__*/ React.createElement("path", {
						d: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
					}),
				);
			Object.assign(window, {
				IconBranch,
				IconChevron,
				IconSearch,
				IconPlus,
				IconCheck,
				IconRefresh,
				IconGitPush,
				IconGitPull,
				IconMerge,
				IconArrowRight,
				IconEdit,
				IconCopy,
				IconTerminal,
				IconTrash,
				IconAlert,
				IconFile,
				IconCloud,
				IconChanges,
				IconMax,
				IconX,
				IconSort,
				IconMoreH,
				IconSpark,
			});
		})();
	} catch (e) {
		__ds_ns.__errors.push({
			path: "icons.jsx",
			error: String(e?.message || e),
		});
	}

	// preview.jsx
	try {
		(() => {
			// Superset Design System — single-page preview (Dracula only).
			// Everything reads tokens from styles.css; components read components.css.

			function Card({ name, kind, children, wide }) {
				return /*#__PURE__*/ React.createElement(
					"div",
					{
						className: `ds-card${wide ? " wide" : ""}`,
					},
					/*#__PURE__*/ React.createElement(
						"header",
						null,
						/*#__PURE__*/ React.createElement("span", null, name),
						kind
							? /*#__PURE__*/ React.createElement(
									"span",
									{
										className: "kind",
									},
									kind,
								)
							: null,
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "body",
						},
						children,
					),
				);
			}
			function Section({ title, hint, children, gridClass }) {
				return /*#__PURE__*/ React.createElement(
					"section",
					{
						className: "ds-section",
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "ds-section-head",
						},
						/*#__PURE__*/ React.createElement(
							"h2",
							{
								className: "ds-section-title",
							},
							title,
						),
						hint
							? /*#__PURE__*/ React.createElement(
									"span",
									{
										className: "ds-section-hint",
									},
									hint,
								)
							: null,
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: `ds-grid ${gridClass || ""}`,
						},
						children,
					),
				);
			}

			/* ---------------------------------------- Foundations */

			const COLOR_TOKENS = [
				{
					v: "--page-bg",
					note: "app background",
				},
				{
					v: "--surface",
					note: "cards / editors",
				},
				{
					v: "--surface-elev",
					note: "raised inputs",
				},
				{
					v: "--surface-sunk",
					note: "popovers / menus",
				},
				{
					v: "--fg",
					note: "primary text",
				},
				{
					v: "--fg-mute",
					note: "secondary text",
				},
				{
					v: "--fg-faint",
					note: "tertiary / captions",
				},
				{
					v: "--line",
					note: "hairline dividers",
				},
				{
					v: "--line-strong",
					note: "strong dividers, buttons",
				},
				{
					v: "--accent",
					note: "brand pink",
				},
				{
					v: "--accent-2",
					note: "brand purple",
				},
				{
					v: "--accent-tint",
					note: "current-branch bg",
				},
				{
					v: "--success",
					note: "add / push OK",
				},
				{
					v: "--warning",
					note: "modified / behind",
				},
				{
					v: "--danger",
					note: "delete / errors",
				},
				{
					v: "--info",
					note: "informational",
				},
			];
			function ColorSwatchCard({ tokens, name }) {
				return /*#__PURE__*/ React.createElement(
					Card,
					{
						name: name,
						kind: "tokens",
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							style: {
								width: "100%",
							},
						},
						tokens.map((t) =>
							/*#__PURE__*/ React.createElement(
								"div",
								{
									key: t.v,
									className: "swatch-row",
								},
								/*#__PURE__*/ React.createElement("span", {
									className: "swatch-chip",
									style: {
										background: `var(${t.v})`,
									},
								}),
								/*#__PURE__*/ React.createElement(
									"span",
									{
										className: "swatch-name",
									},
									t.v,
								),
								/*#__PURE__*/ React.createElement(
									"span",
									{
										className: "swatch-val",
									},
									t.note,
								),
							),
						),
					),
				);
			}
			function TypeCard() {
				return /*#__PURE__*/ React.createElement(
					Card,
					{
						name: "Type \xB7 scale",
						kind: "css var",
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "type-specimen",
						},
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "type-display",
							},
							"Aa \u5206\u652F\u7BA1\u7406",
						),
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "meta",
							},
							"--fs-36 \xB7 --fw-semibold \xB7 --ls-title",
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "type-specimen",
						},
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "type-heading",
							},
							"Section title",
						),
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "meta",
							},
							"--fs-22 \xB7 --fw-semibold",
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "type-specimen",
						},
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "type-body",
							},
							"Body copy \u2014 the quick brown fox \u654F\u6377\u7684\u68D5\u8272\u72D0\u72F8",
						),
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "meta",
							},
							"--fs-13 \xB7 --lh-body 1.55",
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "type-specimen",
						},
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "type-mono",
							},
							"feat/kro-suite \xB7 \u2191 3 \u2193 0",
						),
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "meta",
							},
							"--font-mono \xB7 --fs-12",
						),
					),
				);
			}
			function SpacingCard() {
				const steps = [
					["--s-2", 4],
					["--s-3", 6],
					["--s-4", 8],
					["--s-6", 12],
					["--s-8", 16],
					["--s-12", 24],
					["--s-16", 32],
					["--s-24", 48],
				];
				return /*#__PURE__*/ React.createElement(
					Card,
					{
						name: "Spacing \xB7 4-based",
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "space-strip",
						},
						steps.map(([tok, px]) =>
							/*#__PURE__*/ React.createElement(
								"div",
								{
									key: tok,
									className: "step",
								},
								/*#__PURE__*/ React.createElement("div", {
									className: "bar",
									style: {
										width: px,
									},
								}),
								/*#__PURE__*/ React.createElement("span", null, px),
								/*#__PURE__*/ React.createElement(
									"span",
									{
										style: {
											opacity: 0.5,
										},
									},
									tok,
								),
							),
						),
					),
				);
			}
			function RadiusCard() {
				const steps = [
					["--r-2", 4],
					["--r-3", 6],
					["--r-4", 8],
					["--r-5", 10],
					["--r-6", 12],
					["--r-7", 14],
				];
				return /*#__PURE__*/ React.createElement(
					Card,
					{
						name: "Radius",
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "radius-strip",
						},
						steps.map(([tok, px]) =>
							/*#__PURE__*/ React.createElement(
								"div",
								{
									key: tok,
								},
								/*#__PURE__*/ React.createElement("div", {
									className: "box",
									style: {
										borderRadius: `var(${tok})`,
									},
								}),
								/*#__PURE__*/ React.createElement(
									"div",
									{
										className: "lbl",
									},
									px,
									"px",
								),
							),
						),
					),
				);
			}
			function ShadowCard() {
				return /*#__PURE__*/ React.createElement(
					Card,
					{
						name: "Shadow \xB7 elevation",
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "stack-3",
							style: {
								width: "100%",
							},
						},
						/*#__PURE__*/ React.createElement("div", {
							className: "shadow-slab",
							style: {
								boxShadow: "var(--shadow-1)",
							},
						}),
						/*#__PURE__*/ React.createElement("div", {
							className: "shadow-slab",
							style: {
								boxShadow: "var(--shadow-2)",
							},
						}),
						/*#__PURE__*/ React.createElement("div", {
							className: "shadow-slab",
							style: {
								boxShadow: "var(--shadow-3)",
							},
						}),
						/*#__PURE__*/ React.createElement("div", {
							className: "shadow-slab",
							style: {
								boxShadow: "var(--shadow-4)",
							},
						}),
					),
				);
			}
			function MotionCard() {
				return /*#__PURE__*/ React.createElement(
					Card,
					{
						name: "Motion \xB7 durations & easings",
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "motion-strip",
						},
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "row",
							},
							/*#__PURE__*/ React.createElement("span", null, "--dur-instant"),
							/*#__PURE__*/ React.createElement("code", null, "80ms"),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "row",
							},
							/*#__PURE__*/ React.createElement("span", null, "--dur-quick"),
							/*#__PURE__*/ React.createElement("code", null, "120ms"),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "row",
							},
							/*#__PURE__*/ React.createElement("span", null, "--dur-base"),
							/*#__PURE__*/ React.createElement("code", null, "180ms"),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "row",
							},
							/*#__PURE__*/ React.createElement("span", null, "--dur-slow"),
							/*#__PURE__*/ React.createElement("code", null, "260ms"),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "row",
							},
							/*#__PURE__*/ React.createElement(
								"span",
								null,
								"--ease-standard",
							),
							/*#__PURE__*/ React.createElement(
								"code",
								null,
								"0.2, 0.7, 0.3, 1",
							),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "row",
							},
							/*#__PURE__*/ React.createElement("span", null, "--ease-out"),
							/*#__PURE__*/ React.createElement(
								"code",
								null,
								"0.16, 1, 0.3, 1",
							),
						),
					),
				);
			}

			/* ---------------------------------------- Components */

			function PillCard() {
				return /*#__PURE__*/ React.createElement(
					Card,
					{
						name: "Pill \xB7 branch trigger",
					},
					/*#__PURE__*/ React.createElement(
						"button",
						{
							className: "pill",
						},
						/*#__PURE__*/ React.createElement(IconBranch, {
							className: "glyph",
						}),
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "label",
							},
							"feat/kro-suite",
						),
						/*#__PURE__*/ React.createElement(IconChevron, {
							className: "chev",
						}),
					),
					/*#__PURE__*/ React.createElement(
						"button",
						{
							className: "pill",
							"aria-expanded": "true",
						},
						/*#__PURE__*/ React.createElement(IconBranch, {
							className: "glyph",
						}),
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "label",
							},
							"main",
						),
						/*#__PURE__*/ React.createElement(IconChevron, {
							className: "chev",
							style: {
								transform: "rotate(180deg)",
							},
						}),
					),
				);
			}
			function ButtonCard() {
				return /*#__PURE__*/ React.createElement(
					Card,
					{
						name: "Button",
						kind: ".btn",
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "stack-4",
							style: {
								width: "100%",
							},
						},
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "row-4",
							},
							/*#__PURE__*/ React.createElement(
								"button",
								{
									className: "btn primary",
								},
								/*#__PURE__*/ React.createElement(IconGitPush, null),
								" Commit & Push",
							),
							/*#__PURE__*/ React.createElement(
								"button",
								{
									className: "btn",
								},
								"Cancel",
							),
							/*#__PURE__*/ React.createElement(
								"button",
								{
									className: "btn ghost",
								},
								"Skip",
							),
							/*#__PURE__*/ React.createElement(
								"button",
								{
									className: "btn danger",
								},
								/*#__PURE__*/ React.createElement(IconTrash, null),
								" Delete",
							),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "row-4",
							},
							/*#__PURE__*/ React.createElement(
								"button",
								{
									className: "btn sm primary",
								},
								"Save",
							),
							/*#__PURE__*/ React.createElement(
								"button",
								{
									className: "btn sm",
								},
								"Reset",
							),
							/*#__PURE__*/ React.createElement(
								"button",
								{
									className: "btn sm",
									disabled: true,
								},
								"Loading\u2026",
							),
						),
					),
				);
			}
			function IconButtonCard() {
				return /*#__PURE__*/ React.createElement(
					Card,
					{
						name: "Icon button \xB7 row",
						kind: ".icon-btn",
					},
					/*#__PURE__*/ React.createElement(
						"button",
						{
							className: "icon-btn",
							title: "Refresh",
						},
						/*#__PURE__*/ React.createElement(IconRefresh, null),
					),
					/*#__PURE__*/ React.createElement(
						"button",
						{
							className: "icon-btn",
							title: "Sort",
						},
						/*#__PURE__*/ React.createElement(IconSort, null),
					),
					/*#__PURE__*/ React.createElement(
						"button",
						{
							className: "icon-btn",
							title: "More",
						},
						/*#__PURE__*/ React.createElement(IconMoreH, null),
					),
					/*#__PURE__*/ React.createElement(
						"button",
						{
							className: "icon-btn",
							title: "Maximize",
						},
						/*#__PURE__*/ React.createElement(IconMax, null),
					),
					/*#__PURE__*/ React.createElement(
						"button",
						{
							className: "icon-btn",
							title: "Close",
						},
						/*#__PURE__*/ React.createElement(IconX, null),
					),
				);
			}
			function ChipCard() {
				return /*#__PURE__*/ React.createElement(
					Card,
					{
						name: "Chip \xB7 file summary",
					},
					/*#__PURE__*/ React.createElement(
						"span",
						{
							className: "chip",
						},
						/*#__PURE__*/ React.createElement("span", {
							className: "dot mod",
						}),
						" 4 modified",
					),
					/*#__PURE__*/ React.createElement(
						"span",
						{
							className: "chip",
						},
						/*#__PURE__*/ React.createElement("span", {
							className: "dot add",
						}),
						" 2 added",
					),
					/*#__PURE__*/ React.createElement(
						"span",
						{
							className: "chip",
						},
						/*#__PURE__*/ React.createElement("span", {
							className: "dot del",
						}),
						" 1 deleted",
					),
				);
			}
			function BadgeCard() {
				return /*#__PURE__*/ React.createElement(
					Card,
					{
						name: "Badge \xB7 file status",
					},
					/*#__PURE__*/ React.createElement(
						"span",
						{
							className: "badge add",
						},
						"A",
					),
					/*#__PURE__*/ React.createElement(
						"span",
						{
							className: "badge mod",
						},
						"M",
					),
					/*#__PURE__*/ React.createElement(
						"span",
						{
							className: "badge del",
						},
						"D",
					),
					/*#__PURE__*/ React.createElement(
						"span",
						{
							className: "badge",
						},
						"R",
					),
					/*#__PURE__*/ React.createElement(
						"span",
						{
							className: "badge pill",
						},
						"\u5F53\u524D",
					),
				);
			}
			function TagCard() {
				return /*#__PURE__*/ React.createElement(
					Card,
					{
						name: "Tag \xB7 ahead / behind",
					},
					/*#__PURE__*/ React.createElement(
						"span",
						{
							className: "tag up",
						},
						"\u2191 3",
					),
					/*#__PURE__*/ React.createElement(
						"span",
						{
							className: "tag down",
						},
						"\u2193 12",
					),
					/*#__PURE__*/ React.createElement(
						"span",
						{
							className: "tag",
						},
						"origin",
					),
					/*#__PURE__*/ React.createElement(
						"span",
						{
							className: "kbd",
						},
						"\u2318K",
					),
					/*#__PURE__*/ React.createElement(
						"span",
						{
							className: "kbd",
						},
						"Esc",
					),
				);
			}
			function InputCard() {
				return /*#__PURE__*/ React.createElement(
					Card,
					{
						name: "Input \xB7 search + text",
						kind: ".input",
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "stack-3",
							style: {
								width: "100%",
							},
						},
						/*#__PURE__*/ React.createElement(
							"label",
							{
								className: "input",
							},
							/*#__PURE__*/ React.createElement(IconSearch, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement("input", {
								placeholder: "Jump to branch, or type to create\u2026",
								defaultValue: "feat/",
							}),
						),
						/*#__PURE__*/ React.createElement(
							"label",
							{
								className: "input transparent",
							},
							/*#__PURE__*/ React.createElement(IconBranch, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement("input", {
								placeholder: "feat/new-branch",
							}),
						),
					),
				);
			}
			function CheckboxCard() {
				const [on, setOn] = React.useState(true);
				const [switchOn, setSwitchOn] = React.useState(true);
				return /*#__PURE__*/ React.createElement(
					Card,
					{
						name: "Checkbox \xB7 switch",
					},
					/*#__PURE__*/ React.createElement(
						"label",
						{
							className: "check",
						},
						/*#__PURE__*/ React.createElement("input", {
							type: "checkbox",
							checked: on,
							onChange: (e) => setOn(e.target.checked),
						}),
						/*#__PURE__*/ React.createElement("span", {
							className: "box",
							"aria-hidden": true,
						}),
						"\u521B\u5EFA\u540E\u5207\u6362\u5230\u6B64\u5206\u652F",
					),
					/*#__PURE__*/ React.createElement(
						"label",
						{
							className: "check",
						},
						/*#__PURE__*/ React.createElement("input", {
							type: "checkbox",
						}),
						/*#__PURE__*/ React.createElement("span", {
							className: "box",
							"aria-hidden": true,
						}),
						"Include tags",
					),
					/*#__PURE__*/ React.createElement("span", {
						className: "switch",
						role: "switch",
						"aria-checked": switchOn,
						onClick: () => setSwitchOn((v) => !v),
					}),
				);
			}
			function SegmentedCard() {
				const [tab, setTab] = React.useState("Local");
				return /*#__PURE__*/ React.createElement(
					Card,
					{
						name: "Segmented control",
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "segmented",
						},
						["Local", "Remote", "Tag"].map((t) =>
							/*#__PURE__*/ React.createElement(
								"button",
								{
									key: t,
									className: t === tab ? "is-active" : "",
									onClick: () => setTab(t),
								},
								t,
							),
						),
					),
				);
			}
			function TabsCard() {
				const [tab, setTab] = React.useState("Changes");
				return /*#__PURE__*/ React.createElement(
					Card,
					{
						name: "Tabs \xB7 Changes / Files",
						wide: true,
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "tabs",
							style: {
								width: "100%",
							},
						},
						[
							{
								id: "Changes",
								icon: IconChanges,
							},
							{
								id: "Files",
								icon: IconFile,
							},
							{
								id: "History",
								icon: IconRefresh,
							},
						].map((t) => {
							const Icon = t.icon;
							return /*#__PURE__*/ React.createElement(
								"button",
								{
									key: t.id,
									className: `tab${t.id === tab ? " is-active" : ""}`,
									onClick: () => setTab(t.id),
								},
								/*#__PURE__*/ React.createElement(Icon, null),
								" ",
								t.id,
							);
						}),
					),
				);
			}
			function PopoverCard() {
				return /*#__PURE__*/ React.createElement(
					Card,
					{
						name: "Popover \xB7 branch list",
						wide: true,
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "popover",
							style: {
								margin: "6px 0",
							},
						},
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "popover-head",
							},
							/*#__PURE__*/ React.createElement(IconSearch, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement("input", {
								placeholder: "Jump to branch, or type to create\u2026",
								defaultValue: "",
							}),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "popover-group",
							},
							/*#__PURE__*/ React.createElement(
								"span",
								null,
								"\u672C\u5730\u5206\u652F \xB7 4",
							),
							/*#__PURE__*/ React.createElement(
								"button",
								{
									className: "action",
								},
								/*#__PURE__*/ React.createElement(IconPlus, null),
								" \u65B0\u5EFA",
							),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							null,
							/*#__PURE__*/ React.createElement(
								"div",
								{
									className: "popover-row is-current",
								},
								/*#__PURE__*/ React.createElement(IconBranch, {
									className: "glyph",
								}),
								/*#__PURE__*/ React.createElement(
									"span",
									{
										className: "name",
									},
									"feat/kro-suite",
								),
								/*#__PURE__*/ React.createElement(
									"span",
									{
										className: "tag up",
									},
									"\u2191 3",
								),
								/*#__PURE__*/ React.createElement(
									"span",
									{
										className: "end",
									},
									/*#__PURE__*/ React.createElement(IconCheck, {
										size: 12,
										className: "check-icon",
									}),
								),
							),
							/*#__PURE__*/ React.createElement(
								"div",
								{
									className: "popover-row",
								},
								/*#__PURE__*/ React.createElement(IconBranch, {
									className: "glyph",
								}),
								/*#__PURE__*/ React.createElement(
									"span",
									{
										className: "name",
									},
									"bugfix/reap-legacy-orphans",
								),
								/*#__PURE__*/ React.createElement(
									"span",
									{
										className: "tag down",
									},
									"\u2193 2",
								),
								/*#__PURE__*/ React.createElement(
									"span",
									{
										className: "end",
									},
									"2d",
								),
							),
							/*#__PURE__*/ React.createElement(
								"div",
								{
									className: "popover-row is-focused",
								},
								/*#__PURE__*/ React.createElement(IconBranch, {
									className: "glyph",
								}),
								/*#__PURE__*/ React.createElement(
									"span",
									{
										className: "name",
									},
									"main",
								),
								/*#__PURE__*/ React.createElement(
									"span",
									{
										className: "tag down",
									},
									"\u2193 12",
								),
								/*#__PURE__*/ React.createElement(
									"span",
									{
										className: "end",
									},
									"1w",
								),
							),
						),
						/*#__PURE__*/ React.createElement("div", {
							className: "popover-sep",
						}),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "popover-group",
							},
							/*#__PURE__*/ React.createElement(
								"span",
								null,
								"\u8FDC\u7A0B \xB7 2",
							),
							/*#__PURE__*/ React.createElement(
								"button",
								{
									className: "action",
								},
								/*#__PURE__*/ React.createElement(IconRefresh, null),
								" Fetch",
							),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							null,
							/*#__PURE__*/ React.createElement(
								"div",
								{
									className: "popover-row",
								},
								/*#__PURE__*/ React.createElement(IconCloud, {
									className: "glyph",
								}),
								/*#__PURE__*/ React.createElement(
									"span",
									{
										className: "name",
									},
									"feat/mcp-cursor-connector",
								),
								/*#__PURE__*/ React.createElement(
									"span",
									{
										className: "end",
									},
									"origin",
								),
							),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "popover-hint",
							},
							/*#__PURE__*/ React.createElement(
								"span",
								null,
								"\u53F3\u952E\u4EFB\u610F\u5206\u652F\u67E5\u770B\u64CD\u4F5C",
							),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "row-3",
								},
								/*#__PURE__*/ React.createElement(
									"span",
									{
										className: "kbd",
									},
									"\u21B5",
								),
								/*#__PURE__*/ React.createElement(
									"span",
									{
										className: "faint",
									},
									"\u5207\u6362",
								),
							),
						),
					),
				);
			}
			function ContextMenuCard() {
				return /*#__PURE__*/ React.createElement(
					Card,
					{
						name: "Context menu \xB7 branch ops",
						wide: true,
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "menu",
							style: {
								margin: "6px 0",
							},
						},
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "menu-heading",
							},
							/*#__PURE__*/ React.createElement(IconBranch, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								null,
								"feat/browser-use",
							),
						),
						/*#__PURE__*/ React.createElement("div", {
							className: "menu-sep",
						}),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "menu-group",
							},
							"\u5206\u652F\u64CD\u4F5C",
						),
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "menu-item",
							},
							/*#__PURE__*/ React.createElement(IconArrowRight, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "label",
								},
								"\u5207\u6362\u5230\u6B64\u5206\u652F",
							),
						),
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "menu-item",
							},
							/*#__PURE__*/ React.createElement(IconMerge, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "label",
								},
								"\u5408\u5E76\u5230 \u5F53\u524D\u5206\u652F",
							),
						),
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "menu-item",
							},
							/*#__PURE__*/ React.createElement(IconPlus, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "label",
								},
								"\u4ECE\u6B64\u5206\u652F\u65B0\u5EFA\u2026",
							),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "menu-group",
							},
							"\u540C\u6B65",
						),
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "menu-item",
							},
							/*#__PURE__*/ React.createElement(IconGitPull, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "label",
								},
								"\u62C9\u53D6",
							),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "tag down",
								},
								"\u2193 2",
							),
						),
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "menu-item",
							},
							/*#__PURE__*/ React.createElement(IconGitPush, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "label",
								},
								"\u63A8\u9001",
							),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "tag up",
								},
								"\u2191 3",
							),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "menu-group",
							},
							"\u7BA1\u7406",
						),
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "menu-item",
							},
							/*#__PURE__*/ React.createElement(IconEdit, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "label",
								},
								"\u91CD\u547D\u540D\u2026",
							),
						),
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "menu-item",
							},
							/*#__PURE__*/ React.createElement(IconCopy, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "label",
								},
								"\u590D\u5236\u5206\u652F\u540D",
							),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "kbd",
								},
								"\u2318C",
							),
						),
						/*#__PURE__*/ React.createElement("div", {
							className: "menu-sep",
						}),
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "menu-item is-danger",
							},
							/*#__PURE__*/ React.createElement(IconTrash, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "label",
								},
								"\u5220\u9664\u5206\u652F",
							),
						),
					),
				);
			}
			function ConfirmCard() {
				return /*#__PURE__*/ React.createElement(
					Card,
					{
						name: "Confirm \xB7 destructive",
						wide: true,
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "confirm",
							style: {
								margin: "6px auto",
							},
						},
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "icon",
							},
							/*#__PURE__*/ React.createElement(IconAlert, null),
						),
						/*#__PURE__*/ React.createElement(
							"h3",
							{
								className: "title",
							},
							"\u5220\u9664\u5206\u652F",
						),
						/*#__PURE__*/ React.createElement(
							"p",
							{
								className: "body",
							},
							"\u8FD9\u4F1A\u4ECE\u672C\u5730\u6C38\u4E45\u5220\u9664\u5206\u652F ",
							/*#__PURE__*/ React.createElement(
								"code",
								null,
								"bugfix/reap-legacy-orphans",
							),
							",\u5176\u4E2D\u8FD8\u6709 ",
							/*#__PURE__*/ React.createElement("code", null, "2"),
							" \u4E2A\u672A\u63A8\u9001\u7684\u63D0\u4EA4\u3002\u6B64\u64CD\u4F5C\u65E0\u6CD5\u5728\u5E94\u7528\u5185\u64A4\u9500\u3002",
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "actions",
							},
							/*#__PURE__*/ React.createElement(
								"button",
								{
									className: "btn",
								},
								"\u53D6\u6D88",
							),
							/*#__PURE__*/ React.createElement(
								"button",
								{
									className: "btn danger",
								},
								"\u5220\u9664",
							),
						),
					),
				);
			}
			function ToastCard() {
				return /*#__PURE__*/ React.createElement(
					Card,
					{
						name: "Toast \xB7 action feedback",
						wide: true,
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "stack-3",
						},
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "toast success",
							},
							/*#__PURE__*/ React.createElement(IconCheck, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								null,
								"\u5DF2\u5207\u6362\u5230 feat/kro-suite",
							),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "toast",
							},
							/*#__PURE__*/ React.createElement(IconGitPull, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								null,
								"\u5DF2\u62C9\u53D6 main \xB7 12 commits",
							),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "toast warn",
							},
							/*#__PURE__*/ React.createElement(IconAlert, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								null,
								"\u63A8\u9001\u65F6\u53D1\u73B0\u51B2\u7A81,\u8BF7\u5148 pull",
							),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "toast error",
							},
							/*#__PURE__*/ React.createElement(IconX, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								null,
								"fetch \u5931\u8D25:\u65E0\u6CD5\u8FDE\u63A5 origin",
							),
						),
					),
				);
			}
			function FileRowCard() {
				return /*#__PURE__*/ React.createElement(
					Card,
					{
						name: "File row \xB7 Changes",
						wide: true,
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "stack-3",
							style: {
								width: "100%",
							},
						},
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "file-row",
							},
							/*#__PURE__*/ React.createElement(IconFile, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "dir",
								},
								"apps/desktop/src/renderer/",
							),
							/*#__PURE__*/ React.createElement("span", null, "MainView.tsx"),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "badge mod",
								},
								"M",
							),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "file-row",
							},
							/*#__PURE__*/ React.createElement(IconFile, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "dir",
								},
								"apps/desktop/src/renderer/hooks/",
							),
							/*#__PURE__*/ React.createElement(
								"span",
								null,
								"useBranchMenu.ts",
							),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "badge add",
								},
								"A",
							),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "file-row",
							},
							/*#__PURE__*/ React.createElement(IconFile, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "dir",
								},
								"packages/ui/src/",
							),
							/*#__PURE__*/ React.createElement("span", null, "popover.tsx"),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "badge del",
								},
								"D",
							),
						),
					),
				);
			}

			/* ---------------------------------------- UI kit — Changes panel */

			function ChangesKit() {
				return /*#__PURE__*/ React.createElement(
					"div",
					{
						className: "kit-changes",
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "tabs",
						},
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "tab is-active",
							},
							/*#__PURE__*/ React.createElement(IconChanges, null),
							" Changes",
						),
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "tab",
							},
							/*#__PURE__*/ React.createElement(IconFile, null),
							" Files",
						),
						/*#__PURE__*/ React.createElement("span", {
							style: {
								flex: 1,
							},
						}),
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "icon-btn",
							},
							/*#__PURE__*/ React.createElement(IconMax, null),
						),
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "icon-btn",
							},
							/*#__PURE__*/ React.createElement(IconX, null),
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "branch-bar",
						},
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "pill",
								"aria-expanded": "true",
							},
							/*#__PURE__*/ React.createElement(IconBranch, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "label",
								},
								"feat/kro-suite",
							),
							/*#__PURE__*/ React.createElement(IconChevron, {
								className: "chev",
								style: {
									transform: "rotate(180deg)",
								},
							}),
						),
						/*#__PURE__*/ React.createElement("span", {
							style: {
								flex: 1,
							},
						}),
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "icon-btn",
							},
							/*#__PURE__*/ React.createElement(IconSort, null),
						),
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "icon-btn",
							},
							/*#__PURE__*/ React.createElement(IconRefresh, null),
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "summary-bar",
						},
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "chip",
							},
							/*#__PURE__*/ React.createElement("span", {
								className: "dot mod",
							}),
							" 5 modified",
						),
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "chip",
							},
							/*#__PURE__*/ React.createElement("span", {
								className: "dot add",
							}),
							" 2 added",
						),
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "chip",
							},
							/*#__PURE__*/ React.createElement("span", {
								className: "dot del",
							}),
							" 1 deleted",
						),
						/*#__PURE__*/ React.createElement("span", {
							className: "spacer",
						}),
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "icon-btn",
							},
							/*#__PURE__*/ React.createElement(IconMoreH, null),
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "files",
						},
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "file-row",
							},
							/*#__PURE__*/ React.createElement(IconFile, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "dir",
								},
								"apps/desktop/src/renderer/",
							),
							/*#__PURE__*/ React.createElement("span", null, "MainView.tsx"),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "badge mod",
								},
								"M",
							),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "file-row",
							},
							/*#__PURE__*/ React.createElement(IconFile, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "dir",
								},
								"apps/desktop/src/main/",
							),
							/*#__PURE__*/ React.createElement("span", null, "index.ts"),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "badge mod",
								},
								"M",
							),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "file-row",
							},
							/*#__PURE__*/ React.createElement(IconFile, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "dir",
								},
								"apps/desktop/src/lib/trpc/routers/",
							),
							/*#__PURE__*/ React.createElement("span", null, "branches.ts"),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "badge mod",
								},
								"M",
							),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "file-row",
							},
							/*#__PURE__*/ React.createElement(IconFile, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "dir",
								},
								"apps/desktop/src/renderer/hooks/",
							),
							/*#__PURE__*/ React.createElement(
								"span",
								null,
								"useBranchMenu.ts",
							),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "badge add",
								},
								"A",
							),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "file-row",
							},
							/*#__PURE__*/ React.createElement(IconFile, {
								className: "glyph",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "dir",
								},
								"packages/ui/src/",
							),
							/*#__PURE__*/ React.createElement("span", null, "popover.tsx"),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "badge del",
								},
								"D",
							),
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "commit",
						},
						/*#__PURE__*/ React.createElement("textarea", {
							defaultValue: "feat(branch-menu): move ops into right-click menu",
						}),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "row",
							},
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "hint",
								},
								"On ",
								/*#__PURE__*/ React.createElement("b", null, "feat/kro-suite"),
								" \xB7 8 files",
							),
							/*#__PURE__*/ React.createElement(
								"button",
								{
									className: "btn primary",
								},
								/*#__PURE__*/ React.createElement(IconGitPush, null),
								" Commit & Push",
							),
						),
					),
				);
			}

			/* ---------------------------------------- App */

			function App() {
				return /*#__PURE__*/ React.createElement(
					"main",
					{
						className: "ds-page",
					},
					/*#__PURE__*/ React.createElement(
						"header",
						{
							className: "ds-head",
						},
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "titles",
							},
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "ds-eyebrow",
								},
								"Superset \xB7 Design System \xB7 v0.1",
							),
							/*#__PURE__*/ React.createElement(
								"h1",
								{
									className: "ds-title",
								},
								"Superset Design System",
								/*#__PURE__*/ React.createElement(
									"span",
									{
										className: "sub",
									},
									" \u2014 \u4ECE Branch Menu v3 \u62BD\u51FA\u6765\u7684\u4E00\u6574\u5957\u8BED\u8A00",
								),
							),
							/*#__PURE__*/ React.createElement(
								"p",
								{
									className: "ds-desc",
								},
								"\u5355\u4E3B\u9898(Dracula),\u5148\u628A tokens \u548C\u5E38\u7528\u7EC4\u4EF6\u94FA\u51FA\u6765\u3002\u7C89\u8272\u53EA\u505A tint / dot / ring,\u4E3B\u4F53\u4EA4\u7ED9\u4E2D\u6027\u8272\u3002\u6240\u6709\u7EC4\u4EF6\u4ECE",
								" ",
								/*#__PURE__*/ React.createElement(
									"code",
									{
										className: "mono",
									},
									"tokens/*.css",
								),
								" \u6D3E\u751F,\u6362\u4E3B\u9898\u53EA\u9700\u8981\u8986\u76D6 tokens\u3002",
							),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "row-3",
							},
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "badge pill",
								},
								"Dracula",
							),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "chip",
								},
								/*#__PURE__*/ React.createElement("span", {
									className: "dot",
								}),
								" single theme",
							),
						),
					),
					/*#__PURE__*/ React.createElement(
						Section,
						{
							title: "Foundations \xB7 Colors",
						},
						/*#__PURE__*/ React.createElement(ColorSwatchCard, {
							name: "Semantic tokens",
							tokens: COLOR_TOKENS.slice(0, 8),
						}),
						/*#__PURE__*/ React.createElement(ColorSwatchCard, {
							name: "Accent & status",
							tokens: COLOR_TOKENS.slice(8),
						}),
					),
					/*#__PURE__*/ React.createElement(
						Section,
						{
							title: "Foundations \xB7 Type / Space / Radius / Shadow / Motion",
						},
						/*#__PURE__*/ React.createElement(TypeCard, null),
						/*#__PURE__*/ React.createElement(SpacingCard, null),
						/*#__PURE__*/ React.createElement(RadiusCard, null),
						/*#__PURE__*/ React.createElement(ShadowCard, null),
						/*#__PURE__*/ React.createElement(MotionCard, null),
					),
					/*#__PURE__*/ React.createElement(
						Section,
						{
							title: "Components \xB7 Primitives",
						},
						/*#__PURE__*/ React.createElement(PillCard, null),
						/*#__PURE__*/ React.createElement(ButtonCard, null),
						/*#__PURE__*/ React.createElement(IconButtonCard, null),
						/*#__PURE__*/ React.createElement(ChipCard, null),
						/*#__PURE__*/ React.createElement(BadgeCard, null),
						/*#__PURE__*/ React.createElement(TagCard, null),
						/*#__PURE__*/ React.createElement(InputCard, null),
						/*#__PURE__*/ React.createElement(CheckboxCard, null),
						/*#__PURE__*/ React.createElement(SegmentedCard, null),
						/*#__PURE__*/ React.createElement(TabsCard, null),
						/*#__PURE__*/ React.createElement(FileRowCard, null),
					),
					/*#__PURE__*/ React.createElement(
						Section,
						{
							title: "Components \xB7 Overlays",
						},
						/*#__PURE__*/ React.createElement(PopoverCard, null),
						/*#__PURE__*/ React.createElement(ContextMenuCard, null),
						/*#__PURE__*/ React.createElement(ConfirmCard, null),
						/*#__PURE__*/ React.createElement(ToastCard, null),
					),
					/*#__PURE__*/ React.createElement(
						Section,
						{
							title: "UI kit \xB7 Changes panel (composed)",
						},
						/*#__PURE__*/ React.createElement(
							"div",
							{
								style: {
									gridColumn: "1 / -1",
									display: "flex",
									justifyContent: "center",
								},
							},
							/*#__PURE__*/ React.createElement(ChangesKit, null),
						),
					),
				);
			}
			ReactDOM.createRoot(document.getElementById("root")).render(
				/*#__PURE__*/ React.createElement(App, null),
			);
		})();
	} catch (e) {
		__ds_ns.__errors.push({
			path: "preview.jsx",
			error: String(e?.message || e),
		});
	}

	// ui_kits/desktop-app/app.jsx
	try {
		(() => {
			// Superset Desktop main view — composed entirely from the DS bundle. Renderer
			// state (workspaces, threads, files) is fixture data; every visual comes from
			// window.SupersetDesignSystem_91a6da.

			const {
				Icon,
				IconButton,
				Button,
				Pill,
				Badge,
				Chip,
				Tag,
				Kbd,
				Input,
				Toast,
				Tabs,
				FileRow,
				WorkspaceItem,
				Popover,
				PopoverHeader,
				PopoverGroup,
				PopoverRow,
				PopoverSep,
				PopoverHint,
			} = window.SupersetDesignSystem_91a6da;
			const WORKSPACES = [
				{
					id: "wf1",
					name: "feat/kro-suite",
					state: "running",
					meta: "3m",
				},
				{
					id: "wf2",
					name: "bugfix/reap-legacy-orphans",
					state: "ok",
					meta: "2d",
				},
				{
					id: "wf3",
					name: "backup/pre-filter-kro-suite",
					state: "idle",
					meta: "5h",
				},
				{
					id: "wf4",
					name: "feat/browser-extension-bridge",
					state: "warn",
					meta: "4d",
				},
				{
					id: "wf5",
					name: "electron-final",
					state: "err",
					meta: "3d",
				},
			];
			const BATCH = [
				{
					id: "b1",
					name: "chore/deps-2026-08",
					state: "ok",
					meta: "1w",
				},
				{
					id: "b2",
					name: "release/2026-08",
					state: "idle",
					meta: "1w",
				},
			];
			function WinChrome() {
				return /*#__PURE__*/ React.createElement(
					"div",
					{
						className: "win-chrome",
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "lights",
						},
						/*#__PURE__*/ React.createElement("span", {
							className: "light r",
						}),
						/*#__PURE__*/ React.createElement("span", {
							className: "light y",
						}),
						/*#__PURE__*/ React.createElement("span", {
							className: "light g",
						}),
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "mono faint",
								style: {
									marginLeft: 12,
									fontSize: "var(--fs-10)",
								},
							},
							"wufan \xB7 superset",
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "tabs-strip",
						},
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "win-tab is-active",
							},
							/*#__PURE__*/ React.createElement(Icon, {
								name: "branch",
								className: "glyph",
								size: 11,
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "name",
								},
								"feat/kro-suite",
							),
							/*#__PURE__*/ React.createElement("span", {
								className: "dot",
								title: "unsaved",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "close",
								},
								/*#__PURE__*/ React.createElement(Icon, {
									name: "x",
									size: 10,
								}),
							),
						),
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "win-tab",
							},
							/*#__PURE__*/ React.createElement(Icon, {
								name: "branch",
								className: "glyph",
								size: 11,
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "name",
								},
								"bugfix/reap-legacy-orphans",
							),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "close",
								},
								/*#__PURE__*/ React.createElement(Icon, {
									name: "x",
									size: 10,
								}),
							),
						),
						/*#__PURE__*/ React.createElement(
							"button",
							{
								className: "win-tab",
							},
							/*#__PURE__*/ React.createElement(Icon, {
								name: "branch",
								className: "glyph",
								size: 11,
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "name",
								},
								"chore/deps-2026-08",
							),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "close",
								},
								/*#__PURE__*/ React.createElement(Icon, {
									name: "x",
									size: 10,
								}),
							),
						),
						/*#__PURE__*/ React.createElement(
							IconButton,
							{
								title: "New tab",
							},
							/*#__PURE__*/ React.createElement(Icon, {
								name: "plus",
							}),
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "win-actions",
						},
						/*#__PURE__*/ React.createElement(
							Chip,
							null,
							/*#__PURE__*/ React.createElement(Icon, {
								name: "spark",
								size: 12,
							}),
							" Opus 5",
						),
						/*#__PURE__*/ React.createElement(
							IconButton,
							{
								title: "Refresh",
							},
							/*#__PURE__*/ React.createElement(Icon, {
								name: "refresh",
							}),
						),
						/*#__PURE__*/ React.createElement(
							IconButton,
							{
								title: "More",
							},
							/*#__PURE__*/ React.createElement(Icon, {
								name: "moreH",
							}),
						),
					),
				);
			}
			function Sidebar({ active, setActive }) {
				return /*#__PURE__*/ React.createElement(
					"aside",
					{
						className: "side",
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "head",
						},
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "avatar",
							},
							"SU",
						),
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "who",
							},
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "name",
								},
								"superset",
							),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "org",
								},
								"wufan17 \xB7 main",
							),
						),
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "push",
							},
							/*#__PURE__*/ React.createElement(
								IconButton,
								{
									title: "New workspace",
								},
								/*#__PURE__*/ React.createElement(Icon, {
									name: "plus",
								}),
							),
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "search-row",
						},
						/*#__PURE__*/ React.createElement(Input, {
							iconName: "search",
							placeholder: "Jump to workspace\u2026",
							trailing: /*#__PURE__*/ React.createElement(Kbd, null, "\u2318K"),
						}),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "group",
						},
						/*#__PURE__*/ React.createElement("span", null, "Workspaces"),
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "count",
							},
							WORKSPACES.length,
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "ws-list",
						},
						WORKSPACES.map((w) =>
							/*#__PURE__*/ React.createElement(WorkspaceItem, {
								key: w.id,
								name: w.name,
								state: w.state,
								meta: w.meta,
								active: active === w.id,
								onClick: () => setActive(w.id),
							}),
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "group",
						},
						/*#__PURE__*/ React.createElement(
							"span",
							null,
							"Batch \xB7 release-2026-08",
						),
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "count",
							},
							BATCH.length,
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "ws-list",
						},
						BATCH.map((w) =>
							/*#__PURE__*/ React.createElement(WorkspaceItem, {
								key: w.id,
								name: w.name,
								state: w.state,
								meta: w.meta,
								active: active === w.id,
								onClick: () => setActive(w.id),
							}),
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "foot",
						},
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "mono faint",
							},
							"v1.19.0",
						),
						/*#__PURE__*/ React.createElement("span", {
							className: "spacer",
						}),
						/*#__PURE__*/ React.createElement(
							IconButton,
							{
								title: "Settings",
							},
							/*#__PURE__*/ React.createElement(Icon, {
								name: "moreH",
							}),
						),
					),
				);
			}
			function ToolCallCard({ name, arg, body, done = true, seconds = "1.2" }) {
				return /*#__PURE__*/ React.createElement(
					"div",
					{
						className: "tool-call",
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "th",
						},
						/*#__PURE__*/ React.createElement(Icon, {
							name: "terminal",
							className: "glyph",
							size: 12,
						}),
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "name",
							},
							name,
						),
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "arg",
							},
							arg,
						),
						/*#__PURE__*/ React.createElement("span", {
							className: "spacer",
						}),
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "status",
							},
							done
								? /*#__PURE__*/ React.createElement(
										React.Fragment,
										null,
										/*#__PURE__*/ React.createElement(Icon, {
											name: "check",
											size: 11,
										}),
										" ",
										seconds,
										"s",
									)
								: /*#__PURE__*/ React.createElement(
										React.Fragment,
										null,
										"\u2026 running",
									),
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "body",
						},
						body,
					),
				);
			}
			function CodeBlockCard({ file, children }) {
				return /*#__PURE__*/ React.createElement(
					"div",
					{
						className: "code-block",
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "th",
						},
						/*#__PURE__*/ React.createElement(Icon, {
							name: "file",
							size: 11,
						}),
						/*#__PURE__*/ React.createElement("span", null, file),
						/*#__PURE__*/ React.createElement("span", {
							className: "spacer",
						}),
						/*#__PURE__*/ React.createElement(
							IconButton,
							{
								title: "Copy",
							},
							/*#__PURE__*/ React.createElement(Icon, {
								name: "copy",
							}),
						),
					),
					/*#__PURE__*/ React.createElement("pre", null, children),
				);
			}
			function ChatThread() {
				return /*#__PURE__*/ React.createElement(
					"div",
					{
						className: "thread",
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "msg user",
						},
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "avatar",
							},
							"WF",
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "content",
							},
							/*#__PURE__*/ React.createElement(
								"div",
								{
									className: "who",
								},
								"You ",
								/*#__PURE__*/ React.createElement(
									"span",
									{
										className: "time",
									},
									"14:03",
								),
							),
							/*#__PURE__*/ React.createElement(
								"div",
								{
									className: "text",
								},
								/*#__PURE__*/ React.createElement(
									"p",
									null,
									"\u628A branch menu \u7684\u5408\u5E76\u6309\u94AE\u4ECE\u884C\u5185\u79FB\u5230\u53F3\u952E\u83DC\u5355\u91CC,\u5E76\u4E14\u52A0\u4E0A",
									" ",
									/*#__PURE__*/ React.createElement(
										"code",
										null,
										"\u4ECE\u6B64\u5206\u652F\u65B0\u5EFA\u2026",
									),
									" \u7684\u5165\u53E3\u3002\u8981\u4FDD\u7559 ahead/behind badge\u3002",
								),
							),
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "msg",
						},
						/*#__PURE__*/ React.createElement(
							"span",
							{
								className: "avatar",
							},
							"Kro",
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "content",
							},
							/*#__PURE__*/ React.createElement(
								"div",
								{
									className: "who",
								},
								"Kro ",
								/*#__PURE__*/ React.createElement(
									"span",
									{
										className: "time",
									},
									"14:03 \xB7 Opus 5",
								),
							),
							/*#__PURE__*/ React.createElement(
								"div",
								{
									className: "text",
								},
								/*#__PURE__*/ React.createElement(
									"p",
									null,
									"\u597D,\u6211\u5148\u770B\u4E00\u4E0B\u5F53\u524D ",
									/*#__PURE__*/ React.createElement(
										"code",
										null,
										"BranchMenu.tsx",
									),
									" ",
									"\u662F\u600E\u4E48\u7EC4\u7EC7\u7684,\u518D\u6539\u5230\u53F3\u952E\u83DC\u5355\u91CC\u3002",
								),
							),
							/*#__PURE__*/ React.createElement(ToolCallCard, {
								name: "Grep",
								arg: '"onMerge" apps/desktop/src/renderer',
								body: /*#__PURE__*/ React.createElement(
									React.Fragment,
									null,
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "ctx",
										},
										"apps/desktop/\u2026/BranchMenu.tsx:104:",
									),
									" ",
									/*#__PURE__*/ React.createElement(
										"span",
										null,
										"onMerge=",
										"{",
										"actions.merge",
										"}",
									),
									"\n",
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "ctx",
										},
										"apps/desktop/\u2026/BranchRow.tsx:38:",
									),
									" ",
									/*#__PURE__*/ React.createElement(
										"span",
										null,
										"onMerge=",
										"{",
										"onRowMerge",
										"}",
									),
								),
							}),
							/*#__PURE__*/ React.createElement(
								"div",
								{
									className: "text",
								},
								/*#__PURE__*/ React.createElement(
									"p",
									null,
									"\u628A ",
									/*#__PURE__*/ React.createElement("code", null, "BranchRow"),
									" \u91CC\u7684 hover-only merge \u6309\u94AE\u5220\u6389,\u5408\u5E76\u52A8\u4F5C\u63A5\u5230 ",
									/*#__PURE__*/ React.createElement(
										"code",
										null,
										"ContextMenu",
									),
									" \u4E0A\u3002\u8FD9\u662F\u65B0\u7684\u884C:",
								),
							),
							/*#__PURE__*/ React.createElement(
								CodeBlockCard,
								{
									file: "apps/desktop/src/renderer/\u2026/BranchRow.tsx",
								},
								`<div className="b-row"
  onClick={onSwitch}
  onContextMenu={onRowContext}>
  <IconBranch className="glyph" />
  <span className="name">{branch.name}</span>
  {ab.length ? <span className="tag">{ab.join("  ")}</span> : null}
  <span className="end">
    {isCurrent ? <IconCheck size={12} /> : branch.relative}
  </span>
</div>`,
							),
							/*#__PURE__*/ React.createElement(ToolCallCard, {
								name: "Edit",
								arg: "apps/desktop/\u2026/BranchRow.tsx",
								body: /*#__PURE__*/ React.createElement(
									React.Fragment,
									null,
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "del",
										},
										"-",
										" ",
										'<button className="row-merge" onMerge={onMerge}>合并</button>',
									),
									"\n",
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "add",
										},
										"+",
										" ",
										"onContextMenu={(e) => { e.preventDefault(); onRowContext(branch, e.clientX, e.clientY); }}",
									),
								),
							}),
							/*#__PURE__*/ React.createElement(
								"div",
								{
									className: "text",
								},
								/*#__PURE__*/ React.createElement(
									"p",
									null,
									"\u8DD1\u4E00\u4E0B typecheck \u786E\u8BA4\u6CA1\u522B\u7684\u5730\u65B9\u8FD8\u5728\u5F15\u7528\u65E7\u7684 ",
									/*#__PURE__*/ React.createElement("code", null, "onMerge"),
									" ",
									"prop\u3002",
								),
							),
							/*#__PURE__*/ React.createElement(ToolCallCard, {
								name: "Bash",
								arg: "bun run typecheck --filter apps/desktop",
								done: false,
								body: /*#__PURE__*/ React.createElement(
									React.Fragment,
									null,
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "ctx",
										},
										"tsc --noEmit",
									),
									"\n",
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "ctx",
										},
										"Task apps/desktop:typecheck",
									),
									"\n",
									/*#__PURE__*/ React.createElement("span", null, "\u2026"),
								),
							}),
						),
					),
				);
			}
			function Composer() {
				return /*#__PURE__*/ React.createElement(
					"div",
					{
						className: "composer",
					},
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "box",
						},
						/*#__PURE__*/ React.createElement("textarea", {
							defaultValue:
								"\u52A0\u4E0A \u2318\u21E7B \u6253\u5F00\u5206\u652F\u83DC\u5355\u7684\u5FEB\u6377\u952E,\u5E76\u4E14\u5728 popover header \u4E0A\u663E\u793A\u8FD9\u4E2A hint\u3002",
						}),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "toolbar",
							},
							/*#__PURE__*/ React.createElement(
								IconButton,
								{
									title: "Attach",
								},
								/*#__PURE__*/ React.createElement(Icon, {
									name: "plus",
								}),
							),
							/*#__PURE__*/ React.createElement(
								IconButton,
								{
									title: "Slash commands",
								},
								/*#__PURE__*/ React.createElement(Icon, {
									name: "terminal",
								}),
							),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "agent",
								},
								/*#__PURE__*/ React.createElement("span", {
									className: "dot",
								}),
								"Kro \xB7 Opus 5",
							),
							/*#__PURE__*/ React.createElement(
								Kbd,
								{
									className: "ml-4",
								},
								"\u2318 + \u21B5",
							),
							/*#__PURE__*/ React.createElement("span", {
								className: "spacer",
							}),
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "mono faint",
								},
								"1,283 / 200k",
							),
							/*#__PURE__*/ React.createElement(
								"button",
								{
									className: "send",
								},
								/*#__PURE__*/ React.createElement(Icon, {
									name: "arrowRight",
									size: 12,
								}),
								"Send",
							),
						),
					),
				);
			}
			function StatusBar() {
				return /*#__PURE__*/ React.createElement(
					"div",
					{
						className: "status-bar",
					},
					/*#__PURE__*/ React.createElement(
						"span",
						{
							className: "item ok",
						},
						/*#__PURE__*/ React.createElement(Icon, {
							name: "check",
							className: "glyph",
						}),
						" connected \xB7 host-service :5881",
					),
					/*#__PURE__*/ React.createElement(
						"span",
						{
							className: "item",
						},
						/*#__PURE__*/ React.createElement(Icon, {
							name: "branch",
							className: "glyph",
						}),
						" feat/kro-suite \xB7 \u2191 3 \u2193 0",
					),
					/*#__PURE__*/ React.createElement(
						"span",
						{
							className: "item warn",
						},
						/*#__PURE__*/ React.createElement(Icon, {
							name: "alert",
							className: "glyph",
						}),
						" 5 files unstaged",
					),
					/*#__PURE__*/ React.createElement("span", {
						className: "spacer",
					}),
					/*#__PURE__*/ React.createElement(
						"span",
						{
							className: "item",
						},
						"Opus 5 \xB7 200k ctx",
					),
					/*#__PURE__*/ React.createElement(
						"span",
						{
							className: "item",
						},
						"UTC+8 \xB7 14:03",
					),
				);
			}
			function ChangesRail() {
				return /*#__PURE__*/ React.createElement(
					"div",
					{
						className: "kit-changes",
					},
					/*#__PURE__*/ React.createElement(Tabs, {
						value: "Changes",
						items: [
							{
								value: "Changes",
								label: "Changes",
								iconName: "changes",
							},
							{
								value: "Files",
								label: "Files",
								iconName: "file",
							},
						],
						trailing: /*#__PURE__*/ React.createElement(
							React.Fragment,
							null,
							/*#__PURE__*/ React.createElement(
								IconButton,
								null,
								/*#__PURE__*/ React.createElement(Icon, {
									name: "max",
								}),
							),
							/*#__PURE__*/ React.createElement(
								IconButton,
								null,
								/*#__PURE__*/ React.createElement(Icon, {
									name: "x",
								}),
							),
						),
					}),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "branch-bar",
						},
						/*#__PURE__*/ React.createElement(Pill, {
							label: "feat/kro-suite",
							open: true,
						}),
						/*#__PURE__*/ React.createElement("span", {
							style: {
								flex: 1,
							},
						}),
						/*#__PURE__*/ React.createElement(
							IconButton,
							null,
							/*#__PURE__*/ React.createElement(Icon, {
								name: "sort",
							}),
						),
						/*#__PURE__*/ React.createElement(
							IconButton,
							null,
							/*#__PURE__*/ React.createElement(Icon, {
								name: "refresh",
							}),
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							style: {
								position: "relative",
							},
						},
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "floating",
								style: {
									position: "absolute",
									left: 12,
									top: -2,
									width: 340,
								},
							},
							/*#__PURE__*/ React.createElement(
								Popover,
								null,
								/*#__PURE__*/ React.createElement(PopoverHeader, {
									placeholder: "Jump to branch, or type to create\u2026",
								}),
								/*#__PURE__*/ React.createElement(PopoverGroup, {
									label: "\u672C\u5730\u5206\u652F",
									count: 4,
									action: /*#__PURE__*/ React.createElement(
										"button",
										{
											className: "action",
										},
										/*#__PURE__*/ React.createElement(Icon, {
											name: "plus",
										}),
										" \u65B0\u5EFA",
									),
								}),
								/*#__PURE__*/ React.createElement(PopoverRow, {
									name: "feat/kro-suite",
									current: true,
									tag: /*#__PURE__*/ React.createElement(
										Tag,
										{
											dir: "up",
										},
										"3",
									),
								}),
								/*#__PURE__*/ React.createElement(PopoverRow, {
									name: "main",
									focused: true,
									tag: /*#__PURE__*/ React.createElement(
										Tag,
										{
											dir: "down",
										},
										"12",
									),
									end: "1w",
								}),
								/*#__PURE__*/ React.createElement(PopoverRow, {
									name: "bugfix/reap-legacy-orphans",
									tag: /*#__PURE__*/ React.createElement(
										Tag,
										{
											dir: "down",
										},
										"2",
									),
									end: "2d",
								}),
								/*#__PURE__*/ React.createElement(PopoverRow, {
									name: "feat/browser-extension-bridge",
									tag: /*#__PURE__*/ React.createElement(
										Tag,
										{
											dir: "up",
										},
										"6",
									),
									end: "4d",
								}),
								/*#__PURE__*/ React.createElement(PopoverSep, null),
								/*#__PURE__*/ React.createElement(PopoverGroup, {
									label: "\u8FDC\u7A0B",
									count: 2,
									action: /*#__PURE__*/ React.createElement(
										"button",
										{
											className: "action",
										},
										/*#__PURE__*/ React.createElement(Icon, {
											name: "refresh",
										}),
										" Fetch",
									),
								}),
								/*#__PURE__*/ React.createElement(PopoverRow, {
									iconName: "cloud",
									name: "feat/mcp-cursor-connector",
									end: "origin",
								}),
								/*#__PURE__*/ React.createElement(
									PopoverHint,
									null,
									/*#__PURE__*/ React.createElement(
										"span",
										null,
										"\u53F3\u952E\u4EFB\u610F\u5206\u652F\u67E5\u770B\u64CD\u4F5C",
									),
									/*#__PURE__*/ React.createElement(
										"span",
										{
											style: {
												display: "inline-flex",
												gap: 6,
											},
										},
										/*#__PURE__*/ React.createElement(Kbd, null, "\u21B5"),
										/*#__PURE__*/ React.createElement(
											"span",
											{
												className: "faint",
											},
											"\u5207\u6362",
										),
									),
								),
							),
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "summary-bar",
						},
						/*#__PURE__*/ React.createElement(
							Chip,
							{
								tone: "mod",
							},
							"5 modified",
						),
						/*#__PURE__*/ React.createElement(
							Chip,
							{
								tone: "add",
							},
							"2 added",
						),
						/*#__PURE__*/ React.createElement(
							Chip,
							{
								tone: "del",
							},
							"1 deleted",
						),
						/*#__PURE__*/ React.createElement("span", {
							className: "spacer",
						}),
						/*#__PURE__*/ React.createElement(
							IconButton,
							null,
							/*#__PURE__*/ React.createElement(Icon, {
								name: "moreH",
							}),
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "files",
						},
						/*#__PURE__*/ React.createElement(FileRow, {
							dir: "apps/desktop/src/renderer/",
							file: "MainView.tsx",
							status: "M",
						}),
						/*#__PURE__*/ React.createElement(FileRow, {
							dir: "apps/desktop/src/main/",
							file: "index.ts",
							status: "M",
						}),
						/*#__PURE__*/ React.createElement(FileRow, {
							dir: "apps/desktop/src/lib/trpc/routers/",
							file: "branches.ts",
							status: "M",
						}),
						/*#__PURE__*/ React.createElement(FileRow, {
							dir: "apps/desktop/src/renderer/hooks/",
							file: "useBranchMenu.ts",
							status: "A",
						}),
						/*#__PURE__*/ React.createElement(FileRow, {
							dir: "apps/desktop/src/renderer/\u2026/",
							file: "BranchMenu.tsx",
							status: "M",
						}),
						/*#__PURE__*/ React.createElement(FileRow, {
							dir: "packages/ui/src/",
							file: "popover.tsx",
							status: "D",
						}),
						/*#__PURE__*/ React.createElement(FileRow, {
							dir: "designs/branch-menu-redesign/",
							file: "v3.css",
							status: "A",
						}),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "commit",
						},
						/*#__PURE__*/ React.createElement("textarea", {
							defaultValue: "feat(branch-menu): move ops into right-click menu",
						}),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "row",
							},
							/*#__PURE__*/ React.createElement(
								"span",
								{
									className: "hint",
								},
								"On ",
								/*#__PURE__*/ React.createElement("b", null, "feat/kro-suite"),
								" \xB7 8 files",
							),
							/*#__PURE__*/ React.createElement(
								Button,
								{
									variant: "primary",
								},
								/*#__PURE__*/ React.createElement(Icon, {
									name: "push",
								}),
								" Commit & Push",
							),
						),
					),
				);
			}
			function App() {
				const [active, setActive] = React.useState("wf1");
				return /*#__PURE__*/ React.createElement(
					"div",
					{
						className: "app-shell",
					},
					/*#__PURE__*/ React.createElement(WinChrome, null),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "app-body",
						},
						/*#__PURE__*/ React.createElement(Sidebar, {
							active: active,
							setActive: setActive,
						}),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "main",
							},
							/*#__PURE__*/ React.createElement(
								"div",
								{
									className: "bar",
								},
								/*#__PURE__*/ React.createElement(
									"span",
									{
										className: "crumb",
									},
									/*#__PURE__*/ React.createElement("span", null, "superset"),
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "sep",
										},
										"/",
									),
									/*#__PURE__*/ React.createElement("span", null, "apps"),
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "sep",
										},
										"/",
									),
									/*#__PURE__*/ React.createElement("span", null, "desktop"),
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "sep",
										},
										"/",
									),
									/*#__PURE__*/ React.createElement(
										"span",
										{
											className: "mono",
										},
										"feat/kro-suite",
									),
								),
								/*#__PURE__*/ React.createElement("span", {
									className: "spacer",
								}),
								/*#__PURE__*/ React.createElement(
									Chip,
									null,
									/*#__PURE__*/ React.createElement("span", {
										className: "dot",
										style: {
											background: "var(--success)",
										},
									}),
									" ",
									"running",
								),
								/*#__PURE__*/ React.createElement(
									IconButton,
									null,
									/*#__PURE__*/ React.createElement(Icon, {
										name: "terminal",
									}),
								),
								/*#__PURE__*/ React.createElement(
									IconButton,
									null,
									/*#__PURE__*/ React.createElement(Icon, {
										name: "moreH",
									}),
								),
							),
							/*#__PURE__*/ React.createElement(
								"div",
								{
									className: "body",
								},
								/*#__PURE__*/ React.createElement(ChatThread, null),
							),
							/*#__PURE__*/ React.createElement(Composer, null),
							/*#__PURE__*/ React.createElement(StatusBar, null),
						),
						/*#__PURE__*/ React.createElement(
							"div",
							{
								className: "right-rail",
							},
							/*#__PURE__*/ React.createElement(ChangesRail, null),
						),
					),
					/*#__PURE__*/ React.createElement(
						"div",
						{
							className: "toast-stack",
						},
						/*#__PURE__*/ React.createElement(
							Toast,
							{
								tone: "success",
							},
							"\u5DF2\u5207\u6362\u5230 feat/kro-suite",
						),
						/*#__PURE__*/ React.createElement(
							Toast,
							null,
							/*#__PURE__*/ React.createElement(Icon, {
								name: "pull",
								className: "glyph",
							}),
							" \u5DF2\u62C9\u53D6 main \xB7 12 commits",
						),
					),
				);
			}
			ReactDOM.createRoot(document.getElementById("root")).render(
				/*#__PURE__*/ React.createElement(App, null),
			);
		})();
	} catch (e) {
		__ds_ns.__errors.push({
			path: "ui_kits/desktop-app/app.jsx",
			error: String(e?.message || e),
		});
	}

	__ds_ns.Badge = __ds_scope.Badge;

	__ds_ns.Button = __ds_scope.Button;

	__ds_ns.Chip = __ds_scope.Chip;

	__ds_ns.Icon = __ds_scope.Icon;

	__ds_ns.IconButton = __ds_scope.IconButton;

	__ds_ns.Kbd = __ds_scope.Kbd;

	__ds_ns.Pill = __ds_scope.Pill;

	__ds_ns.Tag = __ds_scope.Tag;

	__ds_ns.ConfirmCard = __ds_scope.ConfirmCard;

	__ds_ns.Toast = __ds_scope.Toast;

	__ds_ns.Checkbox = __ds_scope.Checkbox;

	__ds_ns.Input = __ds_scope.Input;

	__ds_ns.SegmentedControl = __ds_scope.SegmentedControl;

	__ds_ns.Switch = __ds_scope.Switch;

	__ds_ns.FileRow = __ds_scope.FileRow;

	__ds_ns.Tabs = __ds_scope.Tabs;

	__ds_ns.WorkspaceItem = __ds_scope.WorkspaceItem;

	__ds_ns.ContextMenu = __ds_scope.ContextMenu;

	__ds_ns.MenuHeading = __ds_scope.MenuHeading;

	__ds_ns.MenuSep = __ds_scope.MenuSep;

	__ds_ns.MenuGroup = __ds_scope.MenuGroup;

	__ds_ns.MenuItem = __ds_scope.MenuItem;

	__ds_ns.Popover = __ds_scope.Popover;

	__ds_ns.PopoverHeader = __ds_scope.PopoverHeader;

	__ds_ns.PopoverGroup = __ds_scope.PopoverGroup;

	__ds_ns.PopoverRow = __ds_scope.PopoverRow;

	__ds_ns.PopoverSep = __ds_scope.PopoverSep;

	__ds_ns.PopoverHint = __ds_scope.PopoverHint;
})();
