import { describe, expect, it } from "bun:test";

const FILES_SURFACE_SOURCES = [
	"FilesView.tsx",
	"hooks/useFileSearch/useFileSearch.ts",
	"hooks/useFileTreeActions.ts",
	"../../hooks/useWorkspaceFileEvents/useWorkspaceFileEvents.ts",
];

describe("FilesView workspace authority", () => {
	it("routes filesystem IO and watches through the workspace host", async () => {
		const sources = await Promise.all(
			FILES_SURFACE_SOURCES.map((relativePath) =>
				Bun.file(new URL(relativePath, import.meta.url)).text(),
			),
		);
		const combinedSource = sources.join("\n");

		expect(combinedSource).not.toContain("electronTrpc.filesystem");
		expect(combinedSource).toContain("getHostServiceClientByUrl");
		expect(combinedSource).toMatch(/useWorkspaceEvent\(\s*"fs:events"/);
	});
});
