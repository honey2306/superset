import { describe, expect, it } from "bun:test";
import { createAuthenticatedElectricFetch } from "./authenticated-electric-fetch";

describe("createAuthenticatedElectricFetch", () => {
	it("refreshes once and retries the first 401 with credentials", async () => {
		const requests: RequestInit[] = [];
		const responses = [new Response(null, { status: 401 }), new Response("ok")];
		let refreshes = 0;
		const preconnect = (() => {}) satisfies typeof fetch.preconnect;
		const fetchImpl: typeof fetch = Object.assign(
			async (_input: RequestInfo | URL, init?: RequestInit) => {
				requests.push(init ?? {});
				return responses.shift() ?? new Response(null, { status: 500 });
			},
			{ preconnect },
		);
		const electricFetch = createAuthenticatedElectricFetch({
			fetchImpl,
			getToken: () => "refreshed-token",
			refreshJwt: async () => {
				refreshes++;
			},
		});

		const response = await electricFetch("http://localhost:3000/v1/shape", {
			headers: { Authorization: "Bearer stale-token" },
		});

		expect(response.status).toBe(200);
		expect(refreshes).toBe(1);
		expect(requests.map((request) => request.credentials)).toEqual([
			"include",
			"include",
		]);
		expect(requests.map((request) => request.cache)).toEqual([
			"no-store",
			"no-store",
		]);
		expect(
			requests.map((request) =>
				new Headers(request.headers).get("Authorization"),
			),
		).toEqual(["Bearer stale-token", "Bearer refreshed-token"]);
	});

	it("does not refresh or retry non-401 responses", async () => {
		let requests = 0;
		let refreshes = 0;
		let preconnects = 0;
		const preconnect = (() => {
			preconnects++;
		}) satisfies typeof fetch.preconnect;
		const fetchImpl: typeof fetch = Object.assign(
			async () => {
				requests++;
				return new Response(null, { status: 403 });
			},
			{ preconnect },
		);
		const electricFetch = createAuthenticatedElectricFetch({
			fetchImpl,
			refreshJwt: async () => {
				refreshes++;
			},
		});

		const response = await electricFetch("http://localhost:3000/v1/shape");

		expect(response.status).toBe(403);
		expect(requests).toBe(1);
		expect(refreshes).toBe(0);
		electricFetch.preconnect("http://localhost:3000/v1/shape");
		expect(preconnects).toBe(1);
	});
});
