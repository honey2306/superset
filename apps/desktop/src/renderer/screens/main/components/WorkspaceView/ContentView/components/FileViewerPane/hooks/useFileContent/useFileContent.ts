import { workspaceTrpc } from "@superset/workspace-client";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { toRelativeWorkspacePath } from "shared/absolute-paths";
import type { ChangeCategory } from "shared/changes-types";
import { detectLanguage } from "shared/detect-language";
import { getImageMimeType, isImageFile } from "shared/file-types";

const BRANCH_QUERY_STALE_TIME_MS = 10_000;
export const FILE_CONTENT_STALE_TIME_MS = 30_000;
export const FILE_CONTENT_GC_TIME_MS = 30 * 60_000;

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const BINARY_CHECK_SIZE = 8192;

interface UseFileContentParams {
	workspaceId?: string;
	worktreePath: string;
	filePath: string;
	viewMode: "raw" | "diff" | "rendered";
	diffCategory?: ChangeCategory;
	commitHash?: string;
	oldPath?: string;
}

function isBinaryText(content: string): boolean {
	const checkLen = Math.min(content.length, BINARY_CHECK_SIZE);
	for (let i = 0; i < checkLen; i++) {
		if (content.charCodeAt(i) === 0) {
			return true;
		}
	}
	return false;
}

