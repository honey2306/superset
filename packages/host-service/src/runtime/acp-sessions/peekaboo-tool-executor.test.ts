import { describe, expect, test } from "bun:test";
import { PeekabooToolExecutor } from "./peekaboo-tool-executor";
import type { McpToolResult } from "./stdio-mcp-client";

const receipt = {
	pid: 38434,
	window_id: 1844,
	process_start_identity_decimal: "1788780949444626",
};
const observation: McpToolResult = {
	isError: false,
	_meta: { target_receipt: receipt },
	content: [
		{
			type: "text",
			text: 'UI Text Inspection\nSnapshot ID: ps1_document\nUI Elements:\n\nother (1 found, 0 actionable):\n  elem_0 - "test-document.txt" - at (218, 83) size 673x439\n',
		},
	],
};
const dispatched: McpToolResult = {
	isError: true,
	_meta: {
		state: "dispatched_unverified",
		mutation_dispatched: true,
		effect: "unverifiable",
	},
	content: [
		{
			type: "text",
			text: "Raw chord cmd+s did not return a confirmed outcome.",
		},
	],
};
function harness(results: McpToolResult[]) {
	const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
	const executor = new PeekabooToolExecutor(async (name, args) => {
		calls.push({ name, args });
		const result = results.shift();
		if (!result) throw new Error("Unexpected upstream call");
		return result;
	});
	return { calls, executor };
}

describe("Peekaboo execution recovery", () => {
	test("pins an app-only chord to the accessible document instead of the first WindowServer window", async () => {
		const { executor, calls } = harness([observation, dispatched, observation]);
		const result = await executor.call("press", {
			app: "TextEdit",
			keys: ["cmd+s"],
		});
		expect(calls[1]).toEqual({
			name: "press",
			args: { app: "TextEdit", keys: ["cmd+s"], window_id: 1844 },
		});
		expect(calls.filter((c) => c.name === "press")).toHaveLength(1);
		expect(JSON.stringify(result.content)).toContain("Do not repeat");
		expect(result.isError).toBe(true);
	});
	test("fulfills foreground intent through app focus, then sends an exact-window chord", async () => {
		const { executor, calls } = harness([
			observation,
			{ isError: false },
			observation,
			dispatched,
			observation,
		]);
		await executor.call("press", {
			app: "TextEdit",
			foreground: true,
			keys: ["cmd+s"],
		});
		expect(calls.map((c) => c.name)).toEqual([
			"inspect_ui",
			"app",
			"inspect_ui",
			"press",
			"inspect_ui",
		]);
		expect(calls[1]?.args).toEqual({ action: "focus", name: "PID:38434" });
		expect(calls[3]?.args).toEqual({
			app: "TextEdit",
			foreground: false,
			keys: ["cmd+s"],
			window_id: 1844,
		});
	});
	test("does not dispatch when focusing selects another document or process generation", async () => {
		for (const changed of [
			{ ...receipt, window_id: 999 },
			{ ...receipt, process_start_identity_decimal: "new-process" },
		]) {
			const { executor, calls } = harness([
				observation,
				{ isError: false },
				{ ...observation, _meta: { target_receipt: changed } },
			]);
			const result = await executor.call("press", {
				app: "TextEdit",
				foreground: true,
				keys: ["cmd+s"],
			});
			expect(result.isError).toBe(true);
			expect(calls.some((c) => c.name === "press")).toBe(false);
		}
	});
	test("does not replace explicit snapshots, title selectors, or targetless input", async () => {
		for (const args of [
			{ snapshot: "original", keys: ["Return"] },
			{ app: "TextEdit", window_title: "Wanted", keys: ["Return"] },
			{ keys: ["Return"], foreground: true },
		]) {
			const { executor, calls } = harness([{ isError: false }]);
			await executor.call("press", args);
			expect(calls).toEqual([{ name: "press", args }]);
		}
	});
	test("does not dispatch after observation or focus fails", async () => {
		for (const results of [
			[{ isError: true }],
			[observation, { isError: true }],
		]) {
			const { executor, calls } = harness(results);
			expect(
				(
					await executor.call("press", {
						app: "TextEdit",
						foreground: true,
						keys: ["Return"],
					})
				).isError,
			).toBe(true);
			expect(calls.some((c) => c.name === "press")).toBe(false);
		}
	});
	test("makes dispatched and refused results visible without metadata-aware clients", async () => {
		const { executor } = harness([dispatched]);
		const result = await executor.call("click", {
			on: "elem_2",
			snapshot: "unknown",
		});
		expect(JSON.stringify(result.content)).toContain("Do not repeat");
		expect(result._meta).toEqual(dispatched._meta);
	});
	test("does not convert a readback failure into mutation failure or retry a mutation", async () => {
		const { executor, calls } = harness([
			observation,
			dispatched,
			{ isError: true, content: [{ type: "text", text: "Window closed" }] },
		]);
		const result = await executor.call("press", {
			app: "TextEdit",
			keys: ["cmd+s"],
		});
		expect(result._meta).toEqual(dispatched._meta);
		expect(calls.filter((c) => c.name === "press")).toHaveLength(1);
	});
	test("flags thumbnail geometry and blocks stale coordinate input", async () => {
		const thumbnail = {
			...observation,
			_meta: {
				target_receipt: receipt,
				coordinate_context: {
					reference_id: "ps1_document",
					logical_bounds: { x: 16, y: 593, width: 99, height: 100 },
				},
			},
		};
		const { executor, calls } = harness([thumbnail]);
		const seen = await executor.call("see", {
			app_target: "TextEdit",
			window_id: 1844,
		});
		expect(JSON.stringify(seen.content)).toContain("thumbnail");
		const clicked = await executor.call("click", {
			snapshot: "ps1_document",
			coords: "30,40",
		});
		expect(clicked.isError).toBe(true);
		expect(calls).toHaveLength(1);
	});
	test("accepts matching geometry and preserves element and schema semantics", async () => {
		const full = {
			...observation,
			_meta: {
				target_receipt: receipt,
				coordinate_context: {
					reference_id: "ps1_document",
					logical_bounds: { x: 218, y: 83, width: 673, height: 439 },
				},
			},
		};
		const { executor, calls } = harness([full, { isError: false }]);
		await executor.call("see", { app_target: "TextEdit" });
		await executor.call("click", {
			snapshot: "ps1_document",
			coords: "30,40",
			coordinate_space: "image_pixels",
		});
		expect(calls[1]?.name).toBe("click");
	});
});

