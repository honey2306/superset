import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { VscCheck } from "react-icons/vsc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";

interface CommitInputProps {
	workspaceId: string;
	hasStagedChanges: boolean;
	onRefresh: () => void;
}

/** The Changes panel owns local file staging and committing only. Branch sync lives on the workspace menu. */
export function CommitInput({
	workspaceId,
	hasStagedChanges,
	onRefresh,
}: CommitInputProps) {
	const { t } = useTranslation();
	const { activeHostUrl } = useLocalHostService();
	const queryClient = useQueryClient();
	const [commitMessage, setCommitMessage] = useState("");
	const commitMutation = useMutation({
		mutationFn: (message: string) => {
			if (!activeHostUrl) throw new Error("Workspace host is unavailable");
			return getHostServiceClientByUrl(activeHostUrl).git.commit.mutate({
				workspaceId,
				message,
			});
		},
		onSuccess: () => {
			toast.success(t("changes.commit.toastCommitted"));
			setCommitMessage("");
			void queryClient.invalidateQueries({
				queryKey: ["git-log", activeHostUrl, workspaceId],
			});
			onRefresh();
		},
		onError: (error) =>
			toast.error(
				t("changes.commit.toastCommitFailed", { message: error.message }),
			),
	});
	const canCommit = hasStagedChanges && Boolean(commitMessage.trim());
	const handleCommit = () => {
		if (!canCommit) return;
		commitMutation.mutate(commitMessage.trim());
	};

	return (
		<div className="flex flex-col gap-1.5 px-2 py-2">
			<Textarea
				placeholder={t("changes.commit.placeholder")}
				value={commitMessage}
				onChange={(event) => setCommitMessage(event.target.value)}
				className="min-h-[52px] resize-none bg-background text-[10px]"
				onKeyDown={(event) => {
					if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
						event.preventDefault();
						handleCommit();
					}
				}}
			/>
			<Button
				variant="secondary"
				size="sm"
				className="h-7 w-full gap-1.5 text-xs"
				onClick={handleCommit}
				disabled={!canCommit || commitMutation.isPending}
			>
				<VscCheck className="size-4" />
				{t("changes.commit.commit")}
			</Button>
		</div>
	);
}
