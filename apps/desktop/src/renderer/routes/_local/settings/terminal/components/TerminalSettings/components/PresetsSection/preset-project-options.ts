import { normalizePresetProjectIds } from "shared/preset-project-targeting";

export interface PresetProjectOption {
	id: string;
	name: string;
	color: string;
	mainRepoPath: string;
}

export function resolveSelectedPresetProjects(
	projectIds: readonly string[] | null | undefined,
	projectOptionsById: ReadonlyMap<string, PresetProjectOption>,
): PresetProjectOption[] {
	const normalizedProjectIds = normalizePresetProjectIds(projectIds);
	if (normalizedProjectIds === null) {
		return [];
	}

	return normalizedProjectIds.flatMap((projectId) => {
		const project = projectOptionsById.get(projectId);
		return project ? [project] : [];
	});
}

export interface PresetProjectTargetLabels {
	allProjects: string;
	unknownProject: string;
	projectCount: (count: number) => string;
}

const DEFAULT_TARGET_LABELS: PresetProjectTargetLabels = {
	allProjects: "All projects",
	unknownProject: "Unknown project",
	projectCount: (count) => `${count} projects`,
};

export function getPresetProjectTargetLabel(
	projectIds: readonly string[] | null | undefined,
	projectOptionsById: ReadonlyMap<string, PresetProjectOption>,
	labels: PresetProjectTargetLabels = DEFAULT_TARGET_LABELS,
): string {
	const normalizedProjectIds = normalizePresetProjectIds(projectIds);
	if (normalizedProjectIds === null) {
		return labels.allProjects;
	}

	const selectedProjects = resolveSelectedPresetProjects(
		normalizedProjectIds,
		projectOptionsById,
	);
	if (normalizedProjectIds.length === 1) {
		return selectedProjects[0]?.name ?? labels.unknownProject;
	}

	return labels.projectCount(normalizedProjectIds.length);
}
