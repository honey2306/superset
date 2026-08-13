import { toast } from "@superset/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";

interface UseCreateOrOpenPROptions {
	workspaceId?: string;
	onSuccess?: () => void;
}

interface UseCreateOrOpenPRResult {
	createOrOpenPR: () => void;
	isPending: boolean;
}

export function useCreateOrOpenPR({
	workspaceId,
	onSuccess,
}: UseCreateOrOpenPROptions): UseCreateOrOpenPRResult {
	const { activeHostUrl } = useLocalHostService();
	const { mutateAsync, isPending } = useMutation({
		mutationFn: (input: { allowOutOfDate?: boolean }) => {
			if (!activeHostUrl || !workspaceId) {
				throw new Error("Workspace host is unavailable");
			}
			return getHostServiceClientByUrl(
				activeHostUrl,
			).git.createPullRequest.mutate({
				workspaceId,
				allowOutOfDate: input.allowOutOfDate,
			});
		},
	});

	const createOrOpenPR = useCallback(() => {
		if (!workspaceId || !activeHostUrl || isPending) return;

		void (async () => {
			try {
				const result = await mutateAsync({});
				window.open(result.url, "_blank", "noopener,noreferrer");
				toast.success("Opening GitHub...");
				onSuccess?.();
				return;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				const isBehindUpstreamError = message.includes("behind upstream");
				if (!isBehindUpstreamError) {
					toast.error(`Failed: ${message}`);
					return;
				}

				const shouldContinue = window.confirm(
					`${message}\n\nCreate/open the pull request anyway?`,
				);
				if (!shouldContinue) {
					return;
				}
			}

			try {
				const result = await mutateAsync({ allowOutOfDate: true });
				window.open(result.url, "_blank", "noopener,noreferrer");
				toast.success("Opening GitHub...");
				onSuccess?.();
			} catch (retryError) {
				const retryMessage =
					retryError instanceof Error ? retryError.message : String(retryError);
				toast.error(`Failed: ${retryMessage}`);
			}
		})();
	}, [activeHostUrl, isPending, mutateAsync, onSuccess, workspaceId]);

	return {
		createOrOpenPR,
		isPending,
	};
}
