import type { DiscussionRun } from "@superset/session-protocol";
import { Button } from "@superset/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LuCheck, LuChevronRight, LuSquare } from "react-icons/lu";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl/useWorkspaceHostUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

const ACTIVE_STATUSES = new Set(["running"]);

function participantName(run: DiscussionRun, sessionId: string): string {
	return (
		run.participants.find((participant) => participant.sessionId === sessionId)
			?.label ?? "Agent"
	);
}

function DiscussionRunView({
	run,
	onStop,
}: {
	run: DiscussionRun;
	onStop: () => void;
}) {
	const [showDetails, setShowDetails] = useState(false);
	const active = ACTIVE_STATUSES.has(run.status);
	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="shrink-0 border-b border-border px-3 py-3">
				<div className="flex items-center gap-1.5 text-[10px] text-fg-mute">
					<span className={active ? "text-warning" : "text-success"}>
						{active
							? "讨论中"
							: run.status === "completed"
								? "已完成"
								: run.status}
					</span>
					<span>·</span>
					<span>
						第 {run.currentRound} / {run.maxRounds} 轮
					</span>
					{active && (
						<Button
							variant="ghost"
							size="sm"
							className="ml-auto h-6 px-1.5 text-[10px] text-fg-mute hover:text-destructive"
							onClick={onStop}
						>
							<LuSquare className="mr-1 size-3" />
							结束
						</Button>
					)}
				</div>
				<h2 className="mt-1.5 text-sm font-medium leading-5 text-fg">
					{run.topic}
				</h2>
				<div className="mt-2 flex flex-wrap gap-1.5">
					{run.participants.map((participant) => (
						<span
							key={participant.sessionId}
							className="rounded-ds-2 border border-border bg-surface px-1.5 py-1 text-[10px] text-fg-mute"
						>
							{participant.label} · {participant.model ?? participant.agent}
						</span>
					))}
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto p-2">
				{run.rounds.map((round) => (
					<section
						key={round.round}
						className="mb-2 overflow-hidden rounded-ds-3 border border-border bg-background"
					>
						<div className="flex h-8 items-center px-2.5 text-[10px] text-fg-mute">
							<span>第 {round.round} 轮</span>
							<LuCheck className="ml-auto size-3 text-success" />
						</div>
						<div className="space-y-1.5 px-1.5 pb-1.5">
							{round.contributions.map((contribution) => (
								<article
									key={contribution.sessionId}
									className="rounded-ds-2 bg-surface px-2.5 py-2"
								>
									<div className="mb-1 text-[10px] font-medium text-fg">
										{participantName(run, contribution.sessionId)}
									</div>
									<p className="whitespace-pre-wrap text-[11px] leading-[1.65] text-fg-mute">
										{contribution.response}
									</p>
								</article>
							))}
						</div>
					</section>
				))}

				{active && (
					<div className="rounded-ds-3 border border-warning/20 bg-warning/5 px-3 py-3 text-[11px] text-fg-mute">
						双方正在并行生成本轮观点。收齐后会同时交换给对方。
					</div>
				)}

				{run.status === "completed" && (
					<section className="rounded-ds-3 border border-border bg-background p-3">
						<div className="text-[10px] font-medium text-success">
							结果已返回发起 Agent
						</div>
						<h3 className="mt-1.5 text-xs font-medium text-fg">双方最终立场</h3>
						<div className="mt-2 space-y-2">
							{run.finalPositions.map((position) => (
								<details key={position.sessionId} open={showDetails}>
									<summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium text-fg">
										<LuChevronRight className="size-3 text-fg-mute" />
										{participantName(run, position.sessionId)}
									</summary>
									<p className="mt-1 whitespace-pre-wrap pl-4 text-[11px] leading-[1.7] text-fg-mute">
										{position.response}
									</p>
								</details>
							))}
						</div>
						<Button
							variant="ghost"
							size="sm"
							className="mt-2 h-6 px-1.5 text-[10px]"
							onClick={() => setShowDetails((current) => !current)}
						>
							{showDetails ? "折叠原文" : "展开双方原文"}
						</Button>
					</section>
				)}

				{run.failureMessage && (
					<div className="mt-2 text-[11px] text-destructive">
						{run.failureMessage}
					</div>
				)}
			</div>
		</div>
	);
}

export function DiscussionView({
	workspaceId,
}: {
	workspaceId: string | null;
}) {
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const query = useQuery({
		queryKey: ["acp-discussions", hostUrl, workspaceId],
		enabled: Boolean(hostUrl && workspaceId),
		queryFn: async () => {
			if (!hostUrl || !workspaceId) return [];
			return getHostServiceClientByUrl(
				hostUrl,
			).acpSessions.listDiscussionRuns.query({ workspaceId, limit: 20 });
		},
		refetchInterval: 1_000,
	});
	const runs = query.data ?? [];
	const selected = runs[0];

	if (!workspaceId) {
		return (
			<div className="p-4 text-xs text-fg-mute">选择工作区后查看讨论。</div>
		);
	}
	if (query.isLoading) {
		return <div className="p-4 text-xs text-fg-mute">正在加载讨论…</div>;
	}
	if (!selected) {
		return (
			<div className="flex h-full items-center justify-center px-5 text-center text-xs leading-5 text-fg-mute">
				Agent 发起讨论后，双方的实时观点和最终结果会显示在这里。
			</div>
		);
	}

	return (
		<DiscussionRunView
			run={selected}
			onStop={() => {
				if (!hostUrl) return;
				void getHostServiceClientByUrl(hostUrl)
					.acpSessions.stopDiscussionRun.mutate({ runId: selected.id })
					.then(() => query.refetch());
			}}
		/>
	);
}
