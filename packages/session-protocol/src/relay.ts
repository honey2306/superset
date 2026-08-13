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
	| { kind: "stream.close"; channelId: string; code?: number; reason?: string };

export function mailboxId(organizationId: string, hostId: string): string {
	return `superset:${organizationId}:${hostId}`;
}
