/**
 * Contract test for `createWorkspaceOnHost` — verifies the M3 cut-over
 * from `workspaces.create` to `workspaceProvisioning.begin`.
 *
 * We intercept the outbound `relayMutation` call by stubbing the global
 * `fetch`, then assert:
 *   1. the tRPC procedure path is `workspaceProvisioning.begin`
 *   2. the SuperJSON-decoded body carries the expected
 *      `ProvisionWorkspaceRequest` shape with idempotencyKey scoped
 *      `automation-run:<runId>:workspace`
 *   3. a `succeeded` operation response is unwrapped into
 *      `{ workspaceId, branchName }`
 *   4. a `failed` response surfaces the runner's failure message
 */
import { afterEach, describe, expect, test } from "bun:test";
import type { SelectAutomation } from "@superset/db/schema";
import SuperJSON from "superjson";
import { createWorkspaceOnHost } from "./dispatch";

function fakeAutomation(): SelectAutomation {
	const now = new Date();
	return {
		id: "00000000-0000-0000-0000-00000000000a",
		organizationId: "00000000-0000-0000-0000-00000000000b",
		ownerUserId: "00000000-0000-0000-0000-00000000000c",
		name: "Nightly checks",
		prompt: "Run nightly",
		agent: "claude-code",
		targetHostId: "host-1",
		v2ProjectId: "00000000-0000-0000-0000-00000000000d",
		v2WorkspaceId: null,
		rrule: "FREQ=DAILY",
		dtstart: now,
		timezone: "UTC",
		enabled: true,
		mcpScope: [],
		nextRunAt: now,
		createdAt: now,
		updatedAt: now,
	};
}

interface RecordedRequest {
	url: string;
	body: unknown;
	rawBody: string;
}

function installFetchStub(
	handler: (req: RecordedRequest) => { status: number; body: unknown },
): { recorded: RecordedRequest[]; restore: () => void } {
	const original = globalThis.fetch;
	const recorded: RecordedRequest[] = [];
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : input.toString();
		const rawBody =
			typeof init?.body === "string" ? init.body : String(init?.body ?? "");
		let body: unknown = null;
		try {
			body = SuperJSON.deserialize(JSON.parse(rawBody));
		} catch {
			body = null;
		}
		const req: RecordedRequest = { url, body, rawBody };
		recorded.push(req);
		const { status, body: outBody } = handler(req);
		const serialized = SuperJSON.serialize(outBody);
		const envelope = { result: { data: serialized } };
		return new Response(JSON.stringify(envelope), {
			status,
			headers: { "content-type": "application/json" },
		});
	}) as typeof fetch;
	return {
		recorded,
		restore: () => {
			globalThis.fetch = original;
		},
	};
}

describe("automation dispatch → workspaceProvisioning.begin (M3)", () => {
	let restoreFetch: (() => void) | undefined;
	afterEach(() => {
		restoreFetch?.();
		restoreFetch = undefined;
	});

	test("succeeded operation → returns { workspaceId, branchName }", async () => {
		const stub = installFetchStub(() => ({
			status: 200,
			body: {
				operationId: "op-1",
				operation: {
					id: "op-1",
					state: "succeeded",
					workspaceId: "ws-1",
				},
			},
		}));
		restoreFetch = stub.restore;

		const result = await createWorkspaceOnHost({
			relayUrl: "https://relay.example",
			hostId: "host-x",
			jwt: "jwt-token",
			projectId: "00000000-0000-0000-0000-00000000000d",
			automation: fakeAutomation(),
			runId: "00000000-0000-0000-0000-0000000000ff",
		});
		expect(result.workspaceId).toBe("ws-1");
		expect(typeof result.branchName).toBe("string");
		expect(result.branchName.length).toBeGreaterThan(0);

		expect(stub.recorded).toHaveLength(1);
		const call = stub.recorded[0];
		expect(call.url.endsWith("/workspaceProvisioning.begin")).toBe(true);
		const body = call.body as Record<string, unknown>;
		expect(body.idempotencyKey).toBe(
			"automation-run:00000000-0000-0000-0000-0000000000ff:workspace",
		);
		expect(body.project).toEqual({
			kind: "existing",
			projectId: "00000000-0000-0000-0000-00000000000d",
		});
		const source = body.source as Record<string, unknown>;
		expect(source.kind).toBe("branch");
		expect((source.name as { kind: string }).kind).toBe("explicit");
	});

	test("failed operation → propagates failure message", async () => {
		const stub = installFetchStub(() => ({
			status: 200,
			body: {
				operationId: "op-2",
				operation: {
					id: "op-2",
					state: "failed",
					failure: {
						code: "RESOURCE_BUSY",
						message: "identity busy",
						retryable: true,
					},
				},
			},
		}));
		restoreFetch = stub.restore;

		await expect(
			createWorkspaceOnHost({
				relayUrl: "https://relay.example",
				hostId: "host-x",
				jwt: "jwt-token",
				projectId: "00000000-0000-0000-0000-00000000000d",
				automation: fakeAutomation(),
				runId: "00000000-0000-0000-0000-0000000000fe",
			}),
		).rejects.toThrow(/identity busy/);
	});

	test("does NOT call legacy workspaces.create", async () => {
		const stub = installFetchStub(() => ({
			status: 200,
			body: {
				operationId: "op-3",
				operation: {
					id: "op-3",
					state: "succeeded",
					workspaceId: "ws-3",
				},
			},
		}));
		restoreFetch = stub.restore;

		await createWorkspaceOnHost({
			relayUrl: "https://relay.example",
			hostId: "host-x",
			jwt: "jwt-token",
			projectId: "00000000-0000-0000-0000-00000000000d",
			automation: fakeAutomation(),
			runId: "00000000-0000-0000-0000-0000000000fd",
		});
		expect(stub.recorded.some((c) => c.url.includes("workspaces.create"))).toBe(
			false,
		);
		expect(
			stub.recorded.every((c) => c.url.includes("workspaceProvisioning.begin")),
		).toBe(true);
	});
});
