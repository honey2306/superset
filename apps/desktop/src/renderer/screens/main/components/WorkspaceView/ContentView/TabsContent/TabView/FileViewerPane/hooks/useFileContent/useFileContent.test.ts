import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ensureHappyDom } from "test-utils/happy-dom-env";

let renderHook: typeof import("@testing-library/react/pure").renderHook;

let rawQueryResult: {
	data?: {
		content: string;
		byteLength: number;
		exceededLimit: boolean;
		revision: string;
	};
	error?: Error;
	isLoading: boolean;
};

const readFileUseQuery = mock(
	(_input: unknown, options: { enabled: boolean }) =>
		options.enabled
			? rawQueryResult
			: { data: undefined, error: undefined, isLoading: false },
);
const emptyUseQuery = mock(() => ({ data: undefined, isLoading: false }));

// electron-trpc is stubbed so the hook never hits the real tRPC client. `react`
// is intentionally NOT mocked here: this hook only uses `useMemo`, so it runs
// under the real React renderer via `renderHook`. Mocking `react` globally (as
// this file used to) leaks a fake `react` into the rest of the test process and
// breaks tests that need the real React context (e.g. react-dnd in
// V1PanesPresetBarItem).
mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		changes: {
			getBranches: { useQuery: emptyUseQuery },
			getGitFileContents: { useQuery: emptyUseQuery },
			getGitOriginalContent: { useQuery: emptyUseQuery },
		},
		filesystem: {
			readFile: { useQuery: readFileUseQuery },
		},
	},
}));

let FILE_CONTENT_GC_TIME_MS: number;
let FILE_CONTENT_STALE_TIME_MS: number;
let useFileContent: typeof import("./useFileContent").useFileContent;

beforeEach(async () => {
	await ensureHappyDom();
	({ renderHook } = await import("@testing-library/react/pure"));
	({ FILE_CONTENT_GC_TIME_MS, FILE_CONTENT_STALE_TIME_MS, useFileContent } =
		await import("./useFileContent"));
	rawQueryResult = { isLoading: true };
	readFileUseQuery.mockClear();
});

describe("useFileContent", () => {
	test("keeps exact-workspace cached file content visible during a refresh", () => {
		rawQueryResult = {
			data: {
				content: "cached content",
				byteLength: 14,
				exceededLimit: false,
				revision: "revision-1",
			},
			isLoading: true,
		};

		const { result } = renderHook(() =>
			useFileContent({
				workspaceId: "workspace-1",
				worktreePath: "/worktrees/one",
				filePath: "/worktrees/one/README.md",
				viewMode: "raw",
			}),
		);

		expect(result.current.rawFileData).toEqual({
			ok: true,
			content: "cached content",
			truncated: false,
			byteLength: 14,
		});
		expect(result.current.isLoadingRaw).toBe(false);
		expect(readFileUseQuery).toHaveBeenNthCalledWith(
			1,
			{
				workspaceId: "workspace-1",
				absolutePath: "/worktrees/one/README.md",
				encoding: "utf-8",
				maxBytes: 2 * 1024 * 1024,
			},
			expect.objectContaining({
				enabled: true,
				gcTime: FILE_CONTENT_GC_TIME_MS,
				staleTime: FILE_CONTENT_STALE_TIME_MS,
			}),
		);
	});

	test("shows initial loading only when no cached file data exists", () => {
		const { result } = renderHook(() =>
			useFileContent({
				workspaceId: "workspace-2",
				worktreePath: "/worktrees/two",
				filePath: "/worktrees/two/README.md",
				viewMode: "raw",
			}),
		);

		expect(result.current.rawFileData).toBeUndefined();
		expect(result.current.isLoadingRaw).toBe(true);
	});
});
