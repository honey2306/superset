import { describe, expect, it } from "bun:test";
import { asyncDataLoaderFeature, createTree } from "@headless-tree/core";
import type { DirectoryEntry } from "shared/file-tree-types";
import { createFileTreeDataLoader } from "./fileTreeDataLoader";

describe("file tree data loader", () => {
	it("keeps a listed directory classified as a directory during item-load races", async () => {
		const worktreePath = "/workspace";
		const directoryPath = `${worktreePath}/designs`;
		const entryCache = new Map<string, DirectoryEntry>();
		const dataLoader = createFileTreeDataLoader({
			getWorktreePath: () => worktreePath,
			entryCache,
			listDirectory: async () => ({
				entries: [
					{
						absolutePath: directoryPath,
						name: "designs",
						kind: "directory" as const,
					},
				],
			}),
		});
		const tree = createTree<DirectoryEntry>({
			rootItemId: "root",
			getItemName: (item) => item.getItemData()?.name ?? "",
			isItemFolder: (item) => item.getItemData()?.isDirectory ?? false,
			dataLoader,
			features: [asyncDataLoaderFeature],
		});
		tree.setMounted(true);
		tree.rebuildTree();

		await Promise.all([
			tree.loadItemData(directoryPath),
			tree.loadChildrenIds("root"),
		]);

		expect(tree.getItemInstance(directoryPath).getItemData()).toEqual({
			id: directoryPath,
			name: "designs",
			path: directoryPath,
			relativePath: "designs",
			isDirectory: true,
		});
		expect(tree.getItemInstance(directoryPath).isFolder()).toBe(true);
	});
});
