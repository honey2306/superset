import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { JwtApiAuthProvider } from "../providers/auth/JwtAuthProvider/JwtAuthProvider";
import type { ApiClient } from "../types";
import type { TunnelClientOptions } from "./tunnel-client";

const tunnelOptions: TunnelClientOptions[] = [];
const tunnelConnect = mock(async () => {});

mock.module("./tunnel-client", () => ({
	TunnelClient: class {
		constructor(options: TunnelClientOptions) {
			tunnelOptions.push(options);
		}

		connect = tunnelConnect;
	},
}));

const { ensureHost, ensureHostAndConnectRelay } = await import("./connect");

describe("ensureHostAndConnectRelay", () => {
	beforeEach(() => {
		tunnelOptions.length = 0;
		tunnelConnect.mockClear();
	});

	it("registers a host even when no relay connection is configured", async () => {
		const calls: Array<{
			organizationId: string;
			machineId: string;
			name: string;
		}> = [];
		const api = {
			host: {
				ensure: {
					mutate: async (input: (typeof calls)[number]) => {
						calls.push(input);
						return { machineId: input.machineId };
					},
				},
			},
		} as unknown as ApiClient;

		const tunnel = await ensureHostAndConnectRelay({
			api,
			organizationId: "f4510e9c-0af0-445d-b32a-63ea3ed097cf",
			localPort: 4879,
			authProvider: {} as JwtApiAuthProvider,
			hostServiceSecret: "test-host-service-secret",
		});

		expect(tunnel).toBeNull();
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			organizationId: "f4510e9c-0af0-445d-b32a-63ea3ed097cf",
		});
		expect(calls[0]?.machineId).not.toBeEmpty();
		expect(calls[0]?.name).not.toBeEmpty();
	});

	it("returns the registered host", async () => {
		const api = {
			host: {
				ensure: {
					mutate: async () => ({ machineId: "registered-machine" }),
				},
			},
		} as unknown as ApiClient;

		const host = await ensureHost({
			api,
			organizationId: "f4510e9c-0af0-445d-b32a-63ea3ed097cf",
		});

		expect(host?.machineId).toBe("registered-machine");
	});

	it("connects the relay after exactly one host registration", async () => {
		let ensureCalls = 0;
		const api = {
			host: {
				ensure: {
					mutate: async () => {
						ensureCalls++;
						return { machineId: "registered-machine" };
					},
				},
			},
		} as unknown as ApiClient;

		const tunnel = await ensureHostAndConnectRelay({
			api,
			relayUrl: "https://relay.example.test",
			organizationId: "f4510e9c-0af0-445d-b32a-63ea3ed097cf",
			localPort: 4879,
			authProvider: {} as JwtApiAuthProvider,
			hostServiceSecret: "test-host-service-secret",
		});

		expect(ensureCalls).toBe(1);
		expect(tunnel).not.toBeNull();
		expect(tunnelOptions).toEqual([
			expect.objectContaining({
				hostId: "f4510e9c-0af0-445d-b32a-63ea3ed097cf:registered-machine",
				relayUrl: "https://relay.example.test",
			}),
		]);
		expect(tunnelConnect).toHaveBeenCalledTimes(1);
	});
});
