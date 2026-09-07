import type { McpToolResult } from "./stdio-mcp-client";

type Args = Record<string, unknown>;
type ToolCall = (
	name: string,
	args: Args,
	signal?: AbortSignal,
) => Promise<McpToolResult>;
interface Receipt {
	pid: number;
	window_id: number;
	process_start_identity_decimal: string;
}
function record(value: unknown): Args | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Args)
		: undefined;
}
function receiptOf(result: McpToolResult): Receipt | undefined {
	const value = record(record(result._meta)?.target_receipt);
	if (
		typeof value?.pid !== "number" ||
		typeof value.window_id !== "number" ||
		typeof value.process_start_identity_decimal !== "string"
	)
		return;
	return {
		pid: value.pid,
		window_id: value.window_id,
		process_start_identity_decimal: value.process_start_identity_decimal,
	};
}
function textOf(result: McpToolResult): string {
	return Array.isArray(result.content)
		? result.content
				.flatMap((block) => {
					const item = record(block);
					return item?.type === "text" && typeof item.text === "string"
						? [item.text]
						: [];
				})
				.join("\n")
		: "";
}
function append(result: McpToolResult, text: string): McpToolResult {
	return {
		...result,
		content: [
			...(Array.isArray(result.content) ? result.content : []),
			{ type: "text", text },
		],
	};
}
function refused(text: string): McpToolResult {
	return {
		isError: true,
		_meta: {
			state: "refused",
			mutation_dispatched: false,
			escalation: "refresh_target",
		},
		content: [{ type: "text", text }],
	};
}
function sameReceipt(left: Receipt, right: Receipt | undefined): boolean {
	return (
		right?.pid === left.pid &&
		right.window_id === left.window_id &&
		right.process_start_identity_decimal === left.process_start_identity_decimal
	);
}

const GEOMETRY_GUIDANCE =
	"The screenshot bounds disagree with the Accessibility window bounds (for example, a Stage Manager thumbnail). Do not use coordinates from this snapshot. Focus/restore the intended app and window with computer_app/computer_window, then call computer_see again and recompute coordinates. If bounds still disagree, stop; do not disable targeting checks.";

/** Session-local recovery at the real upstream tool boundary. Never replays a mutation. */
export class PeekabooToolExecutor {
	private readonly snapshots = new Map<
		string,
		{ receipt?: Receipt; mismatched: boolean }
	>();
	constructor(private readonly upstream: ToolCall) {}

