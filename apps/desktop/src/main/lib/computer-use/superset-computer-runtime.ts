import * as macOSProvider from "@superset/macos-computer-provider";
import type { SerializableComputerToolResult } from "./computer-runtime";
import { SUPERSET_COMPUTER_TOOLS } from "./superset-computer-tools";

type JsonRecord = Record<string, unknown>;
type CallCua = (
	sessionId: string,
	name: string,
	args: JsonRecord,
	signal?: AbortSignal,
) => Promise<SerializableComputerToolResult>;

type CuaWindow = {
	window_id: number;
	pid: number | null;
	app_name: string;
	title?: string;
	bounds: { x: number; y: number; width: number; height: number };
	is_on_screen: boolean;
	z_index: number | null;
	minimized?: boolean | null;
	space_ids?: number[] | null;
	current_space_id?: number | null;
	on_current_space?: boolean | null;
};

type CuaElement = {
	element_index: number;
	element_token?: string | null;
	role: string;
	label?: string | null;
	value?: string | null;
	value_description?: string | null;
};

function record(value: unknown): JsonRecord | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

function structured(result: SerializableComputerToolResult): JsonRecord | null {
	if (!result.structuredJson) return null;
	try {
		return record(JSON.parse(result.structuredJson));
	} catch {
		return null;
	}
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function asBoolean(value: unknown): boolean | undefined {
	return typeof value === "boolean" ? value : undefined;
}

function requiredNumber(args: JsonRecord, key: string): number {
	const value = asNumber(args[key]);
	if (value === undefined || !Number.isInteger(value) || value < 1) {
		throw new Error(`${key} must be a positive integer`);
	}
	return value;
}

function requiredString(args: JsonRecord, key: string): string {
	const value = asString(args[key]);
	if (!value) throw new Error(`${key} is required`);
	return value;
}

function nativeResult(
	text: string,
	data: unknown,
	options: { confirmed?: boolean; degraded?: boolean; errorCode?: string } = {},
): SerializableComputerToolResult {
	const structuredValue =
		data !== null && typeof data === "object" ? data : { value: data };
	const rawJson = JSON.stringify(structuredValue);
	return {
		text,
		images: [],
		structuredJson: rawJson,
		isError: false,
		...(options.errorCode ? { errorCode: options.errorCode } : {}),
		degraded: options.degraded ?? false,
		rawJson,
		action: {
			effect: options.confirmed === false ? "unverifiable" : "confirmed",
			route: "system_api",
		},
	};
}

function errorText(result: SerializableComputerToolResult): string {
	return result.text || result.errorCode || "Computer Use provider call failed";
}

async function delay(ms: number, signal?: AbortSignal): Promise<void> {
	if (ms <= 0) return;
	await new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(resolve, ms);
		const abort = () => {
			clearTimeout(timeout);
			reject(new Error("Computer Use operation cancelled"));
		};
		signal?.addEventListener("abort", abort, { once: true });
		timeout.unref();
	});
	signal?.throwIfAborted();
}

function windowsFrom(result: SerializableComputerToolResult): CuaWindow[] {
	const value = structured(result);
	const windows = value?.windows;
	if (!Array.isArray(windows)) return [];
	return windows.filter(
		(window): window is CuaWindow =>
			window !== null &&
			typeof window === "object" &&
			typeof (window as CuaWindow).window_id === "number",
	);
}

function elementsFrom(result: SerializableComputerToolResult): {
	elements: CuaElement[];
	snapshotId?: string;
} {
	const value = structured(result);
	const elements = Array.isArray(value?.elements)
		? value.elements.filter(
				(element): element is CuaElement =>
					element !== null &&
					typeof element === "object" &&
					typeof (element as CuaElement).element_index === "number" &&
					typeof (element as CuaElement).role === "string",
			)
		: [];
	return { elements, snapshotId: asString(value?.snapshot_id) };
}

function sameText(a: string | null | undefined, b: string): boolean {
	return (
		a?.trim().localeCompare(b.trim(), undefined, { sensitivity: "accent" }) ===
		0
	);
}

