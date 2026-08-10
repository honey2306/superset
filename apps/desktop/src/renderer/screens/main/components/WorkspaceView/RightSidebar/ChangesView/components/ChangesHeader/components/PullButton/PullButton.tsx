import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { VscArrowDown } from "react-icons/vsc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";

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
	const pullMutation = electronTrpc.changes.pull.useMutation({
		onSuccess: () => {
			toast.success(t("v1Changes.commit.toastPulled"));
			onRefresh();
		},
		onError: (error) =>
			toast.error(
				t("v1Changes.commit.toastPullFailed", { message: error.message }),
			),
	});

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="h-6 min-w-6 gap-0.5 px-1.5"
					disabled={!worktreePath || pullMutation.isPending}
					onClick={() => pullMutation.mutate({ worktreePath })}
				>
					<VscArrowDown className="size-3.5" />
					{pullCount > 0 ? (
						<span className="text-[10px] tabular-nums">{pullCount}</span>
					) : null}
				</Button>
			</TooltipTrigger>
			<TooltipContent side="top" showArrow={false}>
				{pullCount > 0
					? t("v1Changes.primaryAction.pullTooltip", { count: pullCount })
					: t("v1Changes.commit.pull")}
			</TooltipContent>
		</Tooltip>
	);
}