describe("window restoration recovery", () => {
	const native = {
		receipt,
		applicationName: "TextEdit",
		complete: true,
		elements: [
			{
				id: "elem_0",
				ax_role: "AXWindow",
				bounds: { x: 218, y: 83, width: 673, height: 439 },
			},
		],
	};
	const failure = {
		isError: true,
		_meta: {
			effect: "refused",
			mutation_dispatched: false,
			target_receipt: receipt,
		},
		content: [
			{
				type: "text",
				text: "Window 1844 changed identity before native dispatch",
			},
		],
	};
	const restored = {
		...observation,
		_meta: {
			target_receipt: receipt,
			coordinate_context: {
				reference_id: "restored",
				logical_bounds: native.elements[0]?.bounds,
			},
		},
	};
	test.each([
		"Window 1844 changed identity before native dispatch",
		"Pinned window target disappeared or changed owner/process generation/bounds",
	])("restores through app activation after %s", async (message) => {
		const calls: string[] = [];
		const executor = new PeekabooToolExecutor(
			async (name) => {
				calls.push(name);
				return name === "window"
					? { ...failure, content: [{ type: "text", text: message }] }
					: name === "app"
						? dispatched
						: restored;
			},
			async () => native,
		);
		const result = await executor.call("window", {
			action: "restore",
			app: "TextEdit",
			window_id: 1844,
		});
		expect(calls).toEqual(["window", "app", "see", "see"]);
		expect(result.isError).toBe(false);
		expect(result._meta).toMatchObject({
			recovery: "app-activation",
			effect: "confirmed",
		});
	});
	test("observes again after a transient AX read failure without repeating activation", async () => {
		let reads = 0;
		const calls: string[] = [];
		const executor = new PeekabooToolExecutor(
			async (name) => {
				calls.push(name);
				return name === "window"
					? failure
					: name === "app"
						? dispatched
						: restored;
			},
			async () => {
				if (++reads === 3)
					throw new Error("AX temporarily unavailable during restoration");
				return native;
			},
		);
		const result = await executor.call("window", {
			action: "restore",
			app: "TextEdit",
			window_id: 1844,
		});
		expect(result.isError).toBe(false);
		expect(calls.filter((name) => name === "app")).toHaveLength(1);
		expect(calls.filter((name) => name === "see")).toHaveLength(3);
	});
	test("never retries app activation or reports success while screenshot remains a thumbnail", async () => {
		const calls: string[] = [];
		const executor = new PeekabooToolExecutor(
			async (name) => {
				calls.push(name);
				return name === "window"
					? failure
					: name === "app"
						? dispatched
						: {
								...restored,
								_meta: {
									...restored._meta,
									coordinate_context: {
										reference_id: "tiny",
										logical_bounds: { x: 16, y: 593, width: 99, height: 100 },
									},
								},
							};
			},
			async () => native,
		);
		const result = await executor.call("window", {
			action: "restore",
			app: "TextEdit",
			window_id: 1844,
		});
		expect(calls.filter((name) => name === "app")).toHaveLength(1);
		expect(result.isError).toBe(true);
		expect(result._meta).toMatchObject({ mutation_dispatched: true });
	});
	test("stops before app activation when the process generation changes", async () => {
		let reads = 0;
		const calls: string[] = [];
		const executor = new PeekabooToolExecutor(
			async (name) => {
				calls.push(name);
				return failure;
			},
			async () => ({
				...native,
				receipt: {
					...receipt,
					process_start_identity_decimal:
						reads++ === 0 ? receipt.process_start_identity_decimal : "999",
				},
			}),
		);
		expect(
			(
				await executor.call("window", {
					action: "restore",
					app: "TextEdit",
					window_id: 1844,
				})
			).isError,
		).toBe(true);
		expect(calls).toEqual(["window"]);
	});
});

