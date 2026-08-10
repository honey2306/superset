import { describe, expect, mock, test } from "bun:test";

mock.module("renderer/lib/trpc-client", () => ({
	electronTrpcClient: { notifications: { showNative: { mutate: mock() } } },
}));
mock.module("renderer/providers/I18nProvider", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));
mock.module(import.meta.resolve("../useLocalAutomationData"), () => ({
	useLocalTodos: () => ({ data: [] }),
}));

const { notifyAndMarkTodo } = await import("./useTodoNotifier");

describe("notifyAndMarkTodo", () => {
	test("marks the local todo notified after the native notification succeeds", async () => {
		const notify = mock(async () => undefined);
		const markNotified = mock(async () => undefined);

		await notifyAndMarkTodo(
			{ id: "todo-1", title: "Due reminder", note: "Check this" },
			{ title: "Due: Due reminder", notify, markNotified },
		);

		expect(notify).toHaveBeenCalledWith({
			title: "Due: Due reminder",
			body: "Check this",
			silent: false,
		});
		expect(markNotified).toHaveBeenCalledWith({ id: "todo-1" });
	});

	test("does not mark the todo when the native notification fails", async () => {
		const notify = mock(async () => {
			throw new Error("native notifications unavailable");
		});
		const markNotified = mock(async () => undefined);

		await expect(
			notifyAndMarkTodo(
				{ id: "todo-1", title: "Due reminder", note: null },
				{ title: "Due: Due reminder", notify, markNotified },
			),
		).rejects.toThrow("native notifications unavailable");
		expect(markNotified).not.toHaveBeenCalled();
	});
});
