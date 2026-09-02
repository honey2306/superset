export const PROJECT_MEMORY_CATEGORIES = [
	"debugging",
	"architecture",
	"workflow",
	"environment",
	"preference",
	"other",
] as const;

export type ProjectMemoryCategory = (typeof PROJECT_MEMORY_CATEGORIES)[number];

export interface ProjectMemoryRecord {
	id: string;
	projectId: string;
	title: string;
	content: string;
	category: ProjectMemoryCategory;
	source: "manual" | "agent";
	sourceSessionId: string | null;
	pinned: boolean;
	enabled: boolean;
	createdAt: number;
	updatedAt: number;
	lastUsedAt: number | null;
}

export interface ProjectMemoryEditorValue {
	id: string | null;
	title: string;
	content: string;
	category: ProjectMemoryCategory;
	pinned: boolean;
}

export const EMPTY_PROJECT_MEMORY_EDITOR: ProjectMemoryEditorValue = {
	id: null,
	title: "",
	content: "",
	category: "other",
	pinned: false,
};