function containsText(a: string | null | undefined, b: string): boolean {
	return a?.toLocaleLowerCase().includes(b.trim().toLocaleLowerCase()) ?? false;
}

function uniqueElement(
	elements: CuaElement[],
	predicate: (element: CuaElement) => boolean,
	description: string,
): CuaElement {
	const matches = elements.filter(predicate);
	if (matches.length === 0) {
		throw new Error(
			`${description} was not found in the current dialog snapshot`,
		);
	}
	if (matches.length > 1) {
		throw new Error(
			`${description} is ambiguous in the current dialog snapshot`,
		);
	}
	return matches[0] as CuaElement;
}

function targetArgs(
	element: CuaElement,
	pid: number,
	windowId: number,
	snapshotId?: string,
): JsonRecord {
	if (element.element_token) {
		return { pid, window_id: windowId, element_token: element.element_token };
	}
	if (!snapshotId) {
		throw new Error("Dialog snapshot is missing a stable snapshot_id");
	}
	return {
		pid,
		window_id: windowId,
		element_index: element.element_index,
		snapshot_id: snapshotId,
	};
}

function dedupedSpaces(
	provider: typeof macOSProvider,
): ReturnType<typeof macOSProvider.listSpaces> {
	const seen = new Set<string>();
	return provider
		.listSpaces()
		.filter((space) => {
			if (seen.has(space.id)) return false;
			seen.add(space.id);
			return true;
		})
		.map((space, index) => ({ ...space, number: index + 1 }));
}

function resolveSpace(provider: typeof macOSProvider, args: JsonRecord) {
	const spaces = dedupedSpaces(provider);
	const id = asString(args.space_id);
	const number = asNumber(args.to);
	const byId = id ? spaces.find((space) => space.id === id) : undefined;
	const byNumber =
		number !== undefined && Number.isInteger(number)
			? spaces.find((space) => space.number === number)
			: undefined;
	if (id && !byId) throw new Error(`Space ${id} does not exist`);
	if (number !== undefined && !byNumber) {
		throw new Error(`Space number ${number} does not exist`);
	}
	if (byId && byNumber && byId.id !== byNumber.id) {
		throw new Error("space_id and to refer to different Spaces");
	}
	const target = byId ?? byNumber;
	if (!target) throw new Error("Provide space_id or to for this Space action");
	return { spaces, target };
}

export class SupersetComputerToolsRuntime {
	constructor(
		private readonly callCua: CallCua,
		private readonly macProvider: typeof macOSProvider = macOSProvider,
	) {}

	hasMacSupplement(): boolean {
		return process.platform === "darwin" && this.macProvider.isAvailable();
	}

	tools() {
		const common = SUPERSET_COMPUTER_TOOLS.filter(
			(tool) => tool.name !== "superset_space" && tool.name !== "superset_dock",
		);
		return this.hasMacSupplement() ? [...SUPERSET_COMPUTER_TOOLS] : common;
	}

	async call(
		sessionId: string,
		name: string,
		args: JsonRecord,
		signal?: AbortSignal,
	): Promise<SerializableComputerToolResult> {
		signal?.throwIfAborted();
		switch (name) {
			case "superset_window":
				return this.window(sessionId, args, signal);
			case "superset_space":
				return this.space(sessionId, args, signal);
			case "superset_dock":
				return this.dock(args);
			case "superset_app":
				return this.app(sessionId, args, signal);
			case "superset_paste":
				return this.paste(sessionId, args, signal);
			case "superset_dialog":
				return this.dialog(sessionId, args, signal);
			case "superset_action":
				return this.action(sessionId, args, signal);
			default:
				throw new Error(`Unsupported Superset Computer tool: ${name}`);
		}
	}

	private requireMacSupplement(capability: string): void {
		if (this.hasMacSupplement()) return;
		throw new Error(
			capability +
				" requires the Superset macOS Computer Provider on this platform",
		);
	}

