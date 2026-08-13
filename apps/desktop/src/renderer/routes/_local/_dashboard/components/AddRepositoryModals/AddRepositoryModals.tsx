import { toast } from "@superset/ui/sonner";
import { useTranslation } from "renderer/providers/I18nProvider";
import { TemplateGalleryModal } from "renderer/routes/_local/components/TemplateGalleryModal";
import {
	useAddRepositoryModalActive,
	useCloseAddRepositoryModal,
	useResolveNewProjectModal,
} from "renderer/stores/add-repository-modal";
import { NewProjectModal } from "./components/NewProjectModal";

export function AddRepositoryModals() {
	const { t } = useTranslation();
	const active = useAddRepositoryModalActive();
	const close = useCloseAddRepositoryModal();
	const resolveNewProject = useResolveNewProjectModal();

	return (
		<>
			<NewProjectModal
				open={active.kind === "new-project"}
				onOpenChange={(open) => {
					if (!open) close();
				}}
				onSuccess={(result) => {
					toast.success(t("project.created"));
					resolveNewProject({ projectId: result.projectId });
				}}
				onError={(message) =>
					toast.error(t("project.createFailedWithMessage", { message }))
				}
			/>
			<TemplateGalleryModal
				open={active.kind === "template-gallery"}
				onOpenChange={(open) => {
					if (!open) close();
				}}
				onCreated={(result) => {
					toast.success(t("project.created"));
					resolveNewProject({ projectId: result.projectId });
				}}
				onError={(message) =>
					toast.error(t("project.createFailedWithMessage", { message }))
				}
			/>
		</>
	);
}
