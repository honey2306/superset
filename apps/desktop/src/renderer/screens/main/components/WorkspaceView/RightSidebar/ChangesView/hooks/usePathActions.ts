import type { ExternalApp } from "@superset/local-db";
import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";

interface UsePathActionsProps {
	absolutePath: string | null;
	relativePath?: string;
	/** For files: pass worktreePath to use openFileInEditor. For folders: omit to use openInApp */
	worktreePath?: string;
	/** Pre-resolved app to avoid per-row default-app queries */
	defaultApp?: ExternalApp | null;
	/** Project identifier for project-scoped actions/metadata */
	projectId?: string;
}

export function usePathActions({
	absolutePath,
	relativePath,
	worktreePath,
	defaultApp,
	projectId,
}: UsePathActionsProps) {
	const { t } = useTranslation();
	const openInFinderMutation = electronTrpc.external.openInFinder.useMutation();
	const openInAppMutation = electronTrpc.external.openInApp.useMutation({
		onError: (error) =>
			toast.error(t("v1Changes.pathActions.openInAppFailed"), {
				description: error.message,
			}),
	});
	const openFileInEditorMutation =
		electronTrpc.external.openFileInEditor.useMutation({
			onError: (error) =>
				toast.error(t("v1Changes.pathActions.openInEditorFailed"), {
					description: error.message,
				}),
		});

	const { copyToClipboard } = useCopyToClipboard();

	const copyPath = useCallback(() => {
		if (absolutePath) {
			copyToClipboard(absolutePath);
		}
	}, [absolutePath, copyToClipboard]);

	const copyRelativePath = useCallback(() => {
		if (relativePath) {
			copyToClipboard(relativePath);
		}
	}, [relativePath, copyToClipboard]);

	const revealInFinder = useCallback(() => {
		if (absolutePath) {
			openInFinderMutation.mutate(absolutePath);
		}
	}, [absolutePath, openInFinderMutation]);

	const openInEditor = useCallback(() => {
		if (!absolutePath) return;

		if (worktreePath) {
			openFileInEditorMutation.mutate({
				path: absolutePath,
				worktreePath,
				projectId,
			});
		} else {
			// Avoid opening with an incorrect fallback before upstream default app query resolves.
			if (defaultApp === undefined) {
				toast.error(t("v1Changes.pathActions.editorPrefLoading"), {
					description: t("v1Changes.pathActions.editorPrefLoadingDesc"),
				});
				return;
			}

			if (!defaultApp) {
				toast.error(t("v1Changes.pathActions.noDefaultEditor"), {
					description: t("v1Changes.pathActions.noDefaultEditorDesc"),
				});
				return;
			}

			openInAppMutation.mutate({
				path: absolutePath,
				app: defaultApp,
				projectId,
			});
		}
	}, [
		absolutePath,
		worktreePath,
		projectId,
		defaultApp,
		openInAppMutation,
		openFileInEditorMutation,
		t,
	]);

	return {
		copyPath,
		copyRelativePath,
		revealInFinder,
		openInEditor,
		hasRelativePath: Boolean(relativePath),
	};
}
