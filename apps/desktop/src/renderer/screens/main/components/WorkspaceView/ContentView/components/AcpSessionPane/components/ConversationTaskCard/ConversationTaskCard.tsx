import { isTaskTerminal } from "@superset/shared/tasks";
import {
	ChevronDown,
	ExternalLink,
	MessageSquare,
	Pause,
	Play,
	ShieldCheck,
	Target,
	X,
} from "lucide-react";
import { useId, useState } from "react";
import { TaskStatusBadge } from "renderer/components/TaskStatusBadge";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { ConversationTaskController } from "../../hooks/useConversationTask";

/** Compact task projection. One timeline and one composer continue to own chat. */
export function ConversationTaskCard({
	task,
}: {
	task: ConversationTaskController;
}) {
	const { t } = useTranslation();
	const [expanded, setExpanded] = useState(false);
	const id = useId();
	const run = task.run;
	const action = (kind: Parameters<typeof task.control>[0]) =>
		void task.control(kind).catch(() => {});
	if (!run && !task.error && !task.query.error) return null;
	const ended = run ? isTaskTerminal(run.status) : false;
	return (
		<section
			data-testid="conversation-task-card"
			className="acp-task-card"
			data-released={!task.owned}
			aria-label={t("taskChat.status")}
		>
			{(task.error || task.query.error) && (
				<div className="acp-task-card__error">
					<p role="alert" className="select-text cursor-text">
						{task.error || t("taskChat.loadError")}
					</p>
					<button type="button" onClick={() => void task.query.refetch()}>
						{t("taskChat.retry")}
					</button>
				</div>
			)}
			{run && (
				<>
					<div className="acp-task-card__bar">
						<button
							type="button"
							className="acp-task-card__toggle"
							aria-expanded={expanded}
							aria-controls={id}
							onClick={() => setExpanded((value) => !value)}
							aria-label={t(
								expanded ? "taskUi.hideDetails" : "taskUi.viewDetails",
							)}
						>
							<Target className="acp-task-card__icon" aria-hidden />
							<span className="acp-task-card__title">
								{task.data?.task.title ?? run.contract.goal}
							</span>
							<ChevronDown
								aria-hidden
								className="acp-task-card__chevron"
								data-open={expanded}
							/>
						</button>
						<TaskStatusBadge status={run.status} />
						<div className="acp-task-card__actions">
							{task.owned && !ended && (
								<>
									<button
										type="button"
										className="acp-task-card__action"
										aria-label={t(
											run.status === "paused"
												? "taskChat.resume"
												: "taskChat.pause",
										)}
										title={t(
											run.status === "paused"
												? "taskChat.resume"
												: "taskChat.pause",
										)}
										disabled={task.busy || task.blocked}
										onClick={() =>
											action(run.status === "paused" ? "resume" : "pause")
										}
									>
										{run.status === "paused" ? (
											<Play aria-hidden />
										) : (
											<Pause aria-hidden />
										)}
									</button>
									<button
										type="button"
										className="acp-task-card__action"
										aria-label={t("taskChat.cancel")}
										title={t("taskChat.cancel")}
										disabled={task.busy || run.status === "cancelling"}
										onClick={() => action("cancel")}
									>
										<X aria-hidden />
									</button>
								</>
							)}
							{task.owned && run.status === "awaiting_review" && (
								<button
									type="button"
									className="acp-task-card__primary"
									disabled={task.busy}
									onClick={() => action("accept")}
								>
									<ShieldCheck aria-hidden />
									{t("taskChat.accept")}
								</button>
							)}
							{task.owned && ended && (
								<button
									type="button"
									className="acp-task-card__primary"
									disabled={task.busy}
									onClick={() => action("release")}
								>
									<MessageSquare aria-hidden />
									{t("taskChat.backToChat")}
								</button>
							)}
						</div>
					</div>
					{task.owned && !ended && (
						<div className="acp-task-card__subline">
							<span>{t(`agentTasks.phase.${run.phase}`)}</span>
							{run.continuationCount > 0 && (
								<span>
									{t("taskChat.continueCount", {
										count: run.continuationCount,
									})}
								</span>
							)}
							<span className="acp-task-card__subline-spacer" />
							<a
								href={`#/agent-tasks?taskId=${encodeURIComponent(run.taskId)}`}
							>
								{t("taskChat.overview")}
								<ExternalLink aria-hidden />
							</a>
						</div>
					)}
					{run.reason &&
						["blocked", "failed", "recovering"].includes(run.status) && (
							<p className="acp-task-card__notice select-text cursor-text">
								{run.reason}
							</p>
						)}
					<div id={id} hidden={!expanded} className="acp-task-card__details">
						<div className="flex items-center justify-between">
							<span className="text-xs font-medium">
								{t("taskChat.details")}
							</span>
							<a
								className="text-xs text-muted-foreground underline underline-offset-4"
								href={`#/agent-tasks?taskId=${encodeURIComponent(run.taskId)}`}
							>
								{t("taskChat.overview")}
							</a>
						</div>
						<p className="select-text cursor-text whitespace-pre-wrap text-xs leading-6">
							{run.contract.goal}
						</p>
						{run.contract.acceptance && (
							<p className="select-text cursor-text whitespace-pre-wrap text-xs text-muted-foreground">
								{run.contract.acceptance}
							</p>
						)}
						<h4 className="text-xs font-medium">{t("taskChat.coverage")}</h4>
						<p className="text-[11px] text-muted-foreground">
							{t("taskChat.claimed")}
						</p>
						{!run.candidate?.criteria?.length && (
							<p className="text-xs text-muted-foreground">
								{t("taskChat.noCoverage")}
							</p>
						)}
						{run.candidate?.criteria?.map((item) => (
							<div key={item.id} className="acp-task-card__criterion">
								<div className="flex flex-wrap items-center gap-2">
									<strong className="text-xs font-medium">{item.id}</strong>
									<span className="text-[11px] text-muted-foreground">
										{t(
											item.status === "satisfied"
												? "taskChat.criterionSatisfied"
												: item.status === "unfinished"
													? "taskChat.criterionUnfinished"
													: "taskChat.criterionUnverified",
										)}
									</span>
								</div>
								<p className="mt-1 select-text cursor-text whitespace-pre-wrap text-xs leading-5">
									{item.evidence}
								</p>
								{item.checkIds.length > 0 && (
									<p className="mt-1 font-mono text-[10px] text-muted-foreground">
										{item.checkIds.join(", ")}
									</p>
								)}
							</div>
						))}
						{task.data?.checks.map((check) => (
							<details
								key={check.id}
								className="rounded-md border p-2.5 text-xs"
							>
								<summary className="cursor-pointer">
									{t(`agentTasks.checkStatus.${check.status}`)} · {check.name}
								</summary>
								<pre className="mt-2 max-h-40 select-text cursor-text overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2">
									{check.command}
									{"\n"}
									{check.output}
								</pre>
							</details>
						))}
					</div>
				</>
			)}
		</section>
	);
}
