import { describe, expect, it } from "bun:test";
import { authenticatedTrpcFetch } from "./authenticated-trpc-fetch";

describe("authenticatedTrpcFetch", () => {
	it("includes Better Auth cookies without replacing bearer headers", async () => {
		const requests: RequestInit[] = [];
		const fetchImpl = Object.assign(
			async (_input: RequestInfo | URL, init?: RequestInit) => {
				requests.push(init ?? {});
				return new Response();
			},
			{ preconnect: () => {} },
		) as typeof fetch;

		await authenticatedTrpcFetch(
			"http://localhost:3001/api/trpc",
			{
				headers: { Authorization: "Bearer renderer-token" },
			},
			fetchImpl,
		);

		expect(requests).toEqual([
			{
				credentials: "include",
				headers: { Authorization: "Bearer renderer-token" },
			},
		]);
	});
});
