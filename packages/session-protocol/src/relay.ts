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
	| { kind: "stream.frame"; channelId: string; body: string }
	| { kind: "stream.close"; channelId: string; code?: number; reason?: string };

export function mailboxId(organizationId: string, hostId: string): string {
	return `superset:${organizationId}:${hostId}`;
}
