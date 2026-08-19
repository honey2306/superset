import {
	afterEach,
	beforeEach,
	describe,
	expect,
	type mock as MockType,
	mock,
	test,
} from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shell } from "electron";
import { createExternalRouter } from "./index";

const openPath = shell.openPath as ReturnType<typeof MockType>;
const showItemInFolder = mock((_filePath: string) => {});
Object.assign(shell, { showItemInFolder });
const caller = createExternalRouter().createCaller({});
let testRoot = "";

beforeEach(() => {
	testRoot = mkdtempSync(join(tmpdir(), "superset-external-"));
});

afterEach(() => {
	openPath.mockClear();
	openPath.mockImplementation(() => Promise.resolve(""));
	showItemInFolder.mockClear();
	rmSync(testRoot, { force: true, recursive: true });
	testRoot = "";
});

describe("external.openInApp", () => {
	test("waits for Finder to finish opening the path", async () => {
		const directoryPath = join(testRoot, "project");
		mkdirSync(directoryPath);

		let resolveOpenPath: ((error: string) => void) | undefined;
		const openPathPromise = new Promise<string>((resolve) => {
			resolveOpenPath = resolve;
		});
		openPath.mockImplementation(() => openPathPromise);

		let settled = false;
		const openRequest = caller
			.openInApp({ path: directoryPath, app: "finder" })
			.then(() => {
				settled = true;
			});

		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(settled).toBe(false);
		expect(openPath).toHaveBeenCalledWith(directoryPath);
		expect(showItemInFolder).not.toHaveBeenCalled();

		resolveOpenPath?.("");
		await openRequest;
		expect(settled).toBe(true);
	});

	test("surfaces Finder errors returned by Electron", async () => {
		const directoryPath = join(testRoot, "project");
		mkdirSync(directoryPath);
		openPath.mockResolvedValue("The path could not be opened");

		await expect(
			caller.openInApp({ path: directoryPath, app: "finder" }),
		).rejects.toThrow("The path could not be opened");
	});

	test("reveals files in Finder instead of opening them", async () => {
		const filePath = join(testRoot, "config.json");
		writeFileSync(filePath, "{}");

		await caller.openInApp({ path: filePath, app: "finder" });

		expect(showItemInFolder).toHaveBeenCalledWith(filePath);
		expect(openPath).not.toHaveBeenCalled();
	});
});
