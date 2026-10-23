/**
 * Discovery of, and connection to, the local host-service.
 *
 * The desktop app writes a manifest on startup containing the endpoint and a
 * pre-shared key; the CLI reads it and talks to the same process. There is no
 * cloud identity, account, or organization involved — everything is local.
 */

import {
	createAcpSessionsApi as createSharedAcpSessionsApi,
	createHostClient as createSharedHostClient,
	type HostClient,
	sessionStreamUrl as sharedSessionStreamUrl,
} from "@superset/host-client";

export type { HostClient } from "@superset/host-client";

import type { AcpSessionsApi } from "@superset/session-protocol";
import {
	type HostServiceManifest,
	hostManifestPath,
	isProcessAlive,
	LOCAL_HOST_SCOPE_ID,
	readHostManifest,
} from "@superset/shared/host-paths";
import { unavailableError } from "./exit-codes";
import { hostFetch } from "./request";

export interface HostConnection {
	client: HostClient;
	manifest: HostServiceManifest;
	/** Base URL without a trailing slash, e.g. `http://127.0.0.1:48679`. */
	endpoint: string;
}

/** Why a manifest could not be turned into a usable connection. */
export type HostUnavailableReason =
	| "no-manifest"
	| "stale-manifest"
	| "unreachable";

export class HostUnavailableError extends Error {
	readonly reason: HostUnavailableReason;
	readonly manifestPath: string;

	constructor(reason: HostUnavailableReason, manifestPath: string) {
		super(describeUnavailable(reason));
		this.name = "HostUnavailableError";
		this.reason = reason;
		this.manifestPath = manifestPath;
	}
}

function describeUnavailable(reason: HostUnavailableReason): string {
	switch (reason) {
		case "no-manifest":
			return "No running Superset host-service found.";
		case "stale-manifest":
			return "The Superset host-service is not running (stale manifest).";
		case "unreachable":
			return "The Superset host-service is not responding.";
	}
}

const REMEDIATION = [
	"Start the Superset desktop app, then try again.",
] as const;

/**
 * Locate a live host-service.
 *
 * A manifest whose pid is dead is reported as stale rather than being used:
 * connecting to a recycled port would be worse than failing clearly.
 */
export function findHostManifest(
	scopeId: string = LOCAL_HOST_SCOPE_ID,
	env: NodeJS.ProcessEnv = process.env,
):
	| { ok: true; manifest: HostServiceManifest }
	| { ok: false; error: HostUnavailableError } {
	const path = hostManifestPath(scopeId, env);
	const manifest = readHostManifest(scopeId, env);
	if (!manifest) {
		return { ok: false, error: new HostUnavailableError("no-manifest", path) };
	}
	if (!isProcessAlive(manifest.pid)) {
		return {
			ok: false,
			error: new HostUnavailableError("stale-manifest", path),
		};
	}
	return { ok: true, manifest };
}

function normalizeEndpoint(endpoint: string): string {
	return endpoint.replace(/\/+$/, "");
}

export function createHostClient(manifest: HostServiceManifest): HostClient {
	const endpoint = normalizeEndpoint(manifest.endpoint);
	return createSharedHostClient({
		endpoint,
		fetch: async (input, init) => {
			const response = await hostFetch(input, init);
			return { ok: response.ok, json: () => response.json() };
		},
		headers: () => ({ Authorization: `Bearer ${manifest.authToken}` }),
	});
}

/**
 * Connect to the running host-service, verifying reachability with a health
 * check so callers get "not running" rather than a confusing failure on their
 * first real request.
 */
export async function connectToHost(options?: {
	scopeId?: string;
	env?: NodeJS.ProcessEnv;
}): Promise<HostConnection> {
	const scopeId = options?.scopeId ?? LOCAL_HOST_SCOPE_ID;
	const env = options?.env ?? process.env;
	const found = findHostManifest(scopeId, env);
	if (!found.ok) {
		throw unavailableError(found.error.message, ...REMEDIATION);
	}

	const { manifest } = found;
	const endpoint = normalizeEndpoint(manifest.endpoint);
	const client = createHostClient(manifest);

	try {
		await client.health.check.query();
	} catch (error) {
		throw unavailableError(
			describeUnavailable("unreachable"),
			`Endpoint: ${endpoint}`,
			...REMEDIATION,
			error instanceof Error ? `Cause: ${error.message}` : "",
		);
	}

	return { client, manifest, endpoint };
}

export function createAcpSessionsApi(
	connection: HostConnection,
): AcpSessionsApi {
	return createSharedAcpSessionsApi(() => connection.client);
}

/** WebSocket URL for a session's live event stream. */
export function sessionStreamUrl(
	connection: Pick<HostConnection, "endpoint" | "manifest">,
	sessionId: string,
	options?: { since?: number; epoch?: string },
): string {
	return sharedSessionStreamUrl(connection.endpoint, sessionId, {
		...options,
		token: connection.manifest.authToken,
	});
}
