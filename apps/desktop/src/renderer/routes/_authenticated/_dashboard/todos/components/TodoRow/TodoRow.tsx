import type { SelectTodo } from "@superset/db/schema";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useMutation } from "@tanstack/react-query";
import { LuCheck, LuPlay, LuTrash2, LuTriangleAlert } from "react-icons/lu";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import type { MessageKey } from "renderer/providers/I18nProvider";
import { useTranslation } from "renderer/providers/I18nProvider";

interface TodoRowProps {
	todo: SelectTodo;
	now: Date;
	onDeleteRequest: () => void;
}

function fmtTime(date: Date): string {
	const hh = String(date.getHours()).padStart(2, "0");
	const mm = String(date.getMinutes()).padStart(2, "0");
	return `${hh}:${mm}`;
}

function useDayLabel(date: Date, now: Date): string {
	const { t } = useTranslation();
	const startOf = (d: Date) =>
		new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	const diffDays = Math.round(
		(startOf(date) - startOf(now)) / (24 * 60 * 60 * 1000),
	);
	if (diffDays === 0) return t("todos.dayLabel.today");
	if (diffDays === -1) return t("todos.dayLabel.yesterday");
	if (diffDays === 1) return t("todos.dayLabel.tomorrow");
	return `${date.getMonth() + 1}/${date.getDate()}`;
}

function useRelative(date: Date, now: Date): string {
	const { t } = useTranslation();
	const diffMs = date.getTime() - now.getTime();
	const abs = Math.abs(diffMs);
	const minutes = Math.round(abs / 60000);
	if (minutes < 1) return t("todos.dueRelative.now");
	if (minutes < 60) {
		return diffMs < 0
			? t("todos.dueRelative.minutesAgo", { min: minutes })
			: t("todos.dueRelative.minutesLeft", { min: minutes });
	}
	const hours = Math.round(minutes / 60);
	if (hours < 24) {
		return diffMs < 0
			? t("todos.dueRelative.hoursAgo", { hour: hours })
			: t("todos.dueRelative.hoursLeft", { hour: hours });
	}
	const days = Math.round(hours / 24);
	return diffMs < 0
		? t("todos.dueRelative.daysAgo", { day: days })
		: t("todos.dueRelative.daysLeft", { day: days });
}

function statusDotClass(
	status: SelectTodo["status"],
	isOverdue: boolean,
): string {
	if (status === "dispatch_failed" || status === "skipped_offline") {
		return "bg-destructive";
	}
	if (status === "dispatching") return "bg-info-tint animate-pulse";
	if (status === "dispatched") return "bg-success-tint";
	if (isOverdue) return "bg-destructive";
	if (status === "notified") return "bg-warning";
	return "bg-fg-mute/40";
}

const STATUS_LABEL_KEYS: Partial<Record<SelectTodo["status"], MessageKey>> = {
	dispatching: "todos.statusDispatching",
	dispatched: "todos.statusDispatched",
	skipped_offline: "todos.statusSkippedOffline",
	dispatch_failed: "todos.statusDispatchFailed",
};

export function TodoRow({ todo, now, onDeleteRequest }: TodoRowProps) {
	const { t } = useTranslation();

	const dueDate = new Date(todo.dueAt as unknown as string);
	const dayLabel = useDayLabel(dueDate, now);
	const relative = useRelative(dueDate, now);
	const isOverdue =
		dueDate.getTime() < now.getTime() &&
		todo.status !== "done" &&
		todo.status !== "dispatched";
	const isFailed =
		todo.status === "dispatch_failed" || todo.status === "skipped_offline";
	const statusLabelKey = STATUS_LABEL_KEYS[todo.status];

	const runNowMutation = useMutation({
		mutationFn: () => apiTrpcClient.todo.runNow.mutate({ id: todo.id }),
		onError: (error) => {
			toast.error(
				t("todos.runFailed", {
					message: error instanceof Error ? error.message : "unknown",
				}),
			);
		},
	});

	const completeMutation = useMutation({
		mutationFn: () => apiTrpcClient.todo.complete.mutate({ id: todo.id }),
		onSuccess: () => toast.success(t("todos.completed")),
		onError: (error) => {
			toast.error(error instanceof Error ? error.message : "unknown");
		},
	});

	return (
		<li className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-hover">
			<span
				aria-hidden
				className={cn(
					"inline-block size-2 shrink-0 rounded-full",
					statusDotClass(todo.status, isOverdue),
				)}
			/>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<div className="flex items-center gap-2">
					<span className="truncate text-sm font-medium">{todo.title}</span>
					<ModePill mode={todo.mode} />
					{statusLabelKey && (
						<span className="font-mono text-[10px] uppercase tracking-wide text-fg-mute">
							{t(statusLabelKey)}
						</span>
					)}
				</div>
				<div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-fg-mute">
					<span className="font-mono">
						{dayLabel} · {fmtTime(dueDate)}
					</span>
					<span
						className={cn(
							"font-mono text-[11px]",
							isOverdue ? "text-destructive" : "text-fg-faint",
						)}
					>
						{relative}
					</span>
					{todo.agent && (
						<span className="truncate text-[11px]">· {todo.agent}</span>
					)}
					{todo.note && (
						<span className="max-w-md truncate text-[11px] text-fg-faint">
							{todo.note}
						</span>
					)}
					{todo.error && (
						<span className="inline-flex select-text cursor-text items-center gap-1 text-[11px] text-destructive">
							<LuTriangleAlert className="size-3" />
							{todo.error}
						</span>
					)}
				</div>
			</div>

			<div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
				{todo.mode === "auto" && !isFailed && (
					<Button
						disabled={runNowMutation.isPending}
						onClick={() => runNowMutation.mutate()}
						size="sm"
						title={t("todos.runNow")}
						type="button"
						variant="ghost"
					>
						<LuPlay className="size-3.5" />
					</Button>
				)}
				<Button
					disabled={completeMutation.isPending}
					onClick={() => completeMutation.mutate()}
					size="sm"
					title={t("todos.complete")}
					type="button"
					variant="ghost"
				>
					<LuCheck className="size-3.5" />
				</Button>
				<Button
					onClick={onDeleteRequest}
					size="sm"
					title={t("todos.delete")}
					type="button"
					variant="ghost"
				>
					<LuTrash2 className="size-3.5" />
				</Button>
			</div>
		</li>
	);
}

function ModePill({ mode }: { mode: SelectTodo["mode"] }) {
	const isAuto = mode === "auto";
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-full px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide",
				isAuto
					? "bg-accent-tint text-accent-solid"
					: "bg-hover/50 text-fg-mute",
			)}
		>
			{isAuto ? "AUTO" : "REMIND"}
		</span>
	);
}
