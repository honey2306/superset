import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import {
	boundsSchema,
	type NativeReceipt,
	type NativeState,
	type ReadNativeState,
} from "./peekaboo-native-state";
import type { McpToolResult } from "./stdio-mcp-client";

const selector = z
	.object({
		identifier: z.string().optional(),
		label: z.string().optional(),
		role: z.string().optional(),
	})
	.strict()
	.refine((value) => Object.keys(value).length > 0);
const predicate = z.discriminatedUnion("kind", [
	z
		.object({ kind: z.literal("window_exists"), expected: z.boolean() })
		.strict(),
	z
		.object({
			kind: z.literal("window_bounds"),
			bounds: boundsSchema,
			tolerance: z.number().min(0).max(100).default(1),
		})
		.strict(),
	z
		.object({
			kind: z.literal("element_exists"),
			selector,
			expected: z.boolean(),
		})
		.strict(),
	z
		.object({
			kind: z.literal("element_value"),
			selector,
			expected_value: z.string(),
		})
		.strict(),
	z
		.object({
			kind: z.literal("element_enabled"),
			selector,
			expected: z.boolean(),
		})
		.strict(),
	z
		.object({
			kind: z.literal("element_selected"),
			selector,
			expected: z.boolean(),
		})
		.strict(),
]);
const requestSchema = z
	.object({
		app: z.string().min(1).optional(),
		pid: z.number().int().positive().optional(),
		window_id: z.number().int().positive().optional(),
		window_title: z.string().optional(),
		window_index: z.number().int().nonnegative().optional(),
		predicates: z.array(predicate).min(1).max(8),
		timeout_ms: z.number().int().min(100).max(10000).default(5000),
		stable_samples: z.number().int().min(1).max(10).default(2),
		final_screenshot: z.boolean().default(false),
	})
	.strict()
	.refine(
		(value) => !(value.app !== undefined && value.pid !== undefined),
		"app and pid are mutually exclusive",
	)
	.refine(
		(value) =>
			[value.window_id, value.window_title, value.window_index].filter(
				(v) => v !== undefined,
			).length <= 1,
		"window selectors are mutually exclusive",
	);
type Status = "satisfied" | "unsatisfied" | "unknown";
interface Check {
	kind: string;
	status: Status;
	observed?: unknown;
	reason?: string;
}
const check = (kind: string, matches: boolean, observed: unknown): Check => ({
	kind,
	status: matches ? "satisfied" : "unsatisfied",
	observed,
});

function evaluate(p: z.infer<typeof predicate>, state: NativeState): Check {
	const root = state.elements.find((e) => e.ax_role === "AXWindow");
	if (p.kind === "window_exists")
		return root
			? check(p.kind, p.expected, true)
			: {
					kind: p.kind,
					status: "unknown",
					reason: "No exact AXWindow was returned",
				};
	if (p.kind === "window_bounds") {
		const observed = root?.bounds;
		return observed
			? check(
					p.kind,
					(["x", "y", "width", "height"] as const).every(
						(k) => Math.abs(observed[k] - p.bounds[k]) <= p.tolerance,
					),
					observed,
				)
			: {
					kind: p.kind,
					status: "unknown",
					reason: "Window bounds unavailable",
				};
	}
	const matches = state.elements.filter(
		(e) =>
			(p.selector.identifier === undefined ||
				p.selector.identifier === e.identifier) &&
			(p.selector.label === undefined || p.selector.label === e.label) &&
			(p.selector.role === undefined ||
				p.selector.role === e.ax_role ||
				p.selector.role === e.role),
	);
	if (!matches.length && !state.complete)
		return { kind: p.kind, status: "unknown", reason: "AX tree is incomplete" };
	if (p.kind === "element_exists")
		return check(p.kind, matches.length > 0 === p.expected, matches.length > 0);
	if (!matches.length)
		return { kind: p.kind, status: "unsatisfied", reason: "Element absent" };
	if (!state.complete)
		return {
			kind: p.kind,
			status: "unknown",
			reason:
				"AX tree is incomplete; selector uniqueness cannot be established",
		};
	if (matches.length !== 1)
		return {
			kind: p.kind,
			status: "unknown",
			reason: "Selector matches multiple elements",
		};
	const element = matches[0];
	const observed =
		p.kind === "element_value"
			? element?.value
			: p.kind === "element_enabled"
				? element?.is_enabled
				: element?.is_selected;
	if (observed === undefined)
		return {
			kind: p.kind,
			status: "unknown",
			reason: "Requested AX attribute is unavailable",
		};
	return check(
		p.kind,
		observed === (p.kind === "element_value" ? p.expected_value : p.expected),
		observed,
	);
}
function identityEqual(a: NativeReceipt, b: NativeReceipt): boolean {
	return (
		a.pid === b.pid &&
		a.window_id === b.window_id &&
		a.process_start_identity_decimal === b.process_start_identity_decimal
	);
}

