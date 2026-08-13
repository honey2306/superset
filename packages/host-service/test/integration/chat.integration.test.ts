import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { TRPCClientError } from "@trpc/client";
import { createTestHost, type TestHost } from "../helpers/createTestHost";

describe("chat router integration with stub ChatRuntimeManager", () => {
	let host: TestHost;
	const calls: Array<{ method: string; args: unknown }> = [];

	const stubChatRuntime = {
		getDisplayState: (input: unknown) => {
			calls.push({ method: "getDisplayState", args: input });
			return { running: false };
		},
		listMessages: async (input: unknown) => {
			calls.push({ method: "listMessages", args: input });
			return [];
		},
		getSnapshot: async (input: unknown) => {
			calls.push({ method: "getSnapshot", args: input });
			return { messages: [], displayState: { running: false } };
		},
		sendMessage: async (input: unknown) => {
			calls.push({ method: "sendMessage", args: input });
			return { ok: true };
		},
		disposeRuntime: async (sessionId: string, workspaceId: string) => {
			calls.push({
				method: "disposeRuntime",
				args: { sessionId, workspaceId },
			});
		},
		restartFromMessage: async (input: unknown) => {
			calls.push({ method: "restartFromMessage", args: input });
			return { ok: true };
		},
		stop: async (input: unknown) => {
			calls.push({ method: "stop", args: input });
			return { ok: true };
		},
		respondToApproval: async (input: unknown) => {
			calls.push({ method: "respondToApproval", args: input });
			return { ok: true };
		},
		respondToQuestion: async (input: unknown) => {
			calls.push({ method: "respondToQuestion", args: input });
			return { ok: true };
		},
		respondToPlan: async (input: unknown) => {
			calls.push({ method: "respondToPlan", args: input });
			return { ok: true };
		},
		searchFiles: async (input: unknown) => {
			calls.push({ method: "searchFiles", args: input });
			return [];
		},
		getSlashCommands: async (input: unknown) => {
			calls.push({ method: "getSlashCommands", args: input });
			return [];
		},
		resolveSlashCommand: async (input: unknown) => {
			calls.push({ method: "resolveSlashCommand", args: input });
			return { resolved: null };
		},
		previewSlashCommand: async (input: unknown) => {
			calls.push({ method: "previewSlashCommand", args: input });
			return { handled: false };
		},
		getMcpOverview: async (input: unknown) => {
			calls.push({ method: "getMcpOverview", args: input });
			return { sourcePath: null, servers: [] };
		},
	};

	const sessionId = randomUUID();
	const workspaceId = randomUUID();

	beforeEach(async () => {
		calls.length = 0;
		host = await createTestHost({
			chatRuntime: stubChatRuntime,
		});
	});

	afterEach(async () => {
		await host.dispose();
	});

	test("getDisplayState delegates with sessionId+workspaceId", async () => {
		await host.trpc.chat.getDisplayState.query({ sessionId, workspaceId });
		expect(calls[0]).toMatchObject({
			method: "getDisplayState",
			args: { sessionId, workspaceId },
		});
	});

	test("listMessages delegates", async () => {
		const result = await host.trpc.chat.listMessages.query({
			sessionId,
			workspaceId,
		});
		expect(result).toEqual([]);
		expect(calls[0].method).toBe("listMessages");
	});

	test("getSnapshot delegates", async () => {
		await host.trpc.chat.getSnapshot.query({ sessionId, workspaceId });
		expect(calls[0].method).toBe("getSnapshot");
	});

	test("sendMessage delegates without calling the cloud API", async () => {
		await host.trpc.chat.sendMessage.mutate({
			sessionId,
			workspaceId,
			payload: { content: "hello" },
		});
		expect(calls[0].method).toBe("sendMessage");
		expect(host.apiCalls).toEqual([]);
	});

	test("endSession delegates to disposeRuntime and returns ok", async () => {
		const result = await host.trpc.chat.endSession.mutate({
			sessionId,
			workspaceId,
		});
		expect(result).toEqual({ ok: true });
		expect(calls[0]).toMatchObject({
			method: "disposeRuntime",
			args: { sessionId, workspaceId },
		});
	});

	test("respondToApproval validates decision enum", async () => {
		await host.trpc.chat.respondToApproval.mutate({
			sessionId,
			workspaceId,
			payload: { decision: "approve" },
		});
		expect(calls[0].method).toBe("respondToApproval");

		await expect(
			host.trpc.chat.respondToApproval.mutate({
				sessionId,
				workspaceId,
				// biome-ignore lint/suspicious/noExplicitAny: testing zod rejection
				payload: { decision: "garbage" as any },
			}),
		).rejects.toBeInstanceOf(TRPCClientError);
	});

	test("workspace support APIs delegate with workspaceId instead of cwd", async () => {
		await host.trpc.chat.searchFiles.query({
			workspaceId,
			query: "readme",
			includeHidden: false,
			limit: 10,
		});
		expect(calls[0]).toMatchObject({
			method: "searchFiles",
			args: { workspaceId, query: "readme", includeHidden: false, limit: 10 },
		});

		await host.trpc.chat.getSlashCommands.query({ workspaceId });
		expect(calls[1]).toMatchObject({
			method: "getSlashCommands",
			args: { workspaceId },
		});

		await host.trpc.chat.resolveSlashCommand.mutate({
			workspaceId,
			text: "/foo bar",
		});
		expect(calls[2]).toMatchObject({
			method: "resolveSlashCommand",
			args: { workspaceId, text: "/foo bar" },
		});

		await host.trpc.chat.previewSlashCommand.query({
			workspaceId,
			text: "/foo",
		});
		await host.trpc.chat.getMcpOverview.query({ workspaceId });
		expect(calls[3].method).toBe("previewSlashCommand");
		expect(calls[4]).toMatchObject({
			method: "getMcpOverview",
			args: { workspaceId },
		});
	});

	test("requires authentication", async () => {
		await expect(
			host.unauthenticatedTrpc.chat.getDisplayState.query({
				sessionId,
				workspaceId,
			}),
		).rejects.toBeInstanceOf(TRPCClientError);
	});
});
