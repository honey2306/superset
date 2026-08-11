import {
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "@superset/ui/context-menu";
import { toast } from "@superset/ui/sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
	LuArrowDownToLine,
	LuArrowUpFromLine,
	LuGitBranch,
	LuGitPullRequest,
	LuRefreshCw,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { buildKDevCreateMergeRequestUrl } from "./kdev";

interface WorkspaceBranchActionsProps {
	hostUrl: string | null;
	hostWorkspaceId: string | null;
	branch: string;
	isMenuOpen: boolean;
	openUrl: (url: string) => void;
}

function BranchSwitcher({
	hostUrl,
	hostWorkspaceId,
	isMenuOpen,
}: Pick<
	WorkspaceBranchActionsProps,
	"hostUrl" | "hostWorkspaceId" | "isMenuOpen"
>) {
	const queryClient = useQueryClient();
	const [isOpen, setIsOpen] = useState(false);
	const queryKey = ["git-branches", hostUrl, hostWorkspaceId] as const;
	const { data } = useQuery({
		queryKey,
		enabled: Boolean(hostUrl && hostWorkspaceId && isMenuOpen && isOpen),
		queryFn: () => {
			if (!hostUrl || !hostWorkspaceId) {
				throw new Error("Workspace host is unavailable");
			}
			return getHostServiceClientByUrl(hostUrl).git.listBranches.query({
				workspaceId: hostWorkspaceId,
			});
		},
	});
	const switchMutation = electronTrpc.useUtils();
	const switchBranch = async (branch: string, remoteOnly: boolean) => {
		if (!hostUrl || !hostWorkspaceId) return;
		try {
			const client = getHostServiceClientByUrl(hostUrl);
			if (remoteOnly) {
				await client.git.checkoutRemoteBranch.mutate({
					workspaceId: hostWorkspaceId,
					branch,
				});
			} else {
				await client.git.switchBranch.mutate({
					workspaceId: hostWorkspaceId,
					branch,
				});
			}
			toast.success(`Switched to ${branch}`);
			await Promise.all([
				queryClient.invalidateQueries({ queryKey }),
				switchMutation.changes.getStatus.invalidate(),
			]);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	};

	const localNames = new Set((data?.branches ?? []).map(({ name }) => name));
	return (
		<ContextMenuSub onOpenChange={setIsOpen}>
			<ContextMenuSubTrigger disabled={!hostUrl || !hostWorkspaceId}>
				<LuGitBranch className="mr-2 size-4" />
				Switch branch
			</ContextMenuSubTrigger>
			<ContextMenuSubContent className="max-h-80 min-w-56 overflow-y-auto !bg-surface-sunk !text-fg">
				<ContextMenuLabel>Local branches</ContextMenuLabel>
				{data?.branches.map(({ name, isHead }) => (
					<ContextMenuItem
						key={name}
						disabled={isHead}
						onSelect={() => void switchBranch(name, false)}
					>
						{name}
						{isHead ? " (current)" : ""}
					</ContextMenuItem>
				))}
				{(data?.remoteBranches.length ?? 0) > 0 && <ContextMenuSeparator />}
				{data?.remoteBranches
					.filter((name) => !localNames.has(name))
					.map((name) => (
						<ContextMenuItem
							key={name}
							onSelect={() => void switchBranch(name, true)}
						>
							origin/{name}
						</ContextMenuItem>
					))}
				{!data && <ContextMenuItem disabled>Loading branches…</ContextMenuItem>}
			</ContextMenuSubContent>
		</ContextMenuSub>
	);
}

export function WorkspaceBranchActions({
	hostUrl,
	hostWorkspaceId,
	branch,
	isMenuOpen,
	openUrl,
}: WorkspaceBranchActionsProps) {
	const utils = electronTrpc.useUtils();
	const queryClient = useQueryClient();
	const hasHostTarget = Boolean(hostUrl && hostWorkspaceId);
	const { data: remote } = useQuery({
		queryKey: ["git-remote-url", hostUrl, hostWorkspaceId],
		enabled: Boolean(hostUrl && hostWorkspaceId && isMenuOpen),
		queryFn: () => {
			if (!hostUrl || !hostWorkspaceId) {
				throw new Error("Workspace host is unavailable");
			}
			return getHostServiceClientByUrl(hostUrl).git.getRemoteUrl.query({
				workspaceId: hostWorkspaceId,
			});
		},
	});
	const runSyncAction = async (action: "fetch" | "pull" | "push") => {
		if (!hostUrl || !hostWorkspaceId) {
			toast.error("Workspace host is not ready yet");
			return;
		}
		try {
			const git = getHostServiceClientByUrl(hostUrl).git;
			if (action === "fetch")
				await git.fetchCurrentBranch.mutate({ workspaceId: hostWorkspaceId });
			else if (action === "pull")
				await git.pullCurrentBranch.mutate({ workspaceId: hostWorkspaceId });
			else
				await git.pushCurrentBranch.mutate({
					workspaceId: hostWorkspaceId,
					setUpstream: true,
				});
			toast.success(
				`${action[0]?.toUpperCase()}${action.slice(1)}ed current branch`,
			);
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: ["git-branches", hostUrl, hostWorkspaceId],
				}),
				queryClient.invalidateQueries({
					queryKey: ["git-changes-status", hostUrl, hostWorkspaceId],
				}),
				queryClient.invalidateQueries({
					queryKey: ["git-branch-sync-status", hostUrl, hostWorkspaceId],
				}),
				utils.changes.getStatus.invalidate(),
			]);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	};
	const kdevUrl = buildKDevCreateMergeRequestUrl(remote?.url ?? null, branch);
	const openKDevCreateMergeRequest = (target: "dev" | "master" | "choose") => {
		if (!kdevUrl) return;
		openUrl(kdevUrl);
		toast.success(
			target === "choose"
				? "KDev opened. Choose a target branch"
				: `KDev opened. Confirm target branch: ${target}`,
		);
	};

	return (
		<>
			<BranchSwitcher
				hostUrl={hostUrl}
				hostWorkspaceId={hostWorkspaceId}
				isMenuOpen={isMenuOpen}
			/>
			<ContextMenuItem
				disabled={!hasHostTarget}
				onSelect={() => void runSyncAction("fetch")}
			>
				<LuRefreshCw className="mr-2 size-4" /> Fetch
			</ContextMenuItem>
			<ContextMenuItem
				disabled={!hasHostTarget}
				onSelect={() => void runSyncAction("pull")}
			>
				<LuArrowDownToLine className="mr-2 size-4" /> Pull
			</ContextMenuItem>
			<ContextMenuItem
				disabled={!hasHostTarget}
				onSelect={() => void runSyncAction("push")}
			>
				<LuArrowUpFromLine className="mr-2 size-4" /> Push
			</ContextMenuItem>
			{kdevUrl && (
				<ContextMenuSub>
					<ContextMenuSubTrigger>
						<LuGitPullRequest className="mr-2 size-4" /> Create MR in KDev
					</ContextMenuSubTrigger>
					<ContextMenuSubContent className="!bg-surface-sunk !text-fg">
						<ContextMenuLabel>Choose target branch in KDev</ContextMenuLabel>
						<ContextMenuItem onSelect={() => openKDevCreateMergeRequest("dev")}>
							dev
						</ContextMenuItem>
						<ContextMenuItem
							onSelect={() => openKDevCreateMergeRequest("master")}
						>
							master
						</ContextMenuItem>
						<ContextMenuItem
							onSelect={() => openKDevCreateMergeRequest("choose")}
						>
							Choose in KDev…
						</ContextMenuItem>
					</ContextMenuSubContent>
				</ContextMenuSub>
			)}
		</>
	);
}
