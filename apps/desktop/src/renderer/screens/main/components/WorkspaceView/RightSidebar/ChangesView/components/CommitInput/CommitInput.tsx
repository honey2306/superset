import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { useState } from "react";
import { VscCheck } from "react-icons/vsc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";

interface CommitInputProps {
	worktreePath: string;
	hasStagedChanges: boolean;
	onRefresh: () => void;
}

/** The Changes panel owns local file staging and committing only. Branch sync lives on the workspace menu. */
export function CommitInput({
	worktreePath,
	hasStagedChanges,
	onRefresh,
}: CommitInputProps) {
	const { t } = useTranslation();
	const [commitMessage, setCommitMessage] = useState("");
	const commitMutation = electronTrpc.changes.commit.useMutation({
		onSuccess: () => {
			toast.success(t("v1Changes.commit.toastCommitted"));
			setCommitMessage("");
			onRefresh();
		},
		onError: (error) =>
			toast.error(
				t("v1Changes.commit.toastCommitFailed", { message: error.message }),
			),
	});
	const canCommit = hasStagedChanges && Boolean(commitMessage.trim());
	const handleCommit = () => {
		if (!canCommit) return;
		commitMutation.mutate({ worktreePath, message: commitMessage.trim() });
	};

	return (
		<div className="flex flex-col gap-1.5 px-2 py-2">
			<Textarea
				placeholder={t("v1Changes.commit.placeholder")}
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
				{t("v1Changes.commit.commit")}
			</Button>
		</div>
	);
}
