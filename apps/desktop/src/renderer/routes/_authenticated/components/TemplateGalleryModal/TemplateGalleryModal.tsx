import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { showHostServiceUnavailableToast } from "renderer/lib/host-service-unavailable";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useFinalizeProjectSetup } from "renderer/react-query/projects";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	beginProjectProvisioning,
	createWorkspaceProvisioningAdapter,
} from "renderer/stores/workspace-launch";
import { TemplateCard } from "./components/TemplateCard";
import { PROJECT_TEMPLATES, type ProjectTemplate } from "./templates";

interface TemplateGalleryModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: (result: {
		projectId: string;
		mainWorkspaceId: string | null;
	}) => void;
	onError?: (message: string) => void;
}

function deriveProjectNameFromUrl(url: string): string {
	const trimmed = url
		.trim()
		.replace(/[?#].*$/, "")
		.replace(/[\\/]+$/, "")
		.replace(/\.git$/i, "");
	const segments = trimmed.split(/[/:\\]/).filter(Boolean);
	return segments[segments.length - 1] ?? "";
}

export function TemplateGalleryModal({
	open,
	onOpenChange,
	onCreated,
	onError,
}: TemplateGalleryModalProps) {
	const { t } = useTranslation();
	const hostService = useLocalHostService();
	const { activeHostUrl } = hostService;
	const finalizeSetup = useFinalizeProjectSetup();
	const { data: homeDir } = electronTrpc.window.getHomeDir.useQuery();
	const parentDir = homeDir ? `${homeDir}/.superset/projects` : null;
	const [cloningId, setCloningId] = useState<string | null>(null);

	const handleSelect = async (template: ProjectTemplate) => {
		if (!template.repo || cloningId) return;
		if (!parentDir) {
			const message = t("template.projectsDirectoryNotReady");
			if (onError) onError(message);
			else toast.error(t("project.couldNotCreate"), { description: message });
			return;
		}
		setCloningId(template.id);
		let createdProjectId: string | null = null;
		let mainWorkspaceId: string | null = null;
		try {
			if (!activeHostUrl) {
				showHostServiceUnavailableToast(hostService, t, {
					action: t("project.createProjectAction"),
				});
				return;
			}
			const result = await beginProjectProvisioning({
				hostUrl: activeHostUrl,
				adapter: createWorkspaceProvisioningAdapter(activeHostUrl),
				request: {
					idempotencyKey: `project-template:${template.repo}:${parentDir}`,
					project: {
						kind: "template",
						url: template.repo,
						parentDirectory: parentDir,
						name: deriveProjectNameFromUrl(template.repo),
					},
					source: { kind: "main" },
				},
			});
			finalizeSetup(activeHostUrl, result);
			createdProjectId = result.projectId;
			mainWorkspaceId = result.mainWorkspaceId;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (onError) onError(message);
			else toast.error(t("project.couldNotCreate"), { description: message });
		} finally {
			setCloningId(null);
		}
		if (createdProjectId)
			onCreated({ projectId: createdProjectId, mainWorkspaceId });
	};

	const handleOpenChange = (next: boolean) => {
		if (!next && cloningId) return;
		onOpenChange(next);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange} modal>
			<DialogContent
				className="sm:max-w-5xl"
				onOpenAutoFocus={(event) => event.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>{t("template.title")}</DialogTitle>
					<DialogDescription>{t("template.description")}</DialogDescription>
				</DialogHeader>
				<div className="grid grid-cols-3 gap-3">
					{PROJECT_TEMPLATES.map((template) => (
						<TemplateCard
							key={template.id}
							template={template}
							cloning={cloningId === template.id}
							disabled={cloningId !== null || !parentDir}
							onSelect={handleSelect}
						/>
					))}
				</div>
			</DialogContent>
		</Dialog>
	);
}