	private async currentWindows(
		sessionId: string,
		args: JsonRecord = {},
		signal?: AbortSignal,
	): Promise<{ result: SerializableComputerToolResult; windows: CuaWindow[] }> {
		const result = await this.callCua(sessionId, "list_windows", args, signal);
		if (result.isError) throw new Error(errorText(result));
		return { result, windows: windowsFrom(result) };
	}

	private async exactWindow(
		sessionId: string,
		pid: number,
		windowId: number,
		signal?: AbortSignal,
	): Promise<CuaWindow> {
		const { windows } = await this.currentWindows(sessionId, { pid }, signal);
		const window = windows.find(
			(candidate) => candidate.window_id === windowId && candidate.pid === pid,
		);
		if (!window) {
			throw new Error(
				`Exact window ${windowId} is no longer owned by pid ${pid}`,
			);
		}
		return window;
	}

	private async window(
		sessionId: string,
		args: JsonRecord,
		signal?: AbortSignal,
	): Promise<SerializableComputerToolResult> {
		const action = requiredString(args, "action");
		if (action === "list") {
			return this.callCua(
				sessionId,
				"list_windows",
				{
					...(asNumber(args.pid) ? { pid: asNumber(args.pid) } : {}),
					...(asBoolean(args.on_screen_only) !== undefined
						? { on_screen_only: asBoolean(args.on_screen_only) }
						: {}),
				},
				signal,
			);
		}
		const pid = requiredNumber(args, "pid");
		const windowId = requiredNumber(args, "window_id");
		const before = await this.exactWindow(sessionId, pid, windowId, signal);
		if (action === "focus") {
			return this.callCua(
				sessionId,
				"bring_to_front",
				{ pid, window_id: windowId },
				signal,
			);
		}
		if (action === "set-bounds") {
			for (const key of ["x", "y", "width", "height"]) {
				if (asNumber(args[key]) === undefined) {
					throw new Error(`${key} is required for set-bounds`);
				}
			}
			return this.callCua(
				sessionId,
				"set_window_frame",
				{
					pid,
					window_id: windowId,
					x: asNumber(args.x),
					y: asNumber(args.y),
					width: asNumber(args.width),
					height: asNumber(args.height),
				},
				signal,
			);
		}
		if (
			action !== "close" &&
			action !== "minimize" &&
			action !== "restore" &&
			action !== "maximize"
		) {
			throw new Error(`Unsupported window action: ${action}`);
		}
		this.requireMacSupplement(`window ${action}`);
		const native = this.macProvider.windowAction(pid, windowId, action);
		signal?.throwIfAborted();
		const { windows } = await this.currentWindows(sessionId, { pid }, signal);
		const after = windows.find(
			(candidate) => candidate.window_id === windowId && candidate.pid === pid,
		);
		const confirmed =
			action === "close"
				? after === undefined
				: action === "minimize"
					? after?.minimized === true
					: action === "restore"
						? after?.minimized === false
						: native.confirmed === true;
		return nativeResult(
			confirmed
				? `Window ${action} confirmed for ${pid}/${windowId}.`
				: `Window ${action} was dispatched but the resulting state is not fully confirmed.`,
			{ action, pid, window_id: windowId, before, after, native },
			{ confirmed },
		);
	}

