import { useEffect, useRef } from "react";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useLocalTodos } from "../useLocalAutomationData";

type TodoNotification = {
	id: string;
	title: string;
	note: string | null;
};

export async function notifyAndMarkTodo(
	todo: TodoNotification,
	args: {
		title: string;
		notify: (input: {
			title: string;
			body: string;
			silent: boolean;
		}) => Promise<unknown>;
		markNotified: (input: { id: string }) => Promise<unknown>;
	},
): Promise<void> {
	await args.notify({
		title: args.title,
		body: todo.note ?? "",
		silent: false,
	});
	await args.markNotified({ id: todo.id });
}

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
	const hostUrl = useHostUrl(null);
	const notifiedLocallyRef = useRef<Set<string>>(new Set());
	const { data: rows = [] } = useLocalTodos();

	useEffect(() => {
		if (!hostUrl) return;
		const alerts = rows.filter(
			(r): r is NonNullable<typeof r> =>
				r != null &&
				r.status === "notified" &&
				!r.notifiedAt &&
				!r.doneAt &&
				!notifiedLocallyRef.current.has(r.id),
		);

		for (const todo of alerts) {
			notifiedLocallyRef.current.add(todo.id);
			void (async () => {
				try {
					await notifyAndMarkTodo(todo, {
						title: t("todos.notificationTitle", { title: todo.title }),
						notify: (input) =>
							electronTrpcClient.notifications.showNative.mutate(input),
						markNotified: (input) =>
							getHostServiceClientByUrl(hostUrl).todos.markNotified.mutate(
								input,
							),
					});
				} catch (error) {
					console.error("[todo-notifier] failed to notify", error);
					notifiedLocallyRef.current.delete(todo.id);
				}
			})();
		}
	}, [hostUrl, rows, t]);
}
