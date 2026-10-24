import { beforeEach, describe, expect, test } from "bun:test";
import { I18nProvider } from "renderer/providers/I18nProvider";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import { ensureHappyDom } from "test-utils/happy-dom-env";

let renderHook: typeof import("@testing-library/react/pure").renderHook;
let useOrderedSections: typeof import("./useOrderedSections").useOrderedSections;

const emptyFile = (): ChangedFile => ({
	path: "src/example.ts",
	status: "modified",
	additions: 0,
	deletions: 0,
});

const emptyArgs = {
	sectionOrder: [
		"against-base",
		"committed",
		"staged",
		"unstaged",
	] satisfies ChangeCategory[],
	expandedSections: {
		"against-base": true,
		committed: true,
		staged: true,
		unstaged: true,
	},
	toggleSection: () => {},
	fileListViewMode: "tree" as const,
	selectedFile: null,
	selectedCommitHash: null,
	worktreePath: "/tmp/repo",
	projectId: undefined,
	isExpandedView: false,
	stagedFiles: [] as ChangedFile[],
	onStagedFileSelect: () => {},
	onUnstageFile: () => {},
	onUnstageFiles: () => {},
	onShowDiscardStagedDialog: () => {},
	onUnstageAll: () => {},
	isDiscardAllStagedPending: false,
	isUnstageAllPending: false,
	isStagedActioning: false,
	unstagedFiles: [] as ChangedFile[],
	onUnstagedFileSelect: () => {},
	onStageFile: () => {},
	onStageFiles: () => {},
	onDiscardFiles: () => {},
	onShowDiscardUnstagedDialog: () => {},
	onStageAll: () => {},
	isDiscardAllUnstagedPending: false,
	isStageAllPending: false,
	isUnstagedActioning: false,
};

beforeEach(async () => {
	await ensureHappyDom();
	({ renderHook } = await import("@testing-library/react/pure"));
	({ useOrderedSections } = await import("./useOrderedSections"));
});

describe("useOrderedSections", () => {
	test("only returns current working tree sections", () => {
		const { result } = renderHook(() => useOrderedSections(emptyArgs), {
			wrapper: I18nProvider,
		});

		expect(result.current.map((section) => section.id)).toEqual([
			"staged",
			"unstaged",
		]);
	});

	test("keeps staged and unstaged counts", () => {
		const { result } = renderHook(
			() =>
				useOrderedSections({
					...emptyArgs,
					stagedFiles: [emptyFile(), emptyFile()],
					unstagedFiles: [emptyFile(), emptyFile(), emptyFile()],
				}),
			{ wrapper: I18nProvider },
		);

		expect(
			result.current.find((section) => section.id === "staged")?.count,
		).toBe(2);
		expect(
			result.current.find((section) => section.id === "unstaged")?.count,
		).toBe(3);
	});
});
