import type { WorkspaceState } from "@superset/panes";
import type { PaneViewerData } from "renderer/lib/panes/pane-viewer-data";
import {
	isNotificationTargetVisible,
	type NotificationTarget,
} from "./resolveNotificationTarget";

export function shouldSuppressNotification({
	target,
	paneLayout,
	currentWorkspaceId,
	documentHidden,
	windowFocused,
}: {
	target: NotificationTarget;
	paneLayout: WorkspaceState<PaneViewerData> | null | undefined;
	currentWorkspaceId: string | null;
	documentHidden: boolean;
	windowFocused: boolean;
}): boolean {
	if (documentHidden || !windowFocused) return false;
	return isNotificationTargetVisible({
		currentWorkspaceId,
		paneLayout,
		target,
	});
}
