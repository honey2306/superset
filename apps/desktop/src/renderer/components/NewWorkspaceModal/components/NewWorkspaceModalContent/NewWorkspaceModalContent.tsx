import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useNewWorkspaceModalDraft } from "../../NewWorkspaceModalDraftContext";
import { PromptGroup } from "../PromptGroup";

interface NewWorkspaceModalContentProps {
	isOpen: boolean;
	preSelectedProjectId: string | null;
	onImportRepo: () => Promise<void>;
	onNewProject: () => void;
}

/** Content pane for the New Workspace modal — handles project selection, branch search, and workspace creation. */
export function NewWorkspaceModalContent({
	isOpen,
	preSelectedProjectId,
	onImportRepo,
	onNewProject,
}: NewWorkspaceModalContentProps) {
	const { draft, updateDraft } = useNewWorkspaceModalDraft();
	const { projects: hostProjects, isReady: areRecentProjectsFetched } =
		useHostProjects();
	const queryClient = useQueryClient();
	const recentProjects = hostProjects.map((project) => ({
		id: project.projectKey,
		name: project.name,
		color: "hsl(var(--primary))",
		githubOwner: project.repoOwner,
		iconUrl: null,
		hideImage: false,
		mainRepoPath: project.repoPath ?? "",
		workspaceBaseBranch: null,
	}));

	// Refetch branches (and other data) when the modal opens to avoid stale data
	useEffect(() => {
		if (!isOpen) return;
		void queryClient.invalidateQueries({
			queryKey: ["host-service", "workspaceCreation", "searchBranches"],
		});
	}, [isOpen, queryClient]);

	const appliedPreSelectionRef = useRef<string | null>(null);

	useEffect(() => {
		if (!isOpen) {
			appliedPreSelectionRef.current = null;
		}
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen) return;

		if (
			preSelectedProjectId &&
			preSelectedProjectId !== appliedPreSelectionRef.current
		) {
			if (!areRecentProjectsFetched) return;
			const hasPreSelectedProject = recentProjects.some(
				(project) => project.id === preSelectedProjectId,
			);
			if (hasPreSelectedProject) {
				appliedPreSelectionRef.current = preSelectedProjectId;
				if (preSelectedProjectId !== draft.selectedProjectId) {
					updateDraft({ selectedProjectId: preSelectedProjectId });
				}
				return;
			}
		}

		if (!areRecentProjectsFetched) return;

		const hasSelectedProject = recentProjects.some(
			(project) => project.id === draft.selectedProjectId,
		);
		if (!hasSelectedProject) {
			updateDraft({ selectedProjectId: recentProjects[0]?.id ?? null });
		}
	}, [
		draft.selectedProjectId,
		areRecentProjectsFetched,
		isOpen,
		preSelectedProjectId,
		recentProjects,
		updateDraft,
	]);

	const selectedProject = recentProjects.find(
		(project) => project.id === draft.selectedProjectId,
	);

	return (
		<div className="flex-1 overflow-y-auto">
			<PromptGroup
				projectId={draft.selectedProjectId}
				selectedProject={selectedProject}
				recentProjects={recentProjects.filter((project) => Boolean(project.id))}
				onSelectProject={(selectedProjectId) =>
					updateDraft({ selectedProjectId })
				}
				onImportRepo={onImportRepo}
				onNewProject={onNewProject}
			/>
		</div>
	);
}
