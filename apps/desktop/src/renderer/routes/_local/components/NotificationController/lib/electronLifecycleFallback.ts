import type { WorkspaceState } from "@superset/panes";
import type { PaneViewerData } from "renderer/lib/panes/pane-viewer-data";
import type { AgentLifecycleEvent } from "shared/notification-types";

interface HostNotificationClient {
	notifications: {
		hook: {
			mutate(input: {
				terminalId: string;
				eventType: "Start" | "Stop" | "PermissionRequest";
				eventId: string;
				occurredAt: number;
				capabilityToken: string;
			}): Promise<unknown>;
		};
	};
}

/**
 * Adapts the Electron HTTP fallback into the authoritative host lifecycle
 * stream. It preserves the primary request identity and terminal capability,
 * so a primary response loss cannot produce a second state/native event.
 */
export function forwardElectronLifecycleFallback({
	event,
	paneLayout,
	client,
}: {
	event: AgentLifecycleEvent;
	paneLayout: WorkspaceState<PaneViewerData> | null;
	client: HostNotificationClient;
}): Promise<unknown> | null {
	if (
		!event.workspaceId ||
		!event.terminalId ||
		!event.eventId ||
		!event.occurredAt ||
		!event.capabilityToken
	) {
		return null;
	}
	const eventType =
		event.eventType === "PendingQuestion"
			? "PermissionRequest"
			: event.eventType;

	// Callers still resolve a persisted layout before forwarding. EventBus owns
	// all state/native side effects, including focus suppression for that layout.
	void paneLayout;
	return client.notifications.hook.mutate({
		terminalId: event.terminalId,
		eventType,
		eventId: event.eventId,
		occurredAt: event.occurredAt,
		capabilityToken: event.capabilityToken,
	});
}
