import { beforeEach, describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
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
const listBranchesQuery = mock(async () => ({ branches: [] }));
const getStatusQuery = mock(async () => ({
	defaultBranch: { name: "main" },
}));

// Host-backed dependencies are stubbed so the hook never reaches a real host.
// Keep the catalog deliberately not-ready while retaining cached workspace rows:
// useWorkspaceHostUrl must resolve those rows cache-first during a refresh.
mock.module(
	"renderer/routes/_local/providers/LocalHostServiceProvider",
	() => ({
		useLocalHostService: () => ({
			machineId: "machine-1",
			activeHostUrl: "http://host.test",
		}),
	}),
);

mock.module(
	"renderer/routes/_local/providers/WorkspaceCatalogProvider",
	() => ({
		useWorkspaceCatalog: () => ({
			projects: [],
			workspaces: [{ id: "workspace-1" }, { id: "workspace-2" }],
			isReady: false,
		}),
	}),
);

mock.module("renderer/lib/host-service-client", () => ({
	getHostServiceClientByUrl: () => ({
		git: {
			listBranches: { query: listBranchesQuery },
			getStatus: { query: getStatusQuery },
		},
	}),
}));

// workspace-client is stubbed so filesystem reads remain deterministic. `react`
// is intentionally NOT mocked here: this hook runs under the real React renderer
// via `renderHook`. Mocking it globally leaks fake context into unrelated tests.
mock.module("@superset/workspace-client", () => ({
	workspaceTrpc: {
		git: {
			getDiff: { useQuery: emptyUseQuery },
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

const createWrapper = () => {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return function QueryWrapper({ children }: { children: ReactNode }) {
		return createElement(
			QueryClientProvider,
			{ client: queryClient },
			children,
		);
	};
};

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

		const { result } = renderHook(
			() =>
				useFileContent({
					workspaceId: "workspace-1",
					worktreePath: "/worktrees/one",
					filePath: "/worktrees/one/README.md",
					viewMode: "raw",
				}),
			{ wrapper: createWrapper() },
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
		const { result } = renderHook(
			() =>
				useFileContent({
					workspaceId: "workspace-2",
					worktreePath: "/worktrees/two",
					filePath: "/worktrees/two/README.md",
					viewMode: "raw",
				}),
			{ wrapper: createWrapper() },
		);

		expect(result.current.rawFileData).toBeUndefined();
		expect(result.current.isLoadingRaw).toBe(true);
	});
});