export function useFileContent({
	workspaceId,
	worktreePath,
	filePath,
	viewMode,
	diffCategory,
	commitHash,
	oldPath,
}: UseFileContentParams) {
	// For remote URLs (e.g. Vercel Blob), skip all IPC queries
	const isRemote =
		filePath.startsWith("https://") || filePath.startsWith("http://");

	const hostUrl = useWorkspaceHostUrl(workspaceId ?? null);
	const { data: branchData } = useQuery({
		queryKey: ["git-file-viewer-branches", hostUrl, workspaceId],
		enabled:
			!isRemote &&
			Boolean(hostUrl && workspaceId) &&
			diffCategory === "against-base",
		queryFn: async () => {
			if (!hostUrl || !workspaceId) {
				throw new Error("Workspace host is unavailable");
			}
			const client = getHostServiceClientByUrl(hostUrl);
			const [branches, status] = await Promise.all([
				client.git.listBranches.query({ workspaceId }),
				client.git.getStatus.query({
					workspaceId,
					priority: "background",
				}),
			]);
			return {
				...branches,
				currentBranch:
					branches.branches.find((branch) => branch.isHead)?.name ?? null,
				defaultBranch: status.defaultBranch.name,
			};
		},
		staleTime: BRANCH_QUERY_STALE_TIME_MS,
		refetchOnWindowFocus: false,
	});
	const effectiveBaseBranch = branchData?.defaultBranch ?? "main";

	const isImage = isImageFile(filePath);

	const rawReadEnabled =
		!isRemote && viewMode !== "diff" && !isImage && !!filePath && !!workspaceId;
	const rawQuery = workspaceTrpc.filesystem.readFile.useQuery(
		{
			workspaceId: workspaceId ?? "",
			absolutePath: filePath,
			encoding: "utf-8",
			maxBytes: MAX_FILE_SIZE,
		},
		{
			enabled: rawReadEnabled,
			gcTime: FILE_CONTENT_GC_TIME_MS,
			retry: false,
			// useWorkspaceFileEvents is the authoritative invalidation source for on-disk changes;
			// window-focus refetches are redundant and introduce a race with in-flight user edits.
			refetchOnWindowFocus: false,
			staleTime: FILE_CONTENT_STALE_TIME_MS,
		},
	);

	const rawFileData = useMemo(() => {
		if (rawQuery.error) {
			const msg = rawQuery.error.message;
			if (msg.includes("EISDIR")) {
				return { ok: false as const, reason: "is-directory" as const };
			}
			return { ok: false as const, reason: "not-found" as const };
		}
		if (!rawQuery.data) return undefined;
		const result = rawQuery.data;
		if (result.exceededLimit) {
			return { ok: false as const, reason: "too-large" as const };
		}
		const content = result.content as string;
		if (isBinaryText(content)) {
			return { ok: false as const, reason: "binary" as const };
		}
		return {
			ok: true as const,
			content,
			truncated: false,
			byteLength: result.byteLength,
		};
	}, [rawQuery.data, rawQuery.error]);

	const imageReadEnabled =
		!isRemote &&
		viewMode === "rendered" &&
		isImage &&
		!!filePath &&
		!!workspaceId;
	const imageQuery = workspaceTrpc.filesystem.readFile.useQuery(
		{
			workspaceId: workspaceId ?? "",
			absolutePath: filePath,
			maxBytes: MAX_IMAGE_SIZE,
		},
		{
			enabled: imageReadEnabled,
			gcTime: FILE_CONTENT_GC_TIME_MS,
			retry: false,
			refetchOnWindowFocus: false,
			staleTime: FILE_CONTENT_STALE_TIME_MS,
		},
	);

	const imageData = useMemo(() => {
		if (isRemote) {
			return { ok: true as const, dataUrl: filePath, byteLength: 0 };
		}
		if (imageQuery.error) {
			const msg = imageQuery.error.message;
			if (msg.includes("EISDIR")) {
				return { ok: false as const, reason: "is-directory" as const };
			}
			return { ok: false as const, reason: "not-found" as const };
		}
		if (!imageQuery.data) return undefined;
		const result = imageQuery.data;
		if (result.exceededLimit) {
			return { ok: false as const, reason: "too-large" as const };
		}
		const mimeType = getImageMimeType(filePath);
		if (!mimeType) {
			return { ok: false as const, reason: "not-image" as const };
		}
		return {
			ok: true as const,
			dataUrl: `data:${mimeType};base64,${result.content}`,
			byteLength: result.byteLength,
		};
	}, [imageQuery.data, imageQuery.error, filePath, isRemote]);

	const isUnstagedDiff = viewMode === "diff" && diffCategory === "unstaged";
	const isGitDiff =
		viewMode === "diff" && !!diffCategory && diffCategory !== "unstaged";
	const relativePath = toRelativeWorkspacePath(worktreePath, filePath);
	const oldRelativePath = oldPath
		? toRelativeWorkspacePath(worktreePath, oldPath)
		: undefined;

	const { data: gitDiffData, isLoading: isLoadingGitDiff } =
		workspaceTrpc.git.getDiff.useQuery(
			{
				workspaceId: workspaceId ?? "",
				path: relativePath,
				oldPath: oldRelativePath,
				category:
					diffCategory === "committed" ? "commit" : (diffCategory ?? "staged"),
				commitHash,
				baseBranch:
					diffCategory === "against-base" ? effectiveBaseBranch : undefined,
			},
			{
				enabled:
					!isRemote &&
					isGitDiff &&
					!!filePath &&
					!!worktreePath &&
					!!workspaceId,
				select: (data) => ({
					original: data.oldFile.contents,
					modified: data.newFile.contents,
					language: detectLanguage(filePath),
				}),
			},
		);

	const { data: gitOriginal, isLoading: isLoadingGitOriginal } =
		workspaceTrpc.git.getDiff.useQuery(
			{
				workspaceId: workspaceId ?? "",
				path: relativePath,
				oldPath: oldRelativePath,
				category: "unstaged",
			},
			{
				enabled:
					!isRemote &&
					isUnstagedDiff &&
					!!filePath &&
					!!worktreePath &&
					!!workspaceId,
				select: (data) => data.oldFile,
			},
		);

	const { data: workingCopy, isLoading: isLoadingWorkingCopy } =
		workspaceTrpc.filesystem.readFile.useQuery(
			{
				workspaceId: workspaceId ?? "",
				absolutePath: filePath,
				encoding: "utf-8",
				maxBytes: MAX_FILE_SIZE,
			},
			{
				enabled: !isRemote && isUnstagedDiff && !!filePath && !!workspaceId,
				gcTime: FILE_CONTENT_GC_TIME_MS,
				refetchOnWindowFocus: false,
				staleTime: FILE_CONTENT_STALE_TIME_MS,
			},
		);

	const diffData = useMemo(() => {
		if (isGitDiff) return gitDiffData;
		if (isUnstagedDiff && gitOriginal) {
			let modifiedContent = "";
			if (workingCopy) {
				if (workingCopy.exceededLimit) {
					modifiedContent = `[File content truncated - exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit]`;
				} else {
					modifiedContent = workingCopy.content as string;
				}
			}
			return {
				original: gitOriginal.contents,
				modified: modifiedContent,
				language: detectLanguage(filePath),
			};
		}
		return undefined;
	}, [
		isGitDiff,
		isUnstagedDiff,
		gitDiffData,
		gitOriginal,
		workingCopy,
		filePath,
	]);

	const isLoadingDiff = isGitDiff
		? isLoadingGitDiff
		: isUnstagedDiff
			? isLoadingGitOriginal || isLoadingWorkingCopy
			: false;

	return {
		rawFileData,
		isLoadingRaw: isImage
			? !imageData && imageQuery.isLoading
			: !rawFileData && rawQuery.isLoading,
		imageData,
		isLoadingImage: isRemote ? false : !imageData && imageQuery.isLoading,
		diffData,
		isLoadingDiff,
		rawRevision: rawQuery.data?.revision ?? null,
		workingCopyRevision: workingCopy?.revision ?? null,
	};
}
