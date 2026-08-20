import type { TreeDataLoader } from "@headless-tree/core";
import { toRelativeWorkspacePath } from "shared/absolute-paths";
import type { DirectoryEntry } from "shared/file-tree-types";

export interface ListedFileTreeEntry {
	absolutePath: string;
	name: string;
	kind: "file" | "directory" | "symlink" | "other";
}

interface FileTreeDataLoaderOptions {
	getWorktreePath: () => string | undefined;
	entryCache: Map<string, DirectoryEntry>;
	listDirectory: (
		absolutePath: string,
	) => Promise<{ entries: readonly ListedFileTreeEntry[] }>;
}

function getEntryRelativePath(rootPath: string, absolutePath: string): string {
	const relativePath = toRelativeWorkspacePath(rootPath, absolutePath);
	return relativePath === "." ? "" : relativePath;
}

export function createFileTreeDataLoader({
	getWorktreePath,
	entryCache,
	listDirectory,
}: FileTreeDataLoaderOptions): TreeDataLoader<DirectoryEntry> {
	return {
		getItem: async (itemId: string): Promise<DirectoryEntry> => {
			if (itemId === "root") {
				return {
					id: "root",
					name: "root",
					path: getWorktreePath() ?? "",
					relativePath: "",
					isDirectory: true,
				};
			}

			const cachedEntry = entryCache.get(itemId);
			if (cachedEntry) {
				return cachedEntry;
			}

			const currentPath = getWorktreePath();
			const name = itemId.split(/[/\\]/).pop() ?? itemId;
			const relativePath =
				currentPath && itemId.startsWith(currentPath)
					? itemId.slice(currentPath.length).replace(/^[/\\]/, "")
					: itemId;

			return {
				id: itemId,
				name,
				path: itemId,
				relativePath,
				isDirectory: false,
			};
		},
		getChildrenWithData: async (itemId: string) => {
			const currentPath = getWorktreePath();
			if (!currentPath) return [];

			const dirPath = itemId === "root" ? currentPath : itemId;
			if (!dirPath) return [];

			try {
				const { entries } = await listDirectory(dirPath);
				const nextEntries = entries.map((entry) => ({
					id: entry.absolutePath,
					name: entry.name,
					path: entry.absolutePath,
					relativePath: getEntryRelativePath(currentPath, entry.absolutePath),
					isDirectory: entry.kind === "directory",
				}));
				for (const entry of nextEntries) {
					entryCache.set(entry.path, entry);
				}
				return nextEntries.map((entry) => ({
					id: entry.id,
					data: entry,
				}));
			} catch (error) {
				console.error("[FilesView] Failed to load children:", error);
				return [];
			}
		},
	};
}
