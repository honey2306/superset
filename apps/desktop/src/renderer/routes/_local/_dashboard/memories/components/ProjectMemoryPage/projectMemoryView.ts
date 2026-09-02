import type { ProjectMemoryFilter } from "./components/ProjectMemoryToolbar";
import type { ProjectMemoryRecord } from "./types";

export function filterProjectMemories(
	memories: readonly ProjectMemoryRecord[],
	query: string,
	filter: ProjectMemoryFilter,
): ProjectMemoryRecord[] {
	const normalized = query.trim().toLocaleLowerCase();
	return memories
		.filter((memory) => {
			if (normalized) {
				const haystack =
					`${memory.title} ${memory.content} ${memory.category}`.toLocaleLowerCase();
				if (!haystack.includes(normalized)) return false;
			}
			switch (filter) {
				case "all":
					return memory.enabled;
				case "pinned":
					return memory.enabled && memory.pinned;
				case "disabled":
					return !memory.enabled;
				default:
					return memory.enabled && memory.category === filter;
			}
		})
		.sort((left, right) => {
			if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
			return right.updatedAt - left.updatedAt;
		});
}
