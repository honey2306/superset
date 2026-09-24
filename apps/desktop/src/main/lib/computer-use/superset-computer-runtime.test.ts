import { describe, expect, test } from "bun:test";
import type * as MacProvider from "@superset/macos-computer-provider";
import type { SerializableComputerToolResult } from "./computer-runtime";
import { SupersetComputerToolsRuntime } from "./superset-computer-runtime";

type JsonRecord = Record<string, unknown>;

function cuaResult(
	structured: JsonRecord,
	text = "ok",
): SerializableComputerToolResult {
	const raw = JSON.stringify(structured);
	return {
		text,
		images: [],
		structuredJson: raw,
		isError: false,
		degraded: false,
		rawJson: raw,
	};
}

function provider(
	overrides: Partial<typeof MacProvider> = {},
): typeof MacProvider {
	return {
		isAvailable: () => true,
		listSpaces: () => [
			{
				number: 1,
				id: "1",
				type: "user",
				isActive: true,
				ownerPids: [],
			},
			{
				number: 2,
				id: "2",
				type: "user",
				isActive: false,
				ownerPids: [],
			},
		],
		spacesForWindow: () => ["1"],
		switchSpace: () => ({ dispatched: true, changed: true, confirmed: true }),
		moveWindowToSpace: () => ({
			dispatched: true,
			changed: true,
			confirmed: true,
		}),
		windowAction: () => ({
			dispatched: true,
			changed: true,
			confirmed: true,
		}),
		appAction: () => ({
			dispatched: true,
			changed: true,
			confirmed: true,
		}),
		listDockItems: () => [],
		dockAction: () => ({
			dispatched: true,
			changed: true,
			confirmed: false,
		}),
		isDockHidden: () => false,
		setDockHidden: () => ({
			dispatched: true,
			changed: true,
			confirmed: true,
		}),
		saveClipboard: () => "clip-1",
		restoreClipboard: () => true,
		...overrides,
	};
}

