import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function sources(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory()
			? sources(path)
			: /\.tsx?$/.test(path) && !path.endsWith(".test.ts")
				? [path]
				: [];
	});
}
const root = resolve(import.meta.dir, "../../../..");
test("application operations never depend on a transport router", () => {
	const violations = sources(
		join(root, "packages/host-service/src/application"),
	).filter((path) =>
		/(?:from\s*|import\s*\()["'][^"']*(?:trpc|@trpc\/server)/.test(
			readFileSync(path, "utf8"),
		),
	);
	expect(violations).toEqual([]);
});
test("portable clients and contracts cannot import Host implementation", () => {
	const directories = [
		"packages/host-contract/src",
		"packages/host-client/src",
		"packages/workspace-client/src",
		"packages/cli/src",
		"apps/web/src",
		"apps/desktop/src/renderer",
	];
	const violations = directories
		.flatMap((directory) => sources(join(root, directory)))
		.filter((path) =>
			/(?:from\s*|import\s*\()["'][^"']*(?:@superset\/host-service|host-service\/src)/.test(
				readFileSync(path, "utf8"),
			),
		);
	expect(violations).toEqual([]);
});
