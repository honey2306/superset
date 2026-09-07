import { useEffect, useMemo, useRef, useState } from "react";
import type { ContentBlock, RequestPermissionOutcome } from "../../acp";
import type {
	AcpSessionsApi,
	PromptAccepted,
	RespondToPermissionResult,
} from "../../api";
import type { StreamStatus, WebSocketLike } from "../../client";
import {
	AcpSessionController,
	clearAcpSessionControllerSnapshotCache,
} from "../../controller";
import type { SessionUpdateEnvelope } from "../../envelope";
import type { FoldedTimeline } from "../../fold";
import type { SessionScopedState } from "../../state";
import type { TranscriptTurnSummary } from "../../transcript";

export interface UseAcpSessionOptions {
	sessionId: string;
	connectionKey?: string;
	api: AcpSessionsApi;
	streamUrl: string | (() => string | Promise<string>);
	createWebSocket?: (url: string) => WebSocketLike;
	pageSize?: number;
	enabled?: boolean;
	initiallyLaunching?: boolean;
}

export interface AcpSessionActions {
	prompt(blocks: ContentBlock[]): Promise<PromptAccepted>;
	cancel(): Promise<void>;
	respondToPermission(
		requestId: string,
		outcome: RequestPermissionOutcome,
	): Promise<RespondToPermissionResult>;
	setMode(modeId: string): Promise<void>;
	setConfigOption(configId: string, value: string | boolean): Promise<void>;
	refresh(): Promise<void>;
	enqueue(blocks: ContentBlock[]): Promise<{ queueId: string }>;
	sendNow(blocks: ContentBlock[]): Promise<PromptAccepted>;
	steer(blocks: ContentBlock[]): Promise<PromptAccepted>;
	removeQueued(queueId: string): Promise<void>;
	reorderQueue(orderedIds: string[]): Promise<void>;
	editQueued(queueId: string, blocks: ContentBlock[]): Promise<void>;
	clearQueue(): Promise<void>;
}

export interface UseAcpSessionResult {
	state: SessionScopedState | null;
	timeline: FoldedTimeline;
	streamStatus: StreamStatus;
	isLoading: boolean;
	availability: "live" | "retrying" | "unavailable";
	error: Error | null;
	hasOlder: boolean;
	isLoadingOlder: boolean;
	historyError: Error | null;
	loadOlder(): Promise<void>;
	totalTurns: number;
	turnIndex: TranscriptTurnSummary[];
	loadedTurnNumbers: number[];
	loadTurn(turnNumber: number): Promise<void>;
	actions: AcpSessionActions;
}

export const INITIAL_LAUNCH_NOT_FOUND_RETRY_WINDOW_MS = 30_000;
export const ACP_SESSION_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1_000;

export function clearAcpSessionSnapshotCache(): void {
	clearAcpSessionControllerSnapshotCache();
}

function isNotFoundError(cause: unknown): boolean {
	if (!(cause instanceof Error)) return false;
	const message = cause.message.toLowerCase();
	return (
		message.includes("not found") || message.includes("unknown acp session")
	);
}

export function shouldRetryInitialLaunchNotFound({
	initiallyLaunching,
	cause,
	elapsedMs,
}: {
	initiallyLaunching: boolean;
	cause: unknown;
	elapsedMs: number;
}): boolean {
	return (
		initiallyLaunching &&
		isNotFoundError(cause) &&
		elapsedMs < INITIAL_LAUNCH_NOT_FOUND_RETRY_WINDOW_MS
	);
}

export type SessionVisibilityDocument = Pick<
	Document,
	"visibilityState" | "addEventListener" | "removeEventListener"
>;

export function observeSessionVisibility(
	documentLike: SessionVisibilityDocument | undefined,
	onResume: () => void,
): () => void {
	if (documentLike === undefined) return () => {};
	let wasHidden = documentLike.visibilityState === "hidden";
	const onVisibilityChange = () => {
		const isHidden = documentLike.visibilityState === "hidden";
		if (wasHidden && !isHidden) onResume();
		wasHidden = isHidden;
	};
	documentLike.addEventListener("visibilitychange", onVisibilityChange);
	return () =>
		documentLike.removeEventListener("visibilitychange", onVisibilityChange);
}

export function overlayAuthoritativeState(
	timeline: FoldedTimeline,
	state: SessionScopedState | null,
): FoldedTimeline {
	if (state === null) return timeline;
	return {
		...timeline,
		meta: {
			...timeline.meta,
			currentMode: state.currentMode,
			configOptions: state.configOptions,
			availableCommands: state.availableCommands,
		},
		state,
	};
}

export async function fetchCompleteMessageHistory(
	api: Pick<AcpSessionsApi, "getMessages">,
	sessionId: string,
	pageSize = 200,
): Promise<SessionUpdateEnvelope[]> {
	let cursor: string | undefined;
	const seenCursors = new Set<string>();
	let items: SessionUpdateEnvelope[] = [];
	do {
		const page = await api.getMessages({ sessionId, cursor, limit: pageSize });
		items = [...page.items, ...items];
		if (page.nextCursor === null) break;
		if (seenCursors.has(page.nextCursor)) {
			throw new Error(
				`getMessages returned a repeated cursor: ${page.nextCursor}`,
			);
		}
		seenCursors.add(page.nextCursor);
		cursor = page.nextCursor;
	} while (cursor !== undefined);
	return items;
}

/** Thin React external-store binding around the shared headless controller. */
export function useAcpSession(
	options: UseAcpSessionOptions,
): UseAcpSessionResult {
	// Transport changes retain the same controller and durable timeline. Session
	// changes create a distinct controller so the first render cannot leak the
	// previous session's state.
	const key = options.sessionId;
	const controllerRef = useRef<{
		key: string;
		controller: AcpSessionController;
	} | null>(null);
	if (controllerRef.current?.key !== key) {
		controllerRef.current?.controller.stop();
		controllerRef.current = {
			key,
			controller: new AcpSessionController(options),
		};
	} else {
		controllerRef.current.controller.setOptions(options);
	}
	const controller = controllerRef.current.controller;
	const [rendered, setRendered] = useState(() => ({
		key,
		snapshot: controller.getSnapshot(),
	}));
	const snapshot =
		rendered.key === key ? rendered.snapshot : controller.getSnapshot();

	useEffect(() => {
		setRendered({ key, snapshot: controller.getSnapshot() });
		const unsubscribe = controller.subscribe(() => {
			setRendered({ key, snapshot: controller.getSnapshot() });
		});
		if (options.enabled !== false) void controller.start();
		return () => {
			unsubscribe();
			controller.stop();
		};
	}, [controller, key, options.enabled]);

	useEffect(() => {
		if (options.enabled === false || typeof document === "undefined") return;
		return observeSessionVisibility(document, () => {
			void controller.refresh();
		});
	}, [controller, options.enabled]);

	return useMemo(
		() => ({
			...snapshot,
			loadOlder: () => controller.loadOlder(),
			loadTurn: (turnNumber: number) => controller.loadTurn(turnNumber),
			actions: controller.actions,
		}),
		[controller, snapshot],
	);
}