describe("SupersetComputerToolsRuntime", () => {
	test("exposes the macOS parity tool layer under stable Superset names", () => {
		const runtime = new SupersetComputerToolsRuntime(
			async () => cuaResult({}),
			provider(),
		);
		expect(runtime.tools().map((tool) => tool.name)).toEqual([
			"superset_window",
			"superset_space",
			"superset_dock",
			"superset_app",
			"superset_paste",
			"superset_dialog",
			"superset_action",
		]);
	});

	test("keeps the cross-platform high-level contract without the macOS supplement", async () => {
		const calls: string[] = [];
		const runtime = new SupersetComputerToolsRuntime(
			async (_session, name) => {
				calls.push(name);
				return cuaResult({ windows: [] });
			},
			provider({ isAvailable: () => false }),
		);
		expect(runtime.tools().map((tool) => tool.name)).toEqual([
			"superset_window",
			"superset_app",
			"superset_paste",
			"superset_dialog",
			"superset_action",
		]);
		await runtime.call("s", "superset_window", { action: "list" });
		expect(calls).toEqual(["list_windows"]);
		await expect(
			runtime.call("s", "superset_space", { action: "list" }),
		).rejects.toThrow(/macOS Computer Provider/);
	});

	test("verifies a native window mutation with a fresh Cua window inventory", async () => {
		let reads = 0;
		const nativeCalls: unknown[] = [];
		const runtime = new SupersetComputerToolsRuntime(
			async (_session, name) => {
				expect(name).toBe("list_windows");
				reads += 1;
				return cuaResult({
					windows: [
						{
							window_id: 10,
							pid: 42,
							app_name: "Fixture",
							title: "Document",
							bounds: { x: 0, y: 0, width: 500, height: 400 },
							is_on_screen: reads === 1,
							z_index: 1,
							minimized: reads > 1,
							space_ids: [1],
						},
					],
				});
			},
			provider({
				windowAction: (pid, windowId, action) => {
					nativeCalls.push({ pid, windowId, action });
					return { dispatched: true, changed: true, confirmed: true };
				},
			}),
		);

		const result = await runtime.call("s", "superset_window", {
			action: "minimize",
			pid: 42,
			window_id: 10,
		});
		expect(reads).toBe(2);
		expect(nativeCalls).toEqual([
			{ pid: 42, windowId: 10, action: "minimize" },
		]);
		expect(result.text).toContain("confirmed");
		expect(JSON.parse(result.structuredJson ?? "{}").after.minimized).toBe(
			true,
		);
	});

	test("moves an exact window to a Space and verifies membership through Cua", async () => {
		let reads = 0;
		const moved: unknown[] = [];
		const runtime = new SupersetComputerToolsRuntime(
			async (_session, name) => {
				expect(name).toBe("list_windows");
				reads += 1;
				return cuaResult({
					windows: [
						{
							window_id: 10,
							pid: 42,
							app_name: "Fixture",
							title: "Document",
							bounds: { x: 0, y: 0, width: 500, height: 400 },
							is_on_screen: true,
							z_index: 1,
							minimized: false,
							space_ids: reads === 1 ? [1] : [2],
						},
					],
				});
			},
			provider({
				moveWindowToSpace: (windowId, spaceId) => {
					moved.push({ windowId, spaceId });
					return { dispatched: true, changed: true, confirmed: true };
				},
			}),
		);

		const result = await runtime.call("s", "superset_space", {
			action: "move-window",
			window_id: 10,
			to: 2,
		});
		expect(moved).toEqual([{ windowId: 10, spaceId: "2" }]);
		expect(result.text).toContain("Moved window 10 to Space 2");
		expect(JSON.parse(result.structuredJson ?? "{}").after.space_ids).toEqual([
			2,
		]);
	});

	test("restores the original clipboard after an atomic temporary paste", async () => {
		const calls: Array<{ name: string; args: JsonRecord }> = [];
		const restored: string[] = [];
		const runtime = new SupersetComputerToolsRuntime(
			async (_session, name, args) => {
				calls.push({ name, args });
				return cuaResult(
					name === "clipboard_write"
						? { written_type: "text", supported: true }
						: { effect: "unverifiable", route: "synthetic_events" },
				);
			},
			provider({
				saveClipboard: () => "saved-clipboard",
				restoreClipboard: (token) => {
					restored.push(token);
					return true;
				},
			}),
		);

		await runtime.call("s", "superset_paste", {
			text: "hello",
			pid: 42,
			window_id: 10,
			restore_delay_ms: 0,
		});
		expect(calls).toEqual([
			{ name: "clipboard_write", args: { text: "hello" } },
			{
				name: "hotkey",
				args: {
					keys: ["cmd", "v"],
					pid: 42,
					window_id: 10,
					delivery_mode: "background",
				},
			},
		]);
		expect(restored).toEqual(["saved-clipboard"]);
	});

	test("uses the fresh dialog snapshot token for button actions", async () => {
		const calls: Array<{ name: string; args: JsonRecord }> = [];
		const runtime = new SupersetComputerToolsRuntime(
			async (_session, name, args) => {
				calls.push({ name, args });
				if (name === "get_window_state") {
					return cuaResult({
						snapshot_id: "s12345678",
						elements: [
							{
								element_index: 7,
								element_token: "opaque-button-token",
								role: "AXButton",
								label: "Save",
							},
						],
					});
				}
				return cuaResult({ effect: "confirmed", route: "accessibility" });
			},
			provider(),
		);

		await runtime.call("s", "superset_dialog", {
			action: "click",
			pid: 42,
			window_id: 10,
			button: "Save",
		});
		expect(calls[1]).toEqual({
			name: "click",
			args: {
				pid: 42,
				window_id: 10,
				element_token: "opaque-button-token",
				action: "press",
			},
		});
	});

	test("maps legacy semantic action names to Cua semantic AX actions", async () => {
		const calls: Array<{ name: string; args: JsonRecord }> = [];
		const runtime = new SupersetComputerToolsRuntime(
			async (_session, name, args) => {
				calls.push({ name, args });
				return cuaResult({ effect: "unverifiable" });
			},
			provider(),
		);

		await runtime.call("s", "superset_action", {
			pid: 42,
			window_id: 10,
			element_token: "opaque",
			action: "AXShowMenu",
		});
		expect(calls).toEqual([
			{
				name: "click",
				args: {
					pid: 42,
					window_id: 10,
					element_token: "opaque",
					action: "show_menu",
				},
			},
		]);
	});
});
