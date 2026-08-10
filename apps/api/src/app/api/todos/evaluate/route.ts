import { dbWs } from "@superset/db/client";
import { todos } from "@superset/db/schema";
import { Client, Receiver } from "@upstash/qstash";
import { and, eq, inArray, lte } from "drizzle-orm";

import { env } from "@/env";

export const dynamic = "force-dynamic";

const qstash = new Client({
	token: env.QSTASH_TOKEN,
	baseUrl: env.QSTASH_URL,
});
const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

const BATCH_SIZE = 2000;

export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const signature = request.headers.get("upstash-signature");
	if (!signature) {
		return Response.json({ error: "Missing signature" }, { status: 401 });
	}

	const valid = await receiver.verify({
		body,
		signature,
		url: `${env.NEXT_PUBLIC_API_URL}/api/todos/evaluate`,
	});
	if (!valid) {
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	const now = new Date();
	const due = await dbWs
		.select()
		.from(todos)
		.where(
			and(
				inArray(todos.status, ["pending", "notified"]),
				lte(todos.dueAt, now),
			),
		)
		.orderBy(todos.dueAt)
		.limit(BATCH_SIZE);

	if (due.length === 0) {
		return Response.json({ enqueued: 0, notified: 0 });
	}

	const autoTodos = due.filter(
		(t) => t.mode === "auto" && t.status === "pending",
	);
	const manualToNotify = due.filter(
		(t) => t.mode === "manual" && t.status === "pending",
	);

	if (autoTodos.length > 0) {
		await qstash.batchJSON(
			autoTodos.map((todo) => ({
				url: `${env.NEXT_PUBLIC_API_URL}/api/todos/dispatch/${todo.id}`,
				body: { todoId: todo.id },
				deduplicationId: `todo_${todo.id}`,
				retries: 2,
				failureCallback: `${env.NEXT_PUBLIC_API_URL}/api/todos/run-failed`,
			})),
		);
	}

	if (manualToNotify.length > 0) {
		await Promise.allSettled(
			manualToNotify.map((todo) =>
				dbWs
					.update(todos)
					.set({ status: "notified" })
					.where(eq(todos.id, todo.id)),
			),
		);
	}

	return Response.json({
		enqueued: autoTodos.length,
		notified: manualToNotify.length,
	});
}
