import { expect, test } from "bun:test";
import superjson from "superjson";
import {
	createAcpSessionsApi,
	createHostClient,
	sessionStreamUrl,
} from "./index";

test("single requests retain fresh credentials and superjson response values", async () => {
	let token = "first";
	const requests: Array<{ url: string; token: string | null }> = [];
	const client = createHostClient({
		endpoint: "https://host.invalid/",
		headers: () => ({ Authorization: `Bearer ${token}` }),
		fetch: async (url, init) => {
			requests.push({
				url: String(url),
				token: new Headers(init?.headers).get("Authorization"),
			});
			return Response.json({
				result: { data: superjson.serialize({ status: "ok" }) },
			});
		},
	});
	expect(await client.health.check.query()).toEqual({ status: "ok" });
	token = "rotated";
	await client.health.check.query();
	expect(requests.map((item) => item.token)).toEqual([
		"Bearer first",
		"Bearer rotated",
	]);
	expect(requests[0]?.url).toContain("https://host.invalid/trpc/health.check");
});
test("shared session commands read the current client on every invocation", async () => {
	const bodies: string[] = [];
	const paths: string[] = [];
	let currentToken = "a";
	const api = createAcpSessionsApi(() =>
		createHostClient({
			endpoint: "http://host.invalid",
			headers: { Authorization: currentToken },
			fetch: async (url, init) => {
				paths.push(new URL(String(url)).pathname);
				bodies.push(String(init?.body));
				return Response.json({
					result: { data: superjson.serialize({ accepted: true }) },
				});
			},
		}),
	);
	await api.prompt({
		sessionId: "s",
		commandId: "durable-id",
		prompt: [{ type: "text", text: "hello" }],
	});
	currentToken = "b";
	await api.cancel({ sessionId: "s" });
	expect(paths).toEqual([
		"/trpc/acpSessions.prompt",
		"/trpc/acpSessions.cancel",
	]);
	expect(bodies[0]).toContain("durable-id");
});
test("stream URLs encode identity and preserve reconnect epoch/cursor", () => {
	const url = new URL(
		sessionStreamUrl("https://host.invalid/", "a/b", {
			token: "a+b",
			since: 0,
			epoch: "old",
		}),
	);
	expect(url.protocol).toBe("wss:");
	expect(url.pathname).toBe("/acp-sessions/a%2Fb/stream");
	expect(url.searchParams.get("token")).toBe("a+b");
	expect(url.searchParams.get("since")).toBe("0");
	expect(url.searchParams.get("epoch")).toBe("old");
});

test.each([
	"single",
	"batch-stream",
] as const)("%s link interoperates with a real tRPC HTTP handler", async (transport) => {
	const { initTRPC } = await import("@trpc/server");
	const { fetchRequestHandler } = await import("@trpc/server/adapters/fetch");
	const t = initTRPC.create({ transformer: superjson });
	const server = t.router({
		health: t.router({
			check: t.procedure.query(() => ({ status: "ok" as const })),
		}),
	});
	const client = createHostClient({
		endpoint: "http://host.invalid",
		transport,
		fetch: (url, init) =>
			fetchRequestHandler({
				endpoint: "/trpc",
				req: new Request(String(url), init),
				router: server,
				createContext: () => ({}),
			}),
	});
	expect(
		await Promise.all([
			client.health.check.query(),
			client.health.check.query(),
		]),
	).toEqual([{ status: "ok" }, { status: "ok" }]);
});
