import { expect, test } from "bun:test";

const localFeatureSources = [
	`${import.meta.dir}/automations`,
	`${import.meta.dir}/todos`,
];

test("automations and todos do not depend on cloud tRPC, Electric, or DB row types", async () => {
	for (const directory of localFeatureSources) {
		const files = [
			...(await Array.fromAsync(
				new Bun.Glob("**/*.ts").scan({ cwd: directory, onlyFiles: true }),
			)),
			...(await Array.fromAsync(
				new Bun.Glob("**/*.tsx").scan({ cwd: directory, onlyFiles: true }),
			)),
		];
		for (const file of files) {
			const source = await Bun.file(`${directory}/${file}`).text();
			expect(source).not.toContain("api-trpc-client");
			expect(source).not.toMatch(/Select(?:Automation|AutomationRun|Todo)/);
		}
	}
});
