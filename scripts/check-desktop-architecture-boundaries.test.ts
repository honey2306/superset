import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	analyzeSource,
	scanArchitectureBoundaries,
} from "./check-desktop-architecture-boundaries";

const fixtures = path.join(
	import.meta.dir,
	"fixtures/desktop-architecture-boundaries",
);
const rendererFixturePath = path.join(
	import.meta.dir,
	"../apps/desktop/src/renderer/architecture-fixture.ts",
);

describe("desktop architecture boundary scanner", () => {
	test("reports forbidden imports and aliased Drizzle writes", async () => {
		const source = await readFile(path.join(fixtures, "violations.ts"), "utf8");
		const violations = analyzeSource(rendererFixturePath, source);
		const rules = violations.map(({ rule }) => rule);

		expect(rules).toContain("renderer-no-legacy-tabs-store");
		expect(rules).toContain("renderer-no-react-mosaic");
		expect(rules).toContain("renderer-no-legacy-terminal-bridge");
		expect(rules).toContain("panes-workspace-no-cross-feature-deep-import");
		expect(
			rules.filter((rule) => rule === "catalog-owns-project-workspace-writes"),
		).toHaveLength(2);
	});

	test("accepts public PanesWorkspace imports and read-only schema usage", async () => {
		const source = await readFile(path.join(fixtures, "clean.ts"), "utf8");
		expect(analyzeSource(rendererFixturePath, source)).toEqual([]);
	});

	test("allows catalog-owned writes and identity backfill", () => {
		const source = `
			import { projects, workspaces as workspaceRows } from "../db/schema";
			tx.insert(projects);
			tx.update(workspaceRows);
		`;
		expect(
			analyzeSource(
				"/repo/packages/host-service/src/workspace-catalog/workspace-catalog.ts",
				source,
			),
		).toEqual([]);
		expect(
			analyzeSource(
				"/repo/packages/host-service/src/workspace-catalog/identity-backfill.ts",
				source,
			),
		).toEqual([]);
	});

	test("excludes fixture and test files from filesystem scans", async () => {
		expect(
			await scanArchitectureBoundaries({
				root: import.meta.dir,
				files: [
					"fixtures/desktop-architecture-boundaries/violations.ts",
					"check-desktop-architecture-boundaries.test.ts",
				],
			}),
		).toEqual([]);
	});

	test("skips deleted tracked files from a stale Git index", async () => {
		const root = await mkdtemp(path.join(tmpdir(), "architecture-scan-"));
		try {
			const init = Bun.spawn(["git", "init", "--quiet", root], {
				stderr: "pipe",
			});
			expect(await init.exited).toBe(0);

			const trackedFile = path.join(root, "deleted.ts");
			await writeFile(trackedFile, 'import "react-mosaic-component";');
			const add = Bun.spawn(["git", "-C", root, "add", "deleted.ts"], {
				stderr: "pipe",
			});
			expect(await add.exited).toBe(0);
			await rm(trackedFile);

			expect(await scanArchitectureBoundaries({ root })).toEqual([]);
			await expect(
				scanArchitectureBoundaries({ root, files: ["deleted.ts"] }),
			).rejects.toMatchObject({ code: "ENOENT" });
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});
