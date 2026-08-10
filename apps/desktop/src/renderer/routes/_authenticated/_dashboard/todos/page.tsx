import type { SelectTodo } from "@superset/db/schema";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@superset/ui/empty";
import { Input } from "@superset/ui/input";
import { Kbd } from "@superset/ui/kbd";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useLiveQuery } from "@tanstack/react-db";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { LuListTodo, LuPlus, LuSearch } from "react-icons/lu";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useTodoAlerts } from "renderer/routes/_authenticated/_dashboard/hooks/useTodoAlerts";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { CreateTodoDialog } from "./components/CreateTodoDialog";
import { TodoRow } from "./components/TodoRow";

export const Route = createFileRoute("/_authenticated/_dashboard/todos/")({
	component: TodosPage,
});

type BucketKey = "overdue" | "today" | "week" | "later";

interface BucketMeta {
	key: BucketKey;
	labelKey:
		| "todos.bucketOverdue"
		| "todos.bucketToday"
		| "todos.bucketWeek"
		| "todos.bucketLater";
	dotClass: string;
	pillTextClass: string;
	pillBgClass: string;
}

const BUCKETS: BucketMeta[] = [
	{
		key: "overdue",
		labelKey: "todos.bucketOverdue",
		dotClass: "bg-destructive",
		pillTextClass: "text-destructive",
		pillBgClass: "bg-destructive/10",
	},
	{
		key: "today",
		labelKey: "todos.bucketToday",
		dotClass: "bg-warning",
		pillTextClass: "text-warning",
		pillBgClass: "bg-warning-tint",
	},
	{
		key: "week",
		labelKey: "todos.bucketWeek",
		dotClass: "bg-info",
		pillTextClass: "text-info",
		pillBgClass: "bg-info-tint",
	},
	{
		key: "later",
		labelKey: "todos.bucketLater",
		dotClass: "bg-fg-mute",
		pillTextClass: "text-fg-mute",
		pillBgClass: "bg-hover/40",
	},
];

function bucketOf(todo: SelectTodo, now: Date): BucketKey {
	if (todo.status === "dispatch_failed" || todo.status === "skipped_offline") {
		return "overdue";
	}
	const due = new Date(todo.dueAt as unknown as string);
	if (due.getTime() < now.getTime()) {
		const sameDay =
			due.getFullYear() === now.getFullYear() &&
			due.getMonth() === now.getMonth() &&
			due.getDate() === now.getDate();
		return sameDay ? "today" : "overdue";
	}
	const sameDay =
		due.getFullYear() === now.getFullYear() &&
		due.getMonth() === now.getMonth() &&
		due.getDate() === now.getDate();
	if (sameDay) return "today";
	const diffMs = due.getTime() - now.getTime();
	const diffDays = diffMs / (24 * 60 * 60 * 1000);
	return diffDays <= 7 ? "week" : "later";
}

