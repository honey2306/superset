import type { SelectTodo } from "@superset/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useRef } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

/**
 * Renderer-side todo notifier: watches the `todos` collection for rows that
 * hit `status === "notified"` without a prior `notifiedAt` timestamp, fires an
 * OS notification via the main process, then marks them notified in the DB so
 * we don't repeat.
 *
 * Mount this once from the dashboard layout so it runs whenever the desktop
 * app is open, independent of whether the user is on the todos page. If the
 * app is closed at the due moment, the notified status persists and the user
 * still sees the badge and status the next time they open the app.
 */
export function useTodoNotifier(): void {
	const { t } = useTranslation();
	const collections = useCollections();
	const notifiedLocallyRef = useRef<Set<string>>(new Set());

	const { data: rows = [] } = useLiveQuery(
		(q) =>
			q.from({ t: collections.todos }).select(({ t }) => ({
				id: t.id,
				title: t.title,
				note: t.note,
				status: t.status,
				notifiedAt: t.notifiedAt,
				doneAt: t.doneAt,
			})),
		[collections.todos],
	);

	useEffect(() => {
		const alerts = rows.filter(
			(r): r is NonNullable<typeof r> =>
				r != null &&
				r.status === "notified" &&
				!r.notifiedAt &&
				!r.doneAt &&
				!notifiedLocallyRef.current.has(r.id),
		) as Array<Pick<SelectTodo, "id" | "title" | "note" | "status">>;

		for (const todo of alerts) {
			notifiedLocallyRef.current.add(todo.id);
			void (async () => {
				try {
					await electronTrpcClient.notifications.showNative.mutate({
						title: t("todos.notificationTitle", { title: todo.title }),
						body: todo.note ?? "",
						silent: false,
					});
					await apiTrpcClient.todo.markNotified.mutate({ id: todo.id });
				} catch (error) {
					console.error("[todo-notifier] failed to notify", error);
					notifiedLocallyRef.current.delete(todo.id);
				}
			})();
		}
	}, [rows, t]);
}
