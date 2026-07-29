import { FileIcon, LinkIcon, PlusIcon } from "lucide-react";
import { useQuickOpenStore } from "renderer/commandPalette/ui/QuickOpen/quickOpenStore";
import { useNewWorkspaceModalStore } from "renderer/stores/new-workspace-modal";
import type { Command, CommandProvider } from "../../core/types";
import { LinkTaskFrame } from "../../ui/LinkTask/LinkTaskFrame";

export const workspaceProvider: CommandProvider = {
	id: "workspace",
	provide: (context) => {
		if (!context.workspace) return [];
		const workspace = context.workspace;

		const commands: Command[] = [
			{
				id: "workspace.new",
				title: "New workspace",
				section: "workspace",
				icon: PlusIcon,
				hotkeyId: "NEW_WORKSPACE",
				run: () =>
					useNewWorkspaceModalStore.getState().openModal(workspace.projectId),
			},
			{
				id: "files.quickOpen",
				title: "Search files",
				section: "workspace",
				icon: FileIcon,
				keywords: ["file picker", "quick open"],
				hotkeyId: "QUICK_OPEN",
				run: () =>
					useQuickOpenStore.getState().openFor({
						workspaceId: workspace.id,
					}),
			},
			{
				id: "workspace.linkTask",
				title: "Link task",
				section: "workspace",
				icon: LinkIcon,
				keywords: ["issue", "linear"],
				renderFrame: () => <LinkTaskFrame workspaceId={workspace.id} />,
			},
		];

		return commands;
	},
};
