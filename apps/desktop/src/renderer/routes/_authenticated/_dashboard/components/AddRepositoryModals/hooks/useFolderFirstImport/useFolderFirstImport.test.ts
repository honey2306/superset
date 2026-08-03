import { beforeEach, describe, expect, it, mock } from "bun:test";
import { ensureHappyDom } from "test-utils/happy-dom-env";

let renderHook: typeof import("@testing-library/react/pure").renderHook;

const hostUrl = "http://host-service";
const repoPath = "/repos/octocat";
const setupResult = {
	projectId: "created-project",
	repoPath,
	mainWorkspaceId: "workspace-1",
};
const cloudError = {
	url: "https://github.com/octocat/hello.git",
	message: "cloud-down",
};

const selectDirectoryMock = mock(async () => ({
	canceled: false,
	path: repoPath,
}));
const findByPathMock = mock(
	async (): Promise<{
		candidates: { id: string; name: string }[];
		cloudErrors: (typeof cloudError)[];
		needsGitInit?: boolean;
	}> => ({
		candidates: [],
		cloudErrors: [],
	}),
);
const provisionMock = mock(async () => setupResult);
const finalizeSetupMock = mock(() => undefined);
const requestGitInitMock = mock(async () => false);

// Every context hook the hook touches is stubbed below, and the hook's only
// direct React usage is `useCallback`/`useState`, which run fine under the real
// React renderer via `renderHook`. We deliberately do NOT mock `react` globally
// here — that used to leak a fake `react` into the rest of the test process and
// break react-dnd's real context in V1PanesPresetBarItem.

mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		window: {
			selectDirectory: {
				useMutation: () => ({ mutateAsync: selectDirectoryMock }),
			},
		},
	},
}));

mock.module("renderer/lib/host-service-client", () => ({
	getHostServiceClientByUrl: () => ({
		project: {
			findByPath: { query: findByPathMock },
		},
	}),
}));

mock.module("renderer/stores/workspace-launch", () => ({
	beginProjectProvisioning: provisionMock,
	createWorkspaceProvisioningAdapter: () => ({}),
}));

mock.module("renderer/react-query/projects", () => ({
	useFinalizeProjectSetup: () => finalizeSetupMock,
}));

mock.module("renderer/providers/I18nProvider", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

mock.module(
	"renderer/routes/_authenticated/providers/LocalHostServiceProvider",
	() => ({
		useLocalHostService: () => ({
			activeHostUrl: hostUrl,
			waitForHostReady: async () => hostUrl,
		}),
	}),
);

mock.module("renderer/stores/git-init-confirm", () => ({
	useRequestGitInitConfirm: () => requestGitInitMock,
}));

let useFolderFirstImport: typeof import("./useFolderFirstImport").useFolderFirstImport;

beforeEach(async () => {
	await ensureHappyDom();
	({ renderHook } = await import("@testing-library/react/pure"));
	({ useFolderFirstImport } = await import("./useFolderFirstImport"));
	for (const fn of [
		selectDirectoryMock,
		findByPathMock,
		provisionMock,
		finalizeSetupMock,
		requestGitInitMock,
	]) {
		fn.mockClear();
	}
	findByPathMock.mockResolvedValue({ candidates: [], cloudErrors: [] });
	requestGitInitMock.mockResolvedValue(false);
});

describe("useFolderFirstImport", () => {
	it("reports cloud lookup errors instead of creating a duplicate local import when no candidates exist", async () => {
		findByPathMock.mockResolvedValue({
			candidates: [],
			cloudErrors: [cloudError],
		});
		const onError = mock(() => undefined);

		const { result } = renderHook(() => useFolderFirstImport({ onError }));
		const ret = await result.current.start();

		expect(ret).toBeNull();
		expect(findByPathMock).toHaveBeenCalledWith({ repoPath });
		expect(onError).toHaveBeenCalledWith(
			"Couldn't reach cloud for https://github.com/octocat/hello.git: cloud-down",
		);
		expect(provisionMock).not.toHaveBeenCalled();
		expect(finalizeSetupMock).not.toHaveBeenCalled();
	});

	it("imports with init after the user confirms a non-git folder", async () => {
		findByPathMock.mockResolvedValue({
			candidates: [],
			cloudErrors: [],
			needsGitInit: true,
		});
		requestGitInitMock.mockResolvedValue(true);
		const onError = mock(() => undefined);

		const { result } = renderHook(() => useFolderFirstImport({ onError }));
		const ret = await result.current.start();

		expect(requestGitInitMock).toHaveBeenCalledWith(repoPath);
		expect(provisionMock).toHaveBeenCalledWith({
			hostUrl,
			adapter: expect.any(Object),
			request: {
				idempotencyKey: `project-import:${repoPath}:initialize`,
				project: {
					kind: "import",
					path: repoPath,
					name: "octocat",
					git: "initialize-with-consent",
				},
				source: { kind: "main" },
			},
		});
		expect(finalizeSetupMock).toHaveBeenCalledWith(hostUrl, {
			projectId: "created-project",
			repoPath,
			mainWorkspaceId: "workspace-1",
		});
		expect(ret).toEqual({
			projectId: "created-project",
			repoPath,
			mainWorkspaceId: "workspace-1",
		});
		expect(onError).not.toHaveBeenCalled();
	});

	it("does nothing when the user cancels the git-init confirmation", async () => {
		findByPathMock.mockResolvedValue({
			candidates: [],
			cloudErrors: [],
			needsGitInit: true,
		});
		requestGitInitMock.mockResolvedValue(false);
		const onError = mock(() => undefined);

		const { result } = renderHook(() => useFolderFirstImport({ onError }));
		const ret = await result.current.start();

		expect(ret).toBeNull();
		expect(requestGitInitMock).toHaveBeenCalledWith(repoPath);
		expect(provisionMock).not.toHaveBeenCalled();
		expect(finalizeSetupMock).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();
	});
});
