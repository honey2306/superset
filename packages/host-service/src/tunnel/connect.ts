import { getHostId, getHostName } from "@superset/shared/host-info";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import type { JwtApiAuthProvider } from "../providers/auth/JwtAuthProvider/JwtAuthProvider";
import type { ApiClient } from "../types";
import { TunnelClient } from "./tunnel-client";

export interface ConnectRelayOptions {
	api: ApiClient;
	relayUrl: string;
	localPort: number;
	organizationId: string;
	authProvider: JwtApiAuthProvider;
	hostServiceSecret: string;
}

export type EnsureHostAndConnectRelayOptions = Omit<
	ConnectRelayOptions,
	"relayUrl"
> & {
	relayUrl?: string;
};

type EnsuredHost = Awaited<ReturnType<ApiClient["host"]["ensure"]["mutate"]>>;

export interface EnsureHostOptions {
	api: ApiClient;
	organizationId: string;
}

/** Registers this device in the cloud independently of relay availability. */
export async function ensureHost(
	options: EnsureHostOptions,
): Promise<EnsuredHost | null> {
	try {
		const host = await options.api.host.ensure.mutate({
			organizationId: options.organizationId,
			machineId: getHostId(),
			name: getHostName(),
		});
		console.log(`[host-service] registered as host ${host.machineId}`);
		return host;
	} catch (error) {
		console.error("[host-service] failed to register host:", error);
		return null;
	}
}

function connectRegisteredHostToRelay(
	options: Omit<ConnectRelayOptions, "relayUrl"> & { relayUrl: string },
	host: EnsuredHost,
): TunnelClient {
	const tunnel = new TunnelClient({
		relayUrl: options.relayUrl,
		hostId: buildHostRoutingKey(options.organizationId, host.machineId),
		getAuthToken: () => options.authProvider.getJwt(),
		localPort: options.localPort,
		hostServiceSecret: options.hostServiceSecret,
	});
	void tunnel.connect();
	return tunnel;
}

/** Preserves the relay-only entrypoint for callers that always have a relay. */
export async function connectRelay(
	options: ConnectRelayOptions,
): Promise<TunnelClient | null> {
	const host = await ensureHost(options);
	if (!host) return null;

	try {
		return connectRegisteredHostToRelay(options, host);
	} catch (error) {
		console.error("[host-service] failed to connect relay:", error);
		return null;
	}
}

/** Registers the host once, then connects a relay only when one is configured. */
export async function ensureHostAndConnectRelay(
	options: EnsureHostAndConnectRelayOptions,
): Promise<TunnelClient | null> {
	const host = await ensureHost(options);
	if (!host || !options.relayUrl) return null;

	try {
		return connectRegisteredHostToRelay(
			{ ...options, relayUrl: options.relayUrl },
			host,
		);
	} catch (error) {
		console.error("[host-service] failed to connect relay:", error);
		return null;
	}
}