/** Explicit target reads avoid the upstream verifier's unrelated global inventory gate. */
export async function verifyNativeState(
	args: Record<string, unknown>,
	read: ReadNativeState,
	signal?: AbortSignal,
): Promise<McpToolResult> {
	const parsed = requestSchema.safeParse(args);
	if (!parsed.success)
		return {
			isError: true,
			content: [
				{
					type: "text",
					text: `Invalid verification request: ${parsed.error.message}`,
				},
			],
		};
	const request = parsed.data;
	const started = performance.now();
	const deadline = started + request.timeout_ms;
	let receipt: NativeReceipt | undefined;
	let checks: Check[] = [];
	let status: Status = "unknown";
	let reason = "No complete sample before deadline";
	let stable = 0;
	let fingerprint: string | undefined;
	let samples = 0;
	do {
		signal?.throwIfAborted();
		const target = receipt
			? { pid: receipt.pid, window_id: receipt.window_id }
			: Object.fromEntries(
					Object.entries(request).filter(([key]) =>
						[
							"app",
							"pid",
							"window_id",
							"window_title",
							"window_index",
						].includes(key),
					),
				);
		try {
			const state = await read(
				target,
				Math.max(1, deadline - performance.now()),
				signal,
			);
			if (performance.now() > deadline) {
				status = "unknown";
				reason = "Observation exceeded verification deadline";
				stable = 0;
				break;
			}
			if (
				(request.pid !== undefined && request.pid !== state.receipt.pid) ||
				(request.window_id !== undefined &&
					request.window_id !== state.receipt.window_id) ||
				(receipt && !identityEqual(receipt, state.receipt))
			) {
				status = "unknown";
				reason = "Target process or exact window identity changed";
				stable = 0;
				break;
			}
			receipt = state.receipt;
			checks = request.predicates.map((p) => evaluate(p, state));
			samples++;
			status = checks.some((c) => c.status === "unknown")
				? "unknown"
				: checks.every((c) => c.status === "satisfied")
					? "satisfied"
					: "unsatisfied";
			reason = checks.find((c) => c.reason)?.reason ?? "";
			const next = JSON.stringify({ receipt, checks });
			stable =
				status === "satisfied" ? (next === fingerprint ? stable + 1 : 1) : 0;
			fingerprint = next;
			if (stable >= request.stable_samples) break;
		} catch (error) {
			signal?.throwIfAborted();
			status = "unknown";
			stable = 0;
			fingerprint = undefined;
			reason = error instanceof Error ? error.message : String(error);
		}
		const remaining = deadline - performance.now();
		if (remaining <= 0) break;
		await delay(Math.min(50, remaining), undefined, { signal });
	} while (performance.now() < deadline);
	if (status === "satisfied" && stable < request.stable_samples) {
		status = "unknown";
		reason = "Insufficient stable samples before deadline";
	}
	return {
		isError: status !== "satisfied",
		_meta: {
			status,
			verifier: "superset-targeted-ax",
			sample_count: samples,
			stable_samples: stable,
			required_stable_samples: request.stable_samples,
			target_receipt: receipt,
			predicates: checks,
			reason,
		},
		content: [
			{
				type: "text",
				text: `Verification ${status} after ${samples} targeted AX sample(s).${reason ? `\nReason: ${reason}` : ""}\n${checks.map((c, i) => `${i + 1}. ${c.kind}: ${c.status}${c.observed !== undefined ? `; observed ${JSON.stringify(c.observed)}` : ""}${c.reason ? `; ${c.reason}` : ""}`).join("\n")}`,
			},
		],
	};
}
