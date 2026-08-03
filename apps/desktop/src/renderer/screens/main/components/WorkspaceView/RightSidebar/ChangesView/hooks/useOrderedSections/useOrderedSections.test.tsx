import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
	ChangeCategory,
	ChangedFile,
	CommitInfo,
} from "shared/changes-types";
import { ensureHappyDom } from "test-utils/happy-dom-env";

let renderHook: typeof import("@testing-library/react/pure").renderHook;
let useOrderedSections: typeof import("./useOrderedSections").useOrderedSections;

// `useOrderedSections` only pulls `t` from `useTranslation` (the tests assert on
// section counts, not translated labels), so stub the i18n hook and run the
// real React renderer via `renderHook`. We deliberately do NOT mock `react`
// globally here — that used to leak a fake `react` into the rest of the test
// process and break react-dnd's real context in V1PanesPresetBarItem.
mock.module("renderer/providers/I18nProvider", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

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
	effectiveBaseBranch: "main",
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
	againstBaseFiles: [] as ChangedFile[],
	onAgainstBaseFileSelect: () => {},
	commitsWithFiles: [] as CommitInfo[],
	totalCommitCount: 0,
	expandedCommits: new Set<string>(),
	onCommitToggle: () => {},
	onCommitFileSelect: () => {},
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
	test("keeps the commits section visible when commit files are lazy-loaded", () => {
		const { result } = renderHook(() =>
			useOrderedSections({
				...emptyArgs,
				commitsWithFiles: [
					{
						hash: "abc123",
						shortHash: "abc123",
						message: "feat: lazy commit files",
						author: "Test User",
						date: new Date("2026-03-06T12:00:00.000Z"),
						files: [],
					},
				],
				totalCommitCount: 1,
			}),
		);

		const sections = result.current;
		const committedSection = sections.find(
			(section) => section.id === "committed",
		);

		expect(committedSection).toBeDefined();
		expect(committedSection?.count).toBe(1);
	});

	test("shows the true commit total when the list is capped for display", () => {
		const commitsWithFiles = Array.from({ length: 500 }, (_, index) => ({
			hash: `hash-${index}`,
			shortHash: `h${index}`,
			message: `commit ${index}`,
			author: "Test User",
			date: new Date("2026-03-06T12:00:00.000Z"),
			files: [],
		}));

		const { result } = renderHook(() =>
			useOrderedSections({
				...emptyArgs,
				commitsWithFiles,
				totalCommitCount: 512,
			}),
		);

		expect(
			result.current.find((section) => section.id === "committed")?.count,
		).toBe(512);
	});

	test("does not change other section counts", () => {
		const { result } = renderHook(() =>
			useOrderedSections({
				...emptyArgs,
				againstBaseFiles: [emptyFile()],
				stagedFiles: [emptyFile(), emptyFile()],
				unstagedFiles: [emptyFile(), emptyFile(), emptyFile()],
			}),
		);

		const sections = result.current;
		expect(
			sections.find((section) => section.id === "against-base")?.count,
		).toBe(1);
		expect(sections.find((section) => section.id === "staged")?.count).toBe(2);
		expect(sections.find((section) => section.id === "unstaged")?.count).toBe(
			3,
		);
	});
});