function TodosPage() {
	const { t } = useTranslation();
	const collections = useCollections();
	const { markAlertsSeen } = useTodoAlerts();

	const [createOpen, setCreateOpen] = useState(false);
	const [pendingDelete, setPendingDelete] = useState<SelectTodo | null>(null);
	const [searchQuery, setSearchQuery] = useState("");

	useEffect(() => {
		markAlertsSeen();
	}, [markAlertsSeen]);

	const { data: rows = [] } = useLiveQuery(
		(q) => q.from({ t: collections.todos }).select(({ t }) => ({ ...t })),
		[collections.todos],
	);

	// Recompute the reference "now" whenever the todo set changes so that
	// bucket assignments and relative labels are fresh at render time.
	// biome-ignore lint/correctness/useExhaustiveDependencies: rows is the intended trigger
	const now = useMemo(() => new Date(), [rows]);

	const visibleTodos = useMemo(() => {
		const q = searchQuery.trim().toLowerCase();
		return (rows as SelectTodo[])
			.filter((todo) => todo.status !== "canceled" && todo.status !== "done")
			.filter((todo) => {
				if (!q) return true;
				const haystack = `${todo.title ?? ""} ${todo.note ?? ""}`.toLowerCase();
				return haystack.includes(q);
			})
			.sort((a, b) => {
				const aTime = new Date(a.dueAt as unknown as string).getTime();
				const bTime = new Date(b.dueAt as unknown as string).getTime();
				return aTime - bTime;
			});
	}, [rows, searchQuery]);

	const grouped = useMemo(() => {
		const groups: Record<BucketKey, SelectTodo[]> = {
			overdue: [],
			today: [],
			week: [],
			later: [],
		};
		for (const todo of visibleTodos) {
			groups[bucketOf(todo, now)].push(todo);
		}
		return groups;
	}, [visibleTodos, now]);

	const totalCount = visibleTodos.length;

	const deleteMutation = useMutation({
		mutationFn: (id: string) => apiTrpcClient.todo.delete.mutate({ id }),
		onSuccess: () => {
			toast.success(t("todos.deleted"));
			setPendingDelete(null);
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : t("workspace.unknownError"),
			);
		},
	});

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden bg-background">
			<header className="border-b border-line bg-surface">
				<div className="flex items-center gap-3 px-6 pt-4 pb-2.5">
					<h1 className="text-lg font-semibold tracking-tight">
						{t("todos.title")}
					</h1>
					<span className="font-mono text-xs text-fg-mute">
						{t("todos.countUnit", { count: totalCount })}
					</span>
					<div className="flex-1" />
					<Button onClick={() => setCreateOpen(true)} size="sm" type="button">
						<LuPlus className="size-3.5" />
						{t("todos.new")}
					</Button>
				</div>

				<div className="flex items-center gap-3 px-6 pb-3">
					<div className="flex flex-wrap items-center gap-1.5">
						{BUCKETS.map((b) => (
							<BucketPill
								key={b.key}
								bucket={b}
								count={grouped[b.key].length}
							/>
						))}
					</div>
					<div className="flex-1" />
					<div className="relative w-64">
						<LuSearch className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-mute" />
						<Input
							className="h-8 rounded-full bg-hover/40 pl-8 pr-14 text-xs"
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder={t("todos.searchPlaceholder")}
							type="search"
							value={searchQuery}
						/>
						<Kbd className="absolute right-2 top-1/2 -translate-y-1/2">⌘K</Kbd>
					</div>
				</div>
			</header>

			<div className="flex flex-1 flex-col overflow-y-auto">
				{totalCount === 0 ? (
					<Empty className="my-auto">
						<EmptyHeader>
							<EmptyMedia>
								<LuListTodo className="size-8 text-fg-mute" />
							</EmptyMedia>
							<EmptyTitle>{t("todos.empty")}</EmptyTitle>
							<EmptyDescription>{t("todos.description")}</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					<div className="flex flex-col gap-6 px-6 py-5">
						{BUCKETS.map((b) => {
							const items = grouped[b.key];
							if (items.length === 0) return null;
							return (
								<section
									aria-label={t(b.labelKey)}
									className="flex flex-col gap-2"
									key={b.key}
								>
									<div className="flex items-center gap-2 px-1">
										<span
											className={cn(
												"inline-block size-1.5 rounded-full",
												b.dotClass,
											)}
										/>
										<span className="text-xs font-semibold uppercase tracking-wide">
											{t(b.labelKey)}
										</span>
										<span className="font-mono text-xs text-fg-mute">
											{items.length}
										</span>
									</div>
									<ul className="flex flex-col divide-y divide-line overflow-hidden rounded-ds-3 border border-line bg-surface">
										{items.map((todo) => (
											<TodoRow
												key={todo.id}
												now={now}
												onDeleteRequest={() => setPendingDelete(todo)}
												todo={todo}
											/>
										))}
									</ul>
								</section>
							);
						})}
					</div>
				)}
			</div>

			<CreateTodoDialog onOpenChange={setCreateOpen} open={createOpen} />

			<AlertDialog
				onOpenChange={(open) => {
					if (!open) setPendingDelete(null);
				}}
				open={!!pendingDelete}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("todos.deleteTitle")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("todos.deleteDescription")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
						<AlertDialogAction
							disabled={deleteMutation.isPending}
							onClick={() => {
								if (pendingDelete) deleteMutation.mutate(pendingDelete.id);
							}}
						>
							{t("todos.delete")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

interface BucketPillProps {
	bucket: BucketMeta;
	count: number;
}

function BucketPill({ bucket, count }: BucketPillProps) {
	const { t } = useTranslation();
	const isEmpty = count === 0;
	return (
		<span
			className={cn(
				"inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs",
				isEmpty ? "bg-hover/30 text-fg-mute" : bucket.pillBgClass,
			)}
		>
			<span
				className={cn(
					"inline-block size-1.5 rounded-full",
					isEmpty ? "bg-fg-mute/50" : bucket.dotClass,
				)}
			/>
			<span className={isEmpty ? "text-fg-mute" : bucket.pillTextClass}>
				{t(bucket.labelKey)}
			</span>
			<span
				className={cn(
					"font-mono font-semibold",
					isEmpty ? "text-fg-mute" : "text-fg",
				)}
			>
				{count}
			</span>
		</span>
	);
}
