import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useMutation } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { VscArrowDown } from "react-icons/vsc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";

interface PullButtonProps {
	worktreePath: string;
	pullCount: number;
	onRefresh: () => void;
}

export function PullButton({
	worktreePath,
	pullCount,
	onRefresh,
}: PullButtonProps) {
	const { t } = useTranslation();
	const { workspaceId } = useParams({ strict: false });
	const { activeHostUrl } = useLocalHostService();
	const pullMutation = useMutation({
		mutationFn: () => {
			if (!activeHostUrl || !workspaceId) {
				throw new Error("Workspace host is unavailable");
			}
			return getHostServiceClientByUrl(
				activeHostUrl,
			).git.pullCurrentBranch.mutate({ workspaceId });
		},
		onSuccess: () => {
			toast.success(t("changes.commit.toastPulled"));
			onRefresh();
		},
		onError: (error) =>
			toast.error(
				t("changes.commit.toastPullFailed", { message: error.message }),
			),
	});

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="h-6 min-w-6 gap-0.5 px-1.5"
					disabled={!worktreePath || !workspaceId || pullMutation.isPending}
					onClick={() => pullMutation.mutate()}
				>
					<VscArrowDown className="size-3.5" />
					{pullCount > 0 ? (
						<span className="text-[10px] tabular-nums">{pullCount}</span>
					) : null}
				</Button>
			</TooltipTrigger>
			<TooltipContent side="top" showArrow={false}>
				{pullCount > 0
					? t("changes.primaryAction.pullTooltip", { count: pullCount })
					: t("changes.commit.pull")}
			</TooltipContent>
		</Tooltip>
	);
}
