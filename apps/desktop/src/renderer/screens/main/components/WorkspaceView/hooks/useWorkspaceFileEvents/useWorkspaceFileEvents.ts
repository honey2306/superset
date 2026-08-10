import type { FsWatchEvent } from "@superset/workspace-fs/client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import { toRelativeWorkspacePath } from "shared/absolute-paths";
import type { FileSystemChangeEvent } from "shared/file-tree-types";

type WorkspaceFileEventListener = (event: FileSystemChangeEvent) => void;

const listenersByWorkspace = new Map<string, Set<WorkspaceFileEventListener>>();
const countSubscribers = new Set<() => void>();

function emitListenerCountChange(): void {
	for (const subscriber of countSubscribers) {
		subscriber();
	}
}

function getListeners(workspaceId: string): Set<WorkspaceFileEventListener> {
	let listeners = listenersByWorkspace.get(workspaceId);
	if (!listeners) {
		listeners = new Set<WorkspaceFileEventListener>();
		listenersByWorkspace.set(workspaceId, listeners);
	}
	return listeners;
}

function getWorkspaceListenerCount(workspaceId: string): number {
	return listenersByWorkspace.get(workspaceId)?.size ?? 0;
}

function emitWorkspaceFileEvent(
	workspaceId: string,
	event: FileSystemChangeEvent,
): void {
	const listeners = listenersByWorkspace.get(workspaceId);
	if (!listeners || listeners.size === 0) {
		return;
	}

	for (const listener of listeners) {
		listener(event);
	}
}

export function useWorkspaceFileEvents(
	workspaceId: string,
	onEvent: WorkspaceFileEventListener,
	enabled = true,
): void {
	const onEventRef = useRef(onEvent);
	onEventRef.current = onEvent;

	useEffect(() => {
		if (!enabled || !workspaceId) {
			return;
		}

		const listeners = getListeners(workspaceId);
		const listener: WorkspaceFileEventListener = (event) => {
			onEventRef.current(event);
		};

		listeners.add(listener);
		emitListenerCountChange();

		return () => {
			const currentListeners = listenersByWorkspace.get(workspaceId);
			if (!currentListeners) {
				return;
			}

			currentListeners.delete(listener);
			if (currentListeners.size === 0) {
				listenersByWorkspace.delete(workspaceId);
			}
			emitListenerCountChange();
		};
	}, [enabled, workspaceId]);
}

function subscribeToListenerCounts(onStoreChange: () => void): () => void {
	countSubscribers.add(onStoreChange);
	return () => {
		countSubscribers.delete(onStoreChange);
	};
}

function toEventRelativePath(
	worktreePath: string,
	absolutePath: string,
): string {
	const relativePath = toRelativeWorkspacePath(worktreePath, absolutePath);
	return relativePath === "." ? "" : relativePath;
}

export function useWorkspaceFileEventBridge(
	workspaceId: string,
	worktreePath: string | undefined,
	enabled = true,
): void {
	const listenerCount = useSyncExternalStore(
		subscribeToListenerCounts,
		() => getWorkspaceListenerCount(workspaceId),
		() => 0,
	);

	useWorkspaceEvent(
		"fs:events",
		workspaceId,
		(event: FsWatchEvent) => {
			if (!worktreePath) {
				return;
			}

			const nextEvent: FileSystemChangeEvent = {
				type: event.kind,
				absolutePath: event.absolutePath,
				oldAbsolutePath: event.oldAbsolutePath,
				relativePath: toEventRelativePath(worktreePath, event.absolutePath),
				oldRelativePath: event.oldAbsolutePath
					? toEventRelativePath(worktreePath, event.oldAbsolutePath)
					: undefined,
				isDirectory: event.isDirectory,
				revision: 0,
			};
			emitWorkspaceFileEvent(workspaceId, nextEvent);
		},
		enabled && Boolean(workspaceId && worktreePath && listenerCount > 0),
	);
}
