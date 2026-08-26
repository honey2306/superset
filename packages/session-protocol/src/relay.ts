/** A WebSocket frame transported by the AutoMate mailbox relay. */
export type RelayStreamFrame =
	| { type: "text"; data: string }
	| { type: "binary"; data: string };

/** Internal, end-to-end envelopes carried by the AutoMate mailbox relay. */
export type RelayEnvelope =
	| {
			kind: "http.request";
			requestId: string;
			path: string;
			method: string;
			headers: Record<string, string>;
			body?: string;
	  }
	| {
			kind: "http.response";
			requestId: string;
			status: number;
			headers: Record<string, string>;
			body?: string;
	  }
	| {
			kind: "stream.open";
			channelId: string;
			path: string;
			headers: Record<string, string>;
	  }
	| {
			kind: "stream.frame";
			channelId: string;
			body: RelayStreamFrame;
	  }
	| {
			/** Consecutive host-to-phone stream frames, delivered in array order. */
			kind: "stream.frames";
			frames: Array<{ channelId: string; body: RelayStreamFrame }>;
	  }
	| { kind: "stream.close"; channelId: string; code?: number; reason?: string }
	/**
	 * Sent once per Host process incarnation so phones can discard channels
	 * whose Host-side sockets disappeared without a close event.
	 */
	| { kind: "host.reset"; hostInstanceId: string };

/**
 * Derive a compact, deterministic namespace suffix without putting a
 * workspace name (which may contain a path or other identifying text) on the
 * relay. The 64-bit FNV-1a digest is sufficient for the small number of local
 * desktop environments sharing a relay task and is available in browser and
 * Node runtimes alike.
 */
function hashMailboxNamespace(namespace: string): string {
	let hash = 0xcbf29ce484222325n;
	for (const byte of new TextEncoder().encode(namespace)) {
		hash ^= BigInt(byte);
		hash = BigInt.asUintN(64, hash * 0x100000001b3n);
	}
	return hash.toString(16).padStart(16, "0");
}

/**
 * Build the mailbox used by the AutoMate relay.
 *
 * Omitting `namespace` intentionally preserves the original id used by
 * packaged stable builds, so existing paired phones keep working across the
 * rollout. Development workspaces and non-stable artifacts pass a namespace
 * and receive an isolated, opaque suffix.
 */
export function mailboxId(
	organizationId: string,
	hostId: string,
	namespace?: string,
): string {
	const base = `superset:${organizationId}:${hostId}`;
	return namespace ? `${base}:n${hashMailboxNamespace(namespace)}` : base;
}
