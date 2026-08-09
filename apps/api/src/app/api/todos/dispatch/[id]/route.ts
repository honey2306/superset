import { dbWs } from "@superset/db/client";
import { todos } from "@superset/db/schema";
import { dispatchTodo } from "@superset/trpc/todo-dispatch";
import { Receiver } from "@upstash/qstash";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

const payloadSchema = z.object({
	todoId: z.string().uuid(),
});

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
): Promise<Response> {
	const body = await request.text();
	const signature = request.headers.get("upstash-signature");
	if (!signature) {
		return Response.json({ error: "Missing signature" }, { status: 401 });
	}

	const { id } = await params;
	const valid = await receiver.verify({
		body,
		signature,
		url: `${env.NEXT_PUBLIC_API_URL}/api/todos/dispatch/${id}`,
	});
	if (!valid) {
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	const parsed = payloadSchema.safeParse(JSON.parse(body));
	if (!parsed.success) {
		console.error("[todos/dispatch] invalid payload", parsed.error);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	const [todo] = await dbWs
		.select()
		.from(todos)
		.where(eq(todos.id, parsed.data.todoId))
		.limit(1);

	if (!todo) {
		return Response.json({ ok: true, skipped: "deleted" });
	}
	if (todo.status === "done" || todo.status === "canceled") {
		return Response.json({ ok: true, skipped: todo.status });
	}
	if (todo.mode !== "auto") {
		return Response.json({ ok: true, skipped: "not-auto" });
	}

	const outcome = await dispatchTodo({
		todo,
		relayUrl: env.RELAY_URL,
	});

	return Response.json({ ok: true, outcome });
}