	private async space(
		sessionId: string,
		args: JsonRecord,
		signal?: AbortSignal,
	): Promise<SerializableComputerToolResult> {
		this.requireMacSupplement("Space management");
		const action = requiredString(args, "action");
		if (action === "list") {
			const spaces = dedupedSpaces(this.macProvider);
			return nativeResult(`Found ${spaces.length} macOS Space(s).`, {
				spaces,
			});
		}
		const { target } = resolveSpace(this.macProvider, args);
		if (action === "switch") {
			const native = this.macProvider.switchSpace(target.id);
			return nativeResult(
				native.confirmed
					? `Switched to Space ${target.number}.`
					: "Space switch to " +
							target.number +
							" was dispatched but not confirmed.",
				{ target, native, spaces: dedupedSpaces(this.macProvider) },
				{ confirmed: native.confirmed === true },
			);
		}
		if (action !== "move-window") {
			throw new Error(`Unsupported Space action: ${action}`);
		}
		const windowId = requiredNumber(args, "window_id");
		const { windows: beforeWindows } = await this.currentWindows(
			sessionId,
			{},
			signal,
		);
		const before = beforeWindows.find(
			(window) => window.window_id === windowId,
		);
		if (!before?.pid) {
			throw new Error(`Window ${windowId} is not in the current Cua inventory`);
		}
		const native = this.macProvider.moveWindowToSpace(windowId, target.id);
		signal?.throwIfAborted();
		const { windows: afterWindows } = await this.currentWindows(
			sessionId,
			{ pid: before.pid },
			signal,
		);
		const after = afterWindows.find((window) => window.window_id === windowId);
		const moved = after?.space_ids?.map(String).includes(target.id) === true;
		let followed: unknown;
		if (asBoolean(args.follow) === true) {
			followed = this.macProvider.switchSpace(target.id);
		}
		return nativeResult(
			moved
				? `Moved window ${windowId} to Space ${target.number}.`
				: "Window move was dispatched but target Space membership is not confirmed.",
			{ target, before, after, native, ...(followed ? { followed } : {}) },
			{ confirmed: moved },
		);
	}

	private dock(args: JsonRecord): SerializableComputerToolResult {
		this.requireMacSupplement("Dock management");
		const action = requiredString(args, "action");
		switch (action) {
			case "list": {
				const items = this.macProvider.listDockItems(
					asBoolean(args.include_all) ?? false,
				);
				return nativeResult(`Found ${items.length} Dock item(s).`, {
					items,
				});
			}
			case "status": {
				const hidden = this.macProvider.isDockHidden();
				return nativeResult(
					hidden ? "Dock auto-hide is enabled." : "Dock auto-hide is disabled.",
					{ hidden },
				);
			}
			case "hide":
			case "show": {
				const hidden = action === "hide";
				const native = this.macProvider.setDockHidden(hidden);
				return nativeResult(
					native.confirmed
						? `Dock auto-hide ${hidden ? "enabled." : "disabled."}`
						: "Dock preference changed but could not be confirmed.",
					{ hidden, native },
					{ confirmed: native.confirmed === true },
				);
			}
			case "launch": {
				const name = requiredString(args, "name");
				const native = this.macProvider.dockAction(name, "launch");
				return nativeResult(
					`Dock launch dispatched for ${name}.`,
					{ name, native },
					{ confirmed: false },
				);
			}
			case "right-click": {
				const name = requiredString(args, "name");
				const menuItem = asString(args.menu_item);
				const native = this.macProvider.dockAction(name, "show-menu", menuItem);
				return nativeResult(
					menuItem
						? `Selected Dock menu item ${menuItem} for ${name}.`
						: `Opened Dock context menu for ${name}.`,
					{ name, menu_item: menuItem, native },
					{ confirmed: false },
				);
			}
			default:
				throw new Error(`Unsupported Dock action: ${action}`);
		}
	}

	private async app(
		sessionId: string,
		args: JsonRecord,
		signal?: AbortSignal,
	): Promise<SerializableComputerToolResult> {
		const action = requiredString(args, "action");
		if (action === "list") {
			return this.callCua(sessionId, "list_apps", {}, signal);
		}
		if (action === "launch") {
			return this.callCua(
				sessionId,
				"launch_app",
				{
					...(asString(args.bundle_id)
						? { bundle_id: asString(args.bundle_id) }
						: {}),
					...(asString(args.name) ? { name: asString(args.name) } : {}),
					...(Array.isArray(args.urls) ? { urls: args.urls } : {}),
					...(asBoolean(args.new_instance) !== undefined
						? {
								creates_new_application_instance: asBoolean(args.new_instance),
							}
						: {}),
				},
				signal,
			);
		}
		const pid = requiredNumber(args, "pid");
		if (action === "force-quit") {
			return this.callCua(sessionId, "kill_app", { pid }, signal);
		}
		if (action === "focus") {
			return this.callCua(
				sessionId,
				"bring_to_front",
				{
					pid,
					...(asNumber(args.window_id)
						? { window_id: asNumber(args.window_id) }
						: {}),
				},
				signal,
			);
		}
		const nativeAction =
			action === "quit"
				? "terminate"
				: action === "hide"
					? "hide"
					: action === "unhide"
						? "unhide"
						: undefined;
		if (!nativeAction) throw new Error(`Unsupported app action: ${action}`);
		this.requireMacSupplement(`application ${action}`);
		const native = this.macProvider.appAction(pid, nativeAction);
		return nativeResult(
			`Application ${action} dispatched for pid ${pid}.`,
			{ pid, action, native },
			{ confirmed: native.confirmed === true },
		);
	}

