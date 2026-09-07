import { describe, expect, test } from "bun:test";
import { type NativeState, parseNativeState } from "./peekaboo-native-state";
import { verifyNativeState } from "./peekaboo-state-verifier";

const state: NativeState = {
	receipt: { pid: 42, window_id: 100, process_start_identity_decimal: "1234" },
	applicationName: "TextEdit",
	complete: true,
	elements: [
		{
			id: "elem_0",
			ax_role: "AXWindow",
			bounds: { x: 0, y: 0, width: 600, height: 400 },
		},
		{
			id: "elem_2",
			identifier: "editor",
			ax_role: "AXTextArea",
			value: "hello",
			is_enabled: true,
			is_selected: false,
		},
	],
};
const args = {
	pid: 42,
	window_id: 100,
	timeout_ms: 1000,
	predicates: [
		{
			kind: "element_value",
			selector: { identifier: "editor" },
			expected_value: "hello",
		},
	],
};
describe("targeted native verification", () => {
	test("verifies all supported predicates from structured AX state without app inventory", async () => {
		const result = await verifyNativeState(
			{
				...args,
				predicates: [
					...args.predicates,
					{ kind: "window_exists", expected: true },
					{
						kind: "window_bounds",
						bounds: { x: 0, y: 0, width: 600, height: 400 },
					},
					{
						kind: "element_exists",
						selector: { identifier: "absent" },
						expected: false,
					},
					{
						kind: "element_enabled",
						selector: { identifier: "editor" },
						expected: true,
					},
					{
						kind: "element_selected",
						selector: { identifier: "editor" },
						expected: false,
					},
				],
			},
			async () => state,
		);
		expect(result.isError).toBe(false);
		expect(result._meta).toMatchObject({
			status: "satisfied",
			stable_samples: 2,
		});
	});
	test("wrong values are unsatisfied, never success", async () => {
		const result = await verifyNativeState(
			{ ...args, timeout_ms: 100 },
			async () => ({ ...state, elements: state.elements.slice(0, 1) }),
		);
		expect(result.isError).toBe(true);
		expect(result._meta).toMatchObject({ status: "unsatisfied" });
	});
	test("incomplete trees cannot prove absent elements", async () => {
		const result = await verifyNativeState(
			{
				...args,
				timeout_ms: 100,
				predicates: [
					{
						kind: "element_exists",
						selector: { identifier: "missing" },
						expected: false,
					},
				],
			},
			async () => ({ ...state, complete: false }),
		);
		expect(result._meta).toMatchObject({ status: "unknown" });
	});
	test("missing selected/enabled attributes are unknown", async () => {
		const result = await verifyNativeState(
			{
				...args,
				timeout_ms: 100,
				predicates: [
					{
						kind: "element_enabled",
						selector: { role: "AXWindow" },
						expected: false,
					},
				],
			},
			async () => state,
		);
		expect(result._meta).toMatchObject({ status: "unknown" });
	});
	test("process replacement cannot satisfy a second stable sample", async () => {
		let calls = 0;
		const result = await verifyNativeState(
			{ ...args, timeout_ms: 100 },
			async () => ({
				...state,
				receipt: {
					...state.receipt,
					process_start_identity_decimal: calls++ === 0 ? "1234" : "9999",
				},
			}),
		);
		expect(result.isError).toBe(true);
	});
	test("read failure and timeout never imply an absent window", async () => {
		const result = await verifyNativeState(
			{
				...args,
				timeout_ms: 100,
				predicates: [{ kind: "window_exists", expected: false }],
			},
			async () => {
				throw new Error("AX unavailable");
			},
		);
		expect(result._meta).toMatchObject({ status: "unknown" });
	});
	test("rejects conflicting selectors and empty predicates before reading", async () => {
		let calls = 0;
		for (const invalid of [
			{ ...args, app: "TextEdit" },
			{ ...args, predicates: [] },
			{ ...args, window_title: "Other" },
		]) {
			expect(
				(
					await verifyNativeState(invalid, async () => {
						calls++;
						return state;
					})
				).isError,
			).toBe(true);
		}
		expect(calls).toBe(0);
	});
	test("parses native metadata conservatively", () => {
		const raw = {
			success: true,
			target_receipt: state.receipt,
			data: {
				application_name: "TextEdit",
				snapshot_id: "s1",
				ui_elements: state.elements,
				truncation: { max_depth_reached: true },
			},
		};
		expect(parseNativeState(raw).complete).toBe(false);
	});
});