	async call(
		name: string,
		args: Args,
		signal?: AbortSignal,
	): Promise<McpToolResult> {
		const invoke: ToolCall = (tool, input) => {
			signal?.throwIfAborted();
			return this.upstream(tool, input, signal);
		};
		const reference =
			typeof args.snapshot === "string"
				? args.snapshot
				: args.coordinate_reference;
		const snapshot =
			typeof reference === "string" ? this.snapshots.get(reference) : undefined;
		if (
			snapshot?.mismatched &&
			(args.coords !== undefined || args.coordinate_reference !== undefined)
		)
			return refused(GEOMETRY_GUIDANCE);

		let target = snapshot?.receipt;
		let prepared = args;
		// An app-only press otherwise selects the first WindowServer surface, which
		// can be an untitled menu-bar window without an AXWindow. Explicit snapshots
		// and title/index selectors remain upstream-owned, including their validation.
		const app =
			typeof args.app === "string"
				? args.app
				: typeof args.pid === "number"
					? `PID:${args.pid}`
					: undefined;
		if (
			name === "press" &&
			app &&
			args.snapshot === undefined &&
			args.window_title === undefined &&
			args.window_index === undefined
		) {
			const observeArgs = {
				app_target: app,
				...(args.window_id !== undefined ? { window_id: args.window_id } : {}),
				max_elements: 1,
			};
			const before = await invoke("inspect_ui", observeArgs);
			target = receiptOf(before);
			if (before.isError || !target)
				return append(
					refused(
						"Keyboard input was not sent: an exact accessible window could not be resolved. Select a document with computer_inspect_ui or computer_window list.",
					),
					textOf(before),
				);
			prepared = { ...args, window_id: target.window_id };
			if (args.foreground === true) {
				// Satisfy foreground intent at the app level. A second AX observation must
				// identify the same active document before using exact-window key delivery.
				// This avoids Peekaboo's separate, unreliable WindowServer focus lookup.
				const focus = await invoke("app", {
					action: "focus",
					name: `PID:${target.pid}`,
				});
				if (focus.isError)
					return append(
						focus,
						"Superset: keyboard input was not sent because app focus was not confirmed. Observe the app before another attempt.",
					);
				const active = await invoke("inspect_ui", {
					app_target: `PID:${target.pid}`,
					max_elements: 1,
				});
				if (active.isError || !sameReceipt(target, receiptOf(active)))
					return refused(
						"Keyboard input was not sent: the active accessible window or process changed after focus. Observe and select the intended document again.",
					);
				prepared = { ...prepared, foreground: false };
			}
		}

		let result = await invoke(name, prepared);
		if (name === "see" || name === "inspect_ui")
			result = this.rememberObservation(result, args);
		const meta = record(result._meta);
		if (meta?.mutation_dispatched === true && meta.effect !== "confirmed") {
			result = append(
				result,
				"Superset execution status: the operation was dispatched or may have been dispatched; its effect is unconfirmed. Do not repeat the action. Inspect/verify the intended result first. isError here does not mean no input occurred.",
			);
			target = receiptOf(result) ?? target;
			if (target) {
				try {
					const after = await invoke("inspect_ui", {
						app_target: `PID:${target.pid}`,
						window_id: target.window_id,
						max_elements: 80,
					});
					result = append(
						result,
						`Post-action observation (not an automatic success verdict):\n${textOf(after) || "No observation returned."}`,
					);
				} catch {
					result = append(
						result,
						"Post-action observation failed. The original operation may still have taken effect; do not automatically retry it.",
					);
				}
			}
		} else if (
			meta?.mutation_dispatched === false &&
			meta.effect === "refused"
		) {
			result = append(
				result,
				`Superset execution status: no mutation was dispatched. Reason: ${String(meta.refusal_reason ?? "request refused")}. Follow ${String(meta.escalation ?? "the upstream guidance")} before retrying.`,
			);
		}
		return result;
	}

	private rememberObservation(
		result: McpToolResult,
		args: Args,
	): McpToolResult {
		if (result.isError) return result;
		const meta = record(result._meta);
		const context = record(meta?.coordinate_context);
		const text = textOf(result);
		const id = context?.reference_id ?? /^Snapshot ID: (\S+)$/m.exec(text)?.[1];
		if (typeof id !== "string") return result;
		const bounds = record(context?.logical_bounds);
		// Peekaboo 4.x only supplies AX bounds in text. Match the root element, not
		// arbitrary descendants. ROI observations use another origin and are excluded.
		const root =
			/^ {2}elem_0 - .* - at \((-?[\d.]+), (-?[\d.]+)\) size ([\d.]+)[×x]([\d.]+)/m.exec(
				text,
			);
		const mismatched =
			args.roi === undefined &&
			bounds !== undefined &&
			root !== null &&
			["x", "y", "width", "height"].some(
				(key, i) =>
					typeof bounds[key] === "number" &&
					Math.abs((bounds[key] as number) - Number(root[i + 1])) > 2,
			);
		this.snapshots.delete(id);
		this.snapshots.set(id, { receipt: receiptOf(result), mismatched });
		if (this.snapshots.size > 64) {
			const oldest = this.snapshots.keys().next().value;
			if (oldest !== undefined) this.snapshots.delete(oldest);
		}
		return mismatched ? append(result, GEOMETRY_GUIDANCE) : result;
	}
}
