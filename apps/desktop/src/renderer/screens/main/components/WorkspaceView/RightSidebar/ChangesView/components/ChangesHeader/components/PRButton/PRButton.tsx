import type { GitHubStatus } from "@superset/shared/desktop-types";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useMutation } from "@tanstack/react-query";
import {
	VscChevronDown,
	VscGitMerge,
	VscGitPullRequest,
	VscLoading,
} from "react-icons/vsc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { MessageKey } from "renderer/providers/I18nProvider";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import { PRIcon } from "renderer/screens/main/components/PRIcon";
import { useCreateOrOpenPR } from "renderer/screens/main/hooks";

interface PRButtonProps {
	pr: GitHubStatus["pr"] | null;
	isLoading: boolean;
	canCreatePR: boolean;
	createPRBlockedReason: MessageKey | null;
	workspaceId: string;
	worktreePath: string;
	onRefresh: () => void;
}

export function PRButton({
	pr,
	isLoading,
	canCreatePR,
	createPRBlockedReason,
	workspaceId,
	onRefresh,
}: PRButtonProps) {
	const { t } = useTranslation();
	const { activeHostUrl } = useLocalHostService();
	const mergePRMutation = useMutation({
		mutationFn: (strategy: "merge" | "squash" | "rebase") => {
			if (!activeHostUrl || !pr) {
				throw new Error("Workspace host is unavailable");
			}
			const match = new URL(pr.url).pathname.match(
				/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/,
			);
			if (!match) throw new Error("Invalid pull request URL");
			return getHostServiceClientByUrl(activeHostUrl).github.mergePR.mutate({
				owner: match[1] ?? "",
				repo: match[2] ?? "",
				pullNumber: Number(match[3]),
				mergeMethod: strategy,
			});
		},
		onMutate: () => {
			const toastId = toast.loading(t("changes.pr.mergingToast"));
			return { toastId };
		},
		onSuccess: (_data, _variables, context) => {
			toast.success(t("changes.pr.mergedToast"), { id: context?.toastId });
			onRefresh();
		},
		onError: (error, _variables, context) =>
			toast.error(
				t("changes.pr.mergeFailedToast", { message: error.message }),
				{
					id: context?.toastId,
				},
			),
	});

	const { createOrOpenPR, isPending: isCreateOrOpenPRPending } =
		useCreateOrOpenPR({
			workspaceId,
			onSuccess: onRefresh,
		});

	const isCreatePending = isCreateOrOpenPRPending;

	const handleCreatePR = () => createOrOpenPR();

	const handleMergePR = (strategy: "merge" | "squash" | "rebase") =>
		mergePRMutation.mutate(strategy);

	if (isLoading) {
		return <VscLoading className="w-4 h-4 animate-spin text-fg-mute" />;
	}

	if (!pr) {
		if (!canCreatePR) {
			return (
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="flex items-center ml-auto text-fg-faint">
							<VscGitPullRequest className="w-4 h-4" />
						</span>
					</TooltipTrigger>
					<TooltipContent side="top">
						{createPRBlockedReason
							? t(createPRBlockedReason)
							: t("changes.pr.createPRUnavailable")}
					</TooltipContent>
				</Tooltip>
			);
		}

		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						className="flex items-center ml-auto hover:opacity-80 transition-opacity disabled:opacity-50"
						onClick={handleCreatePR}
						disabled={isCreatePending}
					>
						{isCreatePending ? (
							<VscLoading className="w-4 h-4 animate-spin text-fg-mute" />
						) : (
							<VscGitPullRequest className="w-4 h-4 text-fg-mute" />
						)}
					</button>
				</TooltipTrigger>
				<TooltipContent side="top">{t("changes.pr.createPR")}</TooltipContent>
			</Tooltip>
		);
	}

	const canMerge = pr.state === "open";

	if (!canMerge) {
		return (
			<a
				href={pr.url}
				target="_blank"
				rel="noopener noreferrer"
				className="flex items-center gap-1 ml-auto hover:opacity-80 transition-opacity"
			>
				<PRIcon state={pr.state} className="w-4 h-4" />
				<span className="text-xs text-fg-mute font-mono">#{pr.number}</span>
			</a>
		);
	}

	return (
		<div
			className="flex items-center ml-auto rounded border border-line overflow-hidden"
			aria-busy={mergePRMutation.isPending}
		>
			<a
				href={pr.url}
				target="_blank"
				rel="noopener noreferrer"
				className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-accent-tint transition-colors"
			>
				<PRIcon state={pr.state} className="w-4 h-4" />
				<span className="text-xs text-fg-mute font-mono">#{pr.number}</span>
			</a>
			<div className="w-px h-full bg-line" />
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="flex items-center px-1 py-0.5 hover:bg-accent-tint transition-colors"
						disabled={mergePRMutation.isPending}
						aria-label={
							mergePRMutation.isPending
								? t("changes.pr.mergingAria")
								: t("changes.pr.openMergeOptions")
						}
					>
						{mergePRMutation.isPending ? (
							<VscLoading className="size-3 animate-spin text-fg-mute" />
						) : (
							<VscChevronDown className="size-3 text-fg-mute" />
						)}
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-44">
					<DropdownMenuLabel className="text-xs text-fg-mute font-normal">
						{t("changes.pr.mergeLabel")}
					</DropdownMenuLabel>
					<DropdownMenuItem
						onClick={() => handleMergePR("squash")}
						className="text-xs"
						disabled={mergePRMutation.isPending}
					>
						<VscGitMerge className="size-3.5" />
						{t("changes.pr.squashAndMerge")}
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => handleMergePR("merge")}
						className="text-xs"
						disabled={mergePRMutation.isPending}
					>
						<VscGitMerge className="size-3.5" />
						{t("changes.pr.createMergeCommit")}
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => handleMergePR("rebase")}
						className="text-xs"
						disabled={mergePRMutation.isPending}
					>
						<VscGitMerge className="size-3.5" />
						{t("changes.pr.rebaseAndMerge")}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
