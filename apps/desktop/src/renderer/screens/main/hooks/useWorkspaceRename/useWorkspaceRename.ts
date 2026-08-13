import { useEffect, useRef, useState } from "react";
import { useWorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalCollections } from "renderer/routes/_local/providers/LocalProductStateProvider";

export function useWorkspaceRename(
	workspaceId: string,
	workspaceName: string,
	branch: string,
) {
	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(workspaceName);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const collections = useLocalCollections();
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
		if (!collections.workspaceLocalState.get(workspaceId)) return;
		collections.workspaceLocalState.update(workspaceId, (draft) => {
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
