import { useEffect, useRef, useState } from "react";
import { useWorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

export function useWorkspaceRename(
	workspaceId: string,
	workspaceName: string,
	branch: string,
) {
	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(workspaceName);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const collections = useCollections();
	const hostTarget = useWorkspaceHostTarget(workspaceId);
	const hostUrl = hostTarget.status === "ready" ? hostTarget.url : null;

	const persistWorkspaceName = (name: string) => {
		if (!hostUrl) {
			console.warn("Workspace host is unavailable; rename was not persisted", {
				workspaceId,
				name,
			});
			return;
		}
		void getHostServiceClientByUrl(hostUrl).workspace.update.mutate({
			id: workspaceId,
			name,
		});
	};

	const updateLocalUnnamedState = (isUnnamed: boolean) => {
		if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
		collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
			draft.isUnnamed = isUnnamed;
		});
	};

	useEffect(() => {
		if (isRenaming && inputRef.current) {
			inputRef.current.select();
		}
	}, [isRenaming]);

	useEffect(() => {
		setRenameValue(workspaceName);
	}, [workspaceName]);

	const startRename = () => {
		setIsRenaming(true);
	};

	const submitRename = () => {
		const trimmedValue = renameValue.trim();
		const isCleared = !trimmedValue;

		if (isCleared) {
			updateLocalUnnamedState(true);
			persistWorkspaceName(branch);
			setRenameValue(branch);
		} else if (trimmedValue !== workspaceName) {
			updateLocalUnnamedState(false);
			persistWorkspaceName(trimmedValue);
		} else {
			setRenameValue(workspaceName);
		}
		setIsRenaming(false);
	};

	const cancelRename = () => {
		setRenameValue(workspaceName);
		setIsRenaming(false);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			submitRename();
		} else if (e.key === "Escape") {
			e.preventDefault();
			cancelRename();
		}
	};

	return {
		isRenaming,
		renameValue,
		inputRef,
		setRenameValue,
		startRename,
		submitRename,
		cancelRename,
		handleKeyDown,
	};
}
