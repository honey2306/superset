import type { WorkspaceState } from "@superset/panes";
import type {
	AgentLifecyclePayload,
	TerminalLifecyclePayload,
} from "@superset/workspace-client";
import type { PaneViewerData } from "renderer/lib/panes/pane-viewer-data";
import { playRingtone } from "renderer/lib/ringtones/play";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useNotificationStore } from "renderer/stores/notifications";
import { useRingtoneStore } from "renderer/stores/ringtone";
import { getNativeNotificationContent } from "./notificationContent";
import {
	isNotificationTargetVisible,
	type NotificationTarget,
	resolveNotificationTarget,
} from "./resolveNotificationTarget";

/**
 * Marks visible targets as seen (terminal statuses are derived from host
 * agent bindings, so an event landing while the user watches must not turn
 * into `review`) and plays the completion chime client-side, so the playback
 * path works when host-service runs off-machine. The chime is suppressed
 * when the target pane is visible and the window is focused.
 */
export function handleAgentLifecycleEvent({
	workspaceId,
	workspaceName,
	payload,
	paneLayout,
	volume,
	muted,
}: {
	workspaceId: string;
	workspaceName: string;
	payload: AgentLifecyclePayload;
	paneLayout: WorkspaceState<PaneViewerData> | null | undefined;
	volume: number;
	muted: boolean;
}): void {
	const target = resolveNotificationTarget({
		workspaceId,
		payload,
		paneLayout,
	});
	markSeenIfTargetVisible({ payload, paneLayout, target });

	// Only Stop and PermissionRequest deserve sound. Start fires per-prompt
	// (the working spinner is feedback enough); Attached/Detached fire on
	// agent boot and clean exit, neither of which is a "your agent finished"
	// moment.
	if (
		payload.eventType === "Start" ||
		payload.eventType === "Attached" ||
		payload.eventType === "Detached"
	) {
		return;
	}
	if (shouldSuppress(target, paneLayout)) return;

	const ringtoneId = useRingtoneStore.getState().selectedRingtoneId;
	void playRingtone({ ringtoneId, volume, muted });

	showNativeNotification({
		payload,
		workspaceId,
		workspaceName,
		target,
	});
}

/**
 * Seen-marking half of `handleAgentLifecycleEvent`, for event paths that
 * must not chime (e.g. the Electron fallback for adopted shells).
 */
export function markAgentLifecycleTargetSeen({
	workspaceId,
	payload,
	paneLayout,
}: {
	workspaceId: string;
	payload: AgentLifecyclePayload;
	paneLayout: WorkspaceState<PaneViewerData> | null | undefined;
}): void {
	const target = resolveNotificationTarget({
		workspaceId,
		payload,
		paneLayout,
	});
	markSeenIfTargetVisible({ payload, paneLayout, target });
}

export function handleTerminalLifecycleEvent({
	payload,
}: {
	payload: TerminalLifecyclePayload;
}): void {
	if (payload.eventType !== "exit") return;
	useNotificationStore.getState().pruneTerminalSeen(payload.terminalId);
}

function markSeenIfTargetVisible({
	payload,
	paneLayout,
	target,
}: {
	payload: AgentLifecyclePayload;
	paneLayout: WorkspaceState<PaneViewerData> | null | undefined;
	target: NotificationTarget;
}): void {
	const targetVisible = isNotificationTargetVisible({
		currentWorkspaceId: getCurrentWorkspaceId(),
		paneLayout,
		target,
	});
	if (!targetVisible) return;
	useNotificationStore
		.getState()
		.markTerminalSeen(payload.terminalId, payload.occurredAt);
}

function getCurrentWorkspaceId(): string | null {
	try {
		// Matches both `/workspace/<id>` and `/v2-workspace/<id>` route shapes.
		const match = window.location.hash.match(/\/(?:v2-)?workspace\/([^/?#]+)/);
		return match ? decodeURIComponent(match[1] ?? "") : null;
	} catch {
		return null;
	}
}

function shouldSuppress(
	target: NotificationTarget,
	paneLayout: WorkspaceState<PaneViewerData> | null | undefined,
): boolean {
	if (typeof document !== "undefined" && document.hidden) return false;
	if (typeof window !== "undefined" && !document.hasFocus()) return false;

	return isNotificationTargetVisible({
		currentWorkspaceId: getCurrentWorkspaceId(),
		paneLayout,
		target,
	});
}

function showNativeNotification({
	payload,
	workspaceId,
	workspaceName,
	target,
}: {
	payload: AgentLifecyclePayload;
	workspaceId: string;
	workspaceName: string;
	target: NotificationTarget;
}): void {
	const { title, body } = getNativeNotificationContent({
		workspaceName,
		payload,
	});

	void electronTrpcClient.notifications.showNative
		.mutate({
			title,
			body,
			silent: true,
			clickTarget: {
				workspaceId,
				source: { type: "terminal", id: target.terminalId },
			},
		})
		.catch((error) => {
			console.warn(
				"[notifications] failed to show native notification:",
				error,
			);
		});
}
