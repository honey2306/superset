import {
	PromptInputProvider,
	usePromptInputController,
} from "@superset/ui/ai-elements/prompt-input";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { toast } from "@superset/ui/sonner";
import { useEffect, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useFolderFirstImport } from "renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/hooks/useFolderFirstImport";
import { useOpenNewProjectModal } from "renderer/stores/add-repository-modal";
import {
	useCloseNewWorkspaceModal,
	useNewWorkspaceModalOpen,
	usePreSelectedProjectId,
} from "renderer/stores/new-workspace-modal";
import { NewWorkspaceModalContent } from "./components/NewWorkspaceModalContent";
import {
	NewWorkspaceModalDraftProvider,
	useNewWorkspaceModalDraft,
} from "./NewWorkspaceModalDraftContext";

/** Clears the PromptInputProvider text & attachments when the draft resets. */
function PromptInputResetSync() {
	const { resetKey } = useNewWorkspaceModalDraft();
	const { textInput, attachments } = usePromptInputController();
	const prevResetKeyRef = useRef(resetKey);

	useEffect(() => {
		if (resetKey !== prevResetKeyRef.current) {
			prevResetKeyRef.current = resetKey;
			textInput.clear();
			attachments.clear();
		}
	}, [resetKey, textInput.clear, attachments.clear]);

	return null;
}

export function NewWorkspaceModal() {
	const { t } = useTranslation();
	const isOpen = useNewWorkspaceModalOpen();
	const closeModal = useCloseNewWorkspaceModal();
	const folderImport = useFolderFirstImport({
		onError: (message) =>
			toast.error(t("workspace.openFailed"), { description: message }),
	});
	const openNewProject = useOpenNewProjectModal();
	const preSelectedProjectId = usePreSelectedProjectId();

	// Prevents AgentSelect from flashing "No agent" while presets load after refresh.
	electronTrpc.settings.getAgentPresets.useQuery();

	const handleImportRepo = async () => {
		closeModal();
		const result = await folderImport.start();
		if (result) toast.success(t("project.created"));
	};

	const handleNewProject = () => {
		closeModal();
		openNewProject();
	};

	return (
		<NewWorkspaceModalDraftProvider onClose={closeModal}>
			<PromptInputProvider>
				<PromptInputResetSync />
				<Dialog
					modal
					open={isOpen}
					onOpenChange={(open) => !open && closeModal()}
				>
					<DialogHeader className="sr-only">
						<DialogTitle>{t("workspace.new")}</DialogTitle>
						<DialogDescription>
							{t("workspace.newDescription")}
						</DialogDescription>
					</DialogHeader>
					<DialogContent
						showCloseButton={false}
						onFocusOutside={(e) => e.preventDefault()}
						className="bg-popover text-popover-foreground sm:max-w-[560px] max-h-[min(70vh,600px)] !top-[calc(50%-min(35vh,300px))] !-translate-y-0 flex flex-col overflow-hidden p-0"
					>
						<NewWorkspaceModalContent
							isOpen={isOpen}
							preSelectedProjectId={preSelectedProjectId}
							onImportRepo={handleImportRepo}
							onNewProject={handleNewProject}
						/>
					</DialogContent>
				</Dialog>
			</PromptInputProvider>
		</NewWorkspaceModalDraftProvider>
	);
}
