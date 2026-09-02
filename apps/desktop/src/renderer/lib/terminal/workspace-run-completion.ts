import { terminalRuntimeRegistry } from "./terminal-runtime-registry";

const WORKSPACE_RUN_COMPLETION_OSC = "777;superset-workspace-run-complete";
const activeWatches = new Map<string, () => void>();

export function buildTrackedWorkspaceRunCommand(
	command: string,
	marker: string,
): string {
	return `{ ${command}; }; __superset_workspace_run_exit=$?; printf '\\033]${WORKSPACE_RUN_COMPLETION_OSC};${marker};%s\\007' "$__superset_workspace_run_exit"`;
}

export interface WorkspaceRunCompletionScanner {
	push(data: Uint8Array): number | null;
}

export function createWorkspaceRunCompletionScanner(
	marker: string,
): WorkspaceRunCompletionScanner {
	const decoder = new TextDecoder();
	const prefix = `\u001b]${WORKSPACE_RUN_COMPLETION_OSC};${marker};`;
	let pending = "";
	let completed = false;

	return {
		push(data) {
			if (completed) return null;
			pending += decoder.decode(data, { stream: true });
			const start = pending.indexOf(prefix);
			if (start >= 0) {
				const suffix = pending.slice(start + prefix.length);
				const terminator = suffix.indexOf("\u0007");
				const exitCode = terminator >= 0 ? suffix.slice(0, terminator) : "";
				if (/^\d+$/.test(exitCode)) {
					completed = true;
					return Number.parseInt(exitCode, 10);
				}
			}

			const maxPendingLength = prefix.length + 32;
			if (pending.length > maxPendingLength) {
				pending = pending.slice(-maxPendingLength);
			}
			return null;
		},
	};
}

interface WorkspaceRunCompletionWatchOptions {
	marker: string;
	onComplete: (exitCode: number) => void;
	onDispose?: () => void;
	subscribeData: (listener: (data: Uint8Array) => void) => () => void;
	subscribeExit: (listener: () => void) => () => void;
}

export function createWorkspaceRunCompletionWatch({
	marker,
	onComplete,
	onDispose,
	subscribeData,
	subscribeExit,
}: WorkspaceRunCompletionWatchOptions): () => void {
	const scanner = createWorkspaceRunCompletionScanner(marker);
	let disposed = false;
	let unsubscribeData: (() => void) | null = null;
	let unsubscribeExit: (() => void) | null = null;
	const dispose = () => {
		if (disposed) return;
		disposed = true;
		unsubscribeData?.();
		unsubscribeExit?.();
		onDispose?.();
	};
	unsubscribeData = subscribeData((data) => {
		const exitCode = scanner.push(data);
		if (exitCode === null) return;
		dispose();
		onComplete(exitCode);
	});
	if (disposed) unsubscribeData();
	unsubscribeExit = subscribeExit(dispose);
	if (disposed) unsubscribeExit();
	return dispose;
}

export function watchWorkspaceRunCompletion({
	terminalId,
	instanceId = terminalId,
	marker,
	onComplete,
}: {
	terminalId: string;
	instanceId?: string;
	marker: string;
	onComplete: (exitCode: number) => void;
}): void {
	const key = `${terminalId}\u0000${instanceId}\u0000${marker}`;
	if (activeWatches.has(key)) return;

	// Reserve the key before subscribing because onExit replays an existing
	// terminal exit synchronously.
	activeWatches.set(key, () => {});
	const disposeWatch = createWorkspaceRunCompletionWatch({
		marker,
		onComplete,
		onDispose: () => activeWatches.delete(key),
		subscribeData: (listener) =>
			terminalRuntimeRegistry.onData(terminalId, listener, instanceId),
		subscribeExit: (listener) =>
			terminalRuntimeRegistry.onExit(terminalId, listener, instanceId),
	});
	if (activeWatches.has(key)) {
		activeWatches.set(key, disposeWatch);
	}
}
