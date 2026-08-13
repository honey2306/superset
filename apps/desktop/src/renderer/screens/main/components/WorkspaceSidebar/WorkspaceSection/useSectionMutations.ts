import { toast } from "@superset/ui/sonner";
import { useDashboardSidebarState } from "renderer/routes/_local/hooks/useDashboardSidebarState";
import { PROJECT_COLOR_DEFAULT } from "shared/constants/project-colors";

export function useSectionMutations(sectionId: string) {
	const {
		deleteSection,
		renameSection,
		setSectionColor,
		toggleSectionCollapsed,
	} = useDashboardSidebarState();

	return {
		toggle: () => {
			try {
				toggleSectionCollapsed(sectionId);
			} catch (error) {
				toast.error(
					`Failed to toggle section: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		},
		rename: (name: string) => {
			try {
				renameSection(sectionId, name);
			} catch (error) {
				toast.error(
					`Failed to rename section: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		},
		remove: () => {
			try {
				deleteSection(sectionId);
			} catch (error) {
				toast.error(
					`Failed to delete section: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		},
		setColor: (color: string) => {
			try {
				setSectionColor(
					sectionId,
					color === PROJECT_COLOR_DEFAULT ? null : color,
				);
			} catch (error) {
				toast.error(
					`Failed to set color: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		},
		isDeleting: false,
	};
}