	private async paste(
		sessionId: string,
		args: JsonRecord,
		signal?: AbortSignal,
	): Promise<SerializableComputerToolResult> {
		const payloadKeys = ["text", "image_path", "file_path"].filter(
			(key) => args[key] !== undefined,
		);
		if (payloadKeys.length > 1) {
			throw new Error("Provide only one of text, image_path, or file_path");
		}
		if (payloadKeys.length > 0) {
			this.requireMacSupplement("temporary clipboard paste with restoration");
		}
		const snapshot =
			payloadKeys.length > 0 ? this.macProvider.saveClipboard() : null;
		let restoreAttempted = false;
		let restored = true;
		try {
			if (payloadKeys.length > 0) {
				const write = await this.callCua(
					sessionId,
					"clipboard_write",
					Object.fromEntries(payloadKeys.map((key) => [key, args[key]])),
					signal,
				);
				if (write.isError) throw new Error(errorText(write));
			}
			const pid = asNumber(args.pid);
			const windowId = asNumber(args.window_id);
			const hotkey = await this.callCua(
				sessionId,
				"hotkey",
				{
					keys: ["cmd", "v"],
					...(pid ? { pid } : { scope: "desktop" }),
					...(windowId ? { window_id: windowId } : {}),
					delivery_mode: asString(args.delivery_mode) ?? "background",
				},
				signal,
			);
			if (snapshot) {
				await delay(asNumber(args.restore_delay_ms) ?? 150, signal);
				restoreAttempted = true;
				restored = this.macProvider.restoreClipboard(snapshot);
			}
			return {
				...hotkey,
				degraded: hotkey.degraded || (snapshot !== null && !restored),
				text: hotkey.isError
					? hotkey.text
					: (hotkey.text || "Paste dispatched.") +
						(snapshot
							? restored
								? " The original clipboard was restored."
								: " The paste was sent, but restoring the original clipboard failed."
							: ""),
			};
		} finally {
			if (snapshot && !restoreAttempted) {
				const cleanupRestored = this.macProvider.restoreClipboard(snapshot);
				if (!cleanupRestored) {
					console.warn(
						"[computer-use] failed to restore clipboard snapshot after paste",
					);
				}
			}
		}
	}

	private async dialogSnapshot(
		sessionId: string,
		pid: number,
		windowId: number,
		signal?: AbortSignal,
	): Promise<SerializableComputerToolResult> {
		const result = await this.callCua(
			sessionId,
			"get_window_state",
			{
				pid,
				window_id: windowId,
				include_screenshot: false,
				max_elements: 1200,
				max_depth: 30,
			},
			signal,
		);
		if (result.isError) throw new Error(errorText(result));
		return result;
	}