describe("final observation identity", () => {
	test("does not leave a satisfied summary when final capture changes windows", async () => {
		const state = {
			receipt,
			applicationName: "TextEdit",
			complete: true,
			elements: [{ id: "elem_0", ax_role: "AXWindow" }],
		};
		const executor = new PeekabooToolExecutor(
			async () => ({
				...observation,
				_meta: { target_receipt: { ...receipt, window_id: 999 } },
			}),
			async () => state,
		);
		const result = await executor.call("verify_state", {
			pid: receipt.pid,
			window_id: receipt.window_id,
			predicates: [{ kind: "window_exists", expected: true }],
			final_screenshot: true,
		});
		expect(result.isError).toBe(true);
		expect(JSON.stringify(result.content)).toContain("Verification unknown");
		expect(JSON.stringify(result.content)).not.toContain(
			"Verification satisfied",
		);
	});
});

describe("capture engine recovery", () => {
	test("reports a locked session without attempting another capture or activation", async () => {
		const { executor, calls } = harness([
			{
				isError: true,
				_meta: { mutation_dispatched: false, escalation: "update_runtime" },
				content: [
					{
						type: "text",
						text: "Screen capture is unavailable while the macOS GUI session is locked.",
					},
				],
			},
		]);
		const result = await executor.call("see", { app_target: "TextEdit" });
		expect(result._meta).toMatchObject({
			escalation: "unlock_session",
			mutation_dispatched: false,
		});
		expect(calls).toHaveLength(1);
	});
	const captureFailure: McpToolResult = {
		isError: true,
		content: [
			{
				type: "text",
				text: "Capture failed: Exact window changed while ScreenCaptureKit prepared capture metadata",
			},
		],
	};
	test("re-observes the exact window once with classic capture after the known preparation race", async () => {
		const { executor, calls } = harness([captureFailure, observation]);
		const result = await executor.call("see", {
			app_target: "PID:38434",
			window_id: 1844,
		});
		expect(result.isError).toBe(false);
		expect(calls).toEqual([
			{ name: "see", args: { app_target: "PID:38434", window_id: 1844 } },
			{
				name: "see",
				args: {
					app_target: "PID:38434",
					window_id: 1844,
					capture_engine: "classic",
				},
			},
		]);
	});
	test("preserves an explicit engine and unrelated capture refusals", async () => {
		for (const [args, failure] of [
			[{ app_target: "TextEdit", capture_engine: "modern" }, captureFailure],
			[
				{ app_target: "TextEdit" },
				{
					isError: true,
					content: [{ type: "text", text: "Permission denied" }],
				},
			],
		] as const) {
			const { executor, calls } = harness([failure]);
			expect((await executor.call("see", args)).isError).toBe(true);
			expect(calls).toHaveLength(1);
		}
	});
});
