import { describe, expect, it } from "bun:test";
import type { ChangedFile } from "shared/changes-types";
import { buildFileTree } from "./buildFileTree";

function changedFile(path: string): ChangedFile {
	return {
		path,
		status: "modified",
		additions: 1,
		deletions: 1,
	};
}

describe("buildFileTree", () => {
	it("compacts consecutive single-child folders", () => {
		const tree = buildFileTree([
			changedFile("apps/desktop/src/index.ts"),
			changedFile("apps/web/src/app.ts"),
		]);

		expect(tree).toHaveLength(1);
		expect(tree[0]?.name).toBe("apps");
		expect(tree[0]?.children?.map((node) => node.name)).toEqual([
			"desktop/src",
			"web/src",
		]);
		expect(tree[0]?.children?.[0]?.path).toBe("apps/desktop/src");
	});

	it("stops compaction at a branching folder and sorts folders before files", () => {
		const tree = buildFileTree([
			changedFile("src/styles.css"),
			changedFile("src/routes/session.tsx"),
			changedFile("src/components/Timeline/Message.tsx"),
		]);

		expect(tree[0]?.name).toBe("src");
		expect(tree[0]?.children?.map((node) => node.name)).toEqual([
			"components/Timeline",
			"routes",
			"styles.css",
		]);
	});
});
