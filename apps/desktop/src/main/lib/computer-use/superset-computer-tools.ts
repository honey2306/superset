export const SUPERSET_COMPUTER_TOOLS = [
	{
		name: "superset_window",
		description:
			"High-level exact-window management. Use list to discover exact pid/window_id first. Mutations are identity-checked against the current Cua window inventory before dispatch.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			properties: {
				action: {
					type: "string",
					enum: [
						"list",
						"close",
						"minimize",
						"restore",
						"maximize",
						"focus",
						"set-bounds",
					],
				},
				pid: { type: "integer", minimum: 1 },
				window_id: { type: "integer", minimum: 1 },
				x: { type: "number" },
				y: { type: "number" },
				width: { type: "number", minimum: 1 },
				height: { type: "number", minimum: 1 },
				on_screen_only: { type: "boolean" },
			},
			required: ["action"],
		},
		annotations: {
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: false,
			openWorldHint: false,
		},
	},
	{
		name: "superset_space",
		description:
			"macOS Space management owned by Superset. List Spaces, switch the visible Space, or move one exact window between Spaces. Prefer space_id from list; to accepts the 1-based list number.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			properties: {
				action: {
					type: "string",
					enum: ["list", "switch", "move-window"],
				},
				space_id: {
					type: "string",
					pattern: "^[0-9]+$",
					description: "Stable macOS Space identifier returned by list.",
				},
				to: {
					type: "integer",
					minimum: 1,
					description: "1-based Space number returned by the current list.",
				},
				window_id: { type: "integer", minimum: 1 },
				follow: {
					type: "boolean",
					description:
						"After moving a window, also switch the visible desktop to the target Space.",
				},
			},
			required: ["action"],
		},
		annotations: {
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: false,
			openWorldHint: false,
		},
	},
	{
		name: "superset_dock",
		description:
			"macOS Dock management inside Superset: list items, launch an exact Dock item, open/select its context menu, and read or change Dock auto-hide.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			properties: {
				action: {
					type: "string",
					enum: ["list", "launch", "right-click", "status", "hide", "show"],
				},
				name: { type: "string", minLength: 1 },
				menu_item: { type: "string", minLength: 1 },
				include_all: { type: "boolean" },
			},
			required: ["action"],
		},
		annotations: {
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: false,
			openWorldHint: false,
		},
	},
	{
		name: "superset_app",
		description:
			"High-level native application lifecycle. List/launch use Cua; quit, hide/unhide and activation are executed in the Superset host process.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			properties: {
				action: {
					type: "string",
					enum: [
						"list",
						"launch",
						"quit",
						"force-quit",
						"focus",
						"hide",
						"unhide",
					],
				},
				pid: { type: "integer", minimum: 1 },
				name: { type: "string", minLength: 1 },
				bundle_id: { type: "string", minLength: 1 },
				urls: { type: "array", items: { type: "string" } },
				new_instance: { type: "boolean" },
				window_id: { type: "integer", minimum: 1 },
			},
			required: ["action"],
		},
		annotations: {
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: false,
			openWorldHint: true,
		},
	},
	{
		name: "superset_paste",
		description:
			"Paste to an exact native target. With text/image_path/file_path Superset snapshots the current clipboard in-process, writes the temporary payload, sends Cmd+V, then restores the original clipboard. With no payload it pastes the existing clipboard.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			properties: {
				text: { type: "string" },
				image_path: { type: "string" },
				file_path: { type: "string" },
				pid: { type: "integer", minimum: 1 },
				window_id: { type: "integer", minimum: 1 },
				delivery_mode: {
					type: "string",
					enum: ["background", "foreground"],
				},
				restore_delay_ms: {
					type: "integer",
					minimum: 0,
					maximum: 5000,
					default: 150,
				},
			},
		},
		annotations: {
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: false,
			openWorldHint: false,
		},
	},
	{
		name: "superset_dialog",
		description:
			"Operate a native dialog through the same Cua snapshot/element tokens used by Computer Use. Supports inspect/list, exact button click, text-field input, and Escape dismissal. Use computer_see directly for unusual file panels or custom dialogs.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			properties: {
				action: {
					type: "string",
					enum: ["list", "click", "input", "dismiss"],
				},
				pid: { type: "integer", minimum: 1 },
				window_id: { type: "integer", minimum: 1 },
				button: { type: "string", minLength: 1 },
				field: { type: "string", minLength: 1 },
				field_index: { type: "integer", minimum: 0 },
				text: { type: "string" },
				clear: { type: "boolean" },
			},
			required: ["action", "pid", "window_id"],
		},
		annotations: {
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: false,
			openWorldHint: false,
		},
	},
	{
		name: "superset_action",
		description:
			"Invoke a semantic Accessibility action on a fresh Cua element token. Supported actions are AXPress, AXShowMenu, AXPick, AXConfirm, AXCancel and AXOpen; use computer_set_value for value-based controls.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			properties: {
				pid: { type: "integer", minimum: 1 },
				window_id: { type: "integer", minimum: 1 },
				element_token: { type: "string", minLength: 1 },
				element_index: { type: "integer", minimum: 0 },
				snapshot_id: { type: "string" },
				action: {
					type: "string",
					enum: [
						"AXPress",
						"AXShowMenu",
						"AXPick",
						"AXConfirm",
						"AXCancel",
						"AXOpen",
					],
				},
			},
			required: ["pid", "action"],
		},
		annotations: {
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: false,
			openWorldHint: false,
		},
	},
] as const;
