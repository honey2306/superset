import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { TRPCClientError } from "@trpc/client";
import { createTestHost, type TestHost } from "../helpers/createTestHost";

describe("provider auth and usage host contracts", () => {
	let host: TestHost;
	const calls: string[] = [];
	const providerAuthService = {
		getAnthropicAuthStatus: async () => {
			calls.push("getAnthropicAuthStatus");
			return {
				authenticated: true,
				method: "api_key",
				source: "managed",
				issue: null,
			};
		},
		consumeOpenAIOAuthCallback: () => {
			calls.push("consumeOpenAIOAuthCallback");
			return { callbackUrl: "http://127.0.0.1/callback" };
		},
		getCodexUsage: async () => {
			calls.push("getCodexUsage");
			return { available: false, reason: "not_authenticated" };
		},
	};

	beforeEach(async () => {
		calls.length = 0;
		host = await createTestHost({ providerAuthService });
	});

	afterEach(async () => {
		await host.dispose();
	});

	test("serves provider auth, OAuth callback, and usage through authenticated loopback tRPC", async () => {
		expect(await host.trpc.auth.getAnthropicStatus.query()).toMatchObject({
			authenticated: true,
		});
		expect(await host.trpc.auth.consumeOpenAIOAuthCallback.query()).toEqual({
			callbackUrl: "http://127.0.0.1/callback",
		});
		expect(await host.trpc.usage.getCodex.query()).toEqual({
			available: false,
			reason: "not_authenticated",
		});
		expect(calls).toEqual([
			"getAnthropicAuthStatus",
			"consumeOpenAIOAuthCallback",
			"getCodexUsage",
		]);
	});

	test("rejects unauthenticated provider status and usage calls", async () => {
		await expect(
			host.unauthenticatedTrpc.auth.getAnthropicStatus.query(),
		).rejects.toBeInstanceOf(TRPCClientError);
		await expect(
			host.unauthenticatedTrpc.usage.getCodex.query(),
		).rejects.toBeInstanceOf(TRPCClientError);
	});
});
