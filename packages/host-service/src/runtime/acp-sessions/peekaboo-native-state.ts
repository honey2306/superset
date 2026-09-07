import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

const execFileAsync = promisify(execFile);
export const nativeReceiptSchema = z.object({
	pid: z.number().int().positive(),
	window_id: z.number().int().positive(),
	process_start_identity_decimal: z.string().regex(/^\d+$/),
});
export const boundsSchema = z.object({
	x: z.number().finite(),
	y: z.number().finite(),
	width: z.number().nonnegative(),
	height: z.number().nonnegative(),
});
const elementSchema = z.object({
	id: z.string(),
	ax_role: z.string().optional(),
	role: z.string().optional(),
	identifier: z.string().optional(),
	label: z.string().optional(),
	value: z.string().optional(),
	is_enabled: z.boolean().optional(),
	is_selected: z.boolean().optional(),
	bounds: boundsSchema.optional(),
});
const responseSchema = z.object({
	success: z.literal(true),
	target_receipt: nativeReceiptSchema,
	data: z.object({
		application_name: z.string(),
		snapshot_id: z.string(),
		ui_elements: z.array(elementSchema),
		truncation: z.record(z.string(), z.unknown()).optional(),
		observation: z
			.object({ warnings: z.array(z.string()).optional() })
			.optional(),
	}),
});
export type NativeReceipt = z.infer<typeof nativeReceiptSchema>;
export interface NativeState {
	receipt: NativeReceipt;
	applicationName: string;
	elements: z.infer<typeof elementSchema>[];
	complete: boolean;
}
export type ReadNativeState = (
	target: Record<string, unknown>,
	timeoutMs: number,
	signal?: AbortSignal,
) => Promise<NativeState>;

export function parseNativeState(value: unknown): NativeState {
	const parsed = responseSchema.parse(value);
	return {
		receipt: parsed.target_receipt,
		applicationName: parsed.data.application_name,
		elements: parsed.data.ui_elements,
		complete:
			!parsed.data.truncation && !parsed.data.observation?.warnings?.length,
	};
}

/** Read only the requested AX window through the same authorized GUI Bridge. */
export function createNativeStateReader(
	executable: string,
	bridgeSocket: string | null,
): ReadNativeState {
	return async (target, timeoutMs, signal) => {
		if (!bridgeSocket)
			throw new Error(
				"Targeted verification requires the authorized Peekaboo GUI Bridge",
			);
		const args = [
			"see",
			"--tree",
			"--no-screenshot",
			"--json",
			"--bridge-socket",
			bridgeSocket,
			"--timeout",
			`${Math.max(1, Math.floor(timeoutMs))}ms`,
			"--max-elements",
			"10000",
		];
		for (const [key, flag] of [
			["app", "--app"],
			["pid", "--pid"],
			["window_id", "--window-id"],
			["window_title", "--window-title"],
			["window_index", "--window-index"],
		] as const) {
			if (target[key] !== undefined) args.push(flag, String(target[key]));
		}
		const { stdout } = await execFileAsync(executable, args, {
			timeout: Math.max(1, Math.ceil(timeoutMs)),
			maxBuffer: 8 * 1024 * 1024,
			signal,
		});
		return parseNativeState(JSON.parse(stdout));
	};
}