	private async dialog(
		sessionId: string,
		args: JsonRecord,
		signal?: AbortSignal,
	): Promise<SerializableComputerToolResult> {
		const action = requiredString(args, "action");
		const pid = requiredNumber(args, "pid");
		const windowId = requiredNumber(args, "window_id");
		if (action === "dismiss") {
			return this.callCua(
				sessionId,
				"press_key",
				{
					pid,
					window_id: windowId,
					key: "escape",
					delivery_mode: "background",
				},
				signal,
			);
		}
		const snapshot = await this.dialogSnapshot(
			sessionId,
			pid,
			windowId,
			signal,
		);
		if (action === "list") return snapshot;
		const { elements, snapshotId } = elementsFrom(snapshot);
		if (action === "click") {
			const button = requiredString(args, "button");
			const buttonElements = elements.filter((element) =>
				element.role.toLocaleLowerCase().includes("button"),
			);
			const exact = buttonElements.filter(
				(element) =>
					sameText(element.label, button) || sameText(element.value, button),
			);
			const target =
				exact.length === 1
					? exact[0]
					: uniqueElement(
							buttonElements,
							(element) =>
								containsText(element.label, button) ||
								containsText(element.value, button),
							`Dialog button "${button}"`,
						);
			if (!target) {
				throw new Error(`Dialog button "${button}" was not found`);
			}
			return this.callCua(
				sessionId,
				"click",
				{
					...targetArgs(target, pid, windowId, snapshotId),
					action: "press",
				},
				signal,
			);
		}
		if (action !== "input") {
			throw new Error(`Unsupported dialog action: ${action}`);
		}
		const fields = elements.filter((element) => {
			const role = element.role.toLocaleLowerCase();
			return (
				role.includes("textfield") ||
				role.includes("textarea") ||
				role.includes("searchfield") ||
				role.includes("combobox")
			);
		});
		const fieldName = asString(args.field);
		const fieldIndex = asNumber(args.field_index);
		let field: CuaElement;
		if (fieldIndex !== undefined) {
			if (
				!Number.isInteger(fieldIndex) ||
				fieldIndex < 0 ||
				!fields[fieldIndex]
			) {
				throw new Error(`Dialog field_index ${fieldIndex} is out of range`);
			}
			field = fields[fieldIndex] as CuaElement;
		} else if (fieldName) {
			const exact = fields.filter(
				(element) =>
					sameText(element.label, fieldName) ||
					sameText(element.value_description, fieldName),
			);
			field =
				exact.length === 1
					? (exact[0] as CuaElement)
					: uniqueElement(
							fields,
							(element) =>
								containsText(element.label, fieldName) ||
								containsText(element.value_description, fieldName),
							`Dialog field "${fieldName}"`,
						);
		} else if (fields.length === 1) {
			field = fields[0] as CuaElement;
		} else {
			throw new Error(
				"Dialog input requires field or field_index when multiple fields exist",
			);
		}
		const text = asString(args.text) ?? "";
		if (asBoolean(args.clear) === true) {
			const clear = await this.callCua(
				sessionId,
				"set_value",
				{
					...targetArgs(field, pid, windowId, snapshotId),
					value: "",
				},
				signal,
			);
			if (clear.isError) throw new Error(errorText(clear));
		}
		return this.callCua(
			sessionId,
			"type_text",
			{
				...targetArgs(field, pid, windowId, snapshotId),
				text,
			},
			signal,
		);
	}

	private async action(
		sessionId: string,
		args: JsonRecord,
		signal?: AbortSignal,
	): Promise<SerializableComputerToolResult> {
		const action = requiredString(args, "action");
		const mapped: Record<string, string> = {
			AXPress: "press",
			AXShowMenu: "show_menu",
			AXPick: "pick",
			AXConfirm: "confirm",
			AXCancel: "cancel",
			AXOpen: "open",
		};
		const cuaAction = mapped[action];
		if (!cuaAction) {
			throw new Error(`Unsupported semantic action: ${action}`);
		}
		const pid = requiredNumber(args, "pid");
		return this.callCua(
			sessionId,
			"click",
			{
				pid,
				...(asNumber(args.window_id)
					? { window_id: asNumber(args.window_id) }
					: {}),
				...(asString(args.element_token)
					? { element_token: asString(args.element_token) }
					: {}),
				...(asNumber(args.element_index) !== undefined
					? { element_index: asNumber(args.element_index) }
					: {}),
				...(asString(args.snapshot_id)
					? { snapshot_id: asString(args.snapshot_id) }
					: {}),
				action: cuaAction,
			},
			signal,
		);
	}
}
