import * as Sentry from "@sentry/nextjs";
import { dbWs } from "@superset/db/client";
import { todos } from "@superset/db/schema";
import { Receiver } from "@upstash/qstash";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";

export const dynamic = "force-dynamic";

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

const failurePayloadSchema = z.object({
	sourceMessageId: z.string(),
	sourceBody: z.string(),
	status: z.number(),
	error: z.string().optional(),
	retried: z.number().optional(),
});

const sourceBodySchema = z.object({
	todoId: z.string().uuid(),
});

export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const signature = request.headers.get("upstash-signature");
	if (!signature) {
		return Response.json({ error: "Missing signature" }, { status: 401 });
	}

	const valid = await receiver.verify({
		body,
		signature,
		url: `${env.NEXT_PUBLIC_API_URL}/api/todos/run-failed`,
	});
	if (!valid) {
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	let rawBody: unknown;
	try {
		rawBody = JSON.parse(body);
	} catch (err) {
		console.error("[todos/run-failed] invalid JSON", err);
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = failurePayloadSchema.safeParse(rawBody);
	if (!parsed.success) {
		console.error("[todos/run-failed] invalid payload", parsed.error);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	let decoded: unknown;
	try {
		decoded = JSON.parse(
			Buffer.from(parsed.data.sourceBody, "base64").toString("utf-8"),
		);
	} catch (err) {
		console.error("[todos/run-failed] invalid sourceBody JSON", err);
		return Response.json({ error: "Invalid sourceBody JSON" }, { status: 400 });
	}
	const source = sourceBodySchema.safeParse(decoded);
	if (!source.success) {
		console.error("[todos/run-failed] invalid sourceBody", source.error);
		return Response.json({ error: "Invalid sourceBody" }, { status: 400 });
	}

	const { todoId } = source.data;

	const errorText = `delivery failed after retries (status ${parsed.data.status}): ${parsed.data.error ?? "unknown"}`;

	await dbWs
		.update(todos)
		.set({ status: "dispatch_failed", error: errorText })
		.where(eq(todos.id, todoId));

	Sentry.captureException(new Error(`todo dispatch failed: ${todoId}`), {
		tags: { feature: "todos" },
		extra: {
			todoId,
			sourceMessageId: parsed.data.sourceMessageId,
			status: parsed.data.status,
		},
	});

	return Response.json({ ok: true });
}
