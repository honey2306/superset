import { describe, expect, test } from "bun:test";
import {
	MAX_HANDLED_ACP_SESSION_OPEN_REQUESTS,
	shouldHandleAcpSessionOpenRequest,
} from "./useAcpSessionOpenRequests";

describe("shouldHandleAcpSessionOpenRequest", () => {
	test("dedupes transport retries but accepts a later request for the same session", () => {
		const handled = new Set<string>();
		const first = {
			sessionId: "session-1",
			requestId: "request-1",
			occurredAt: 1,
		};

		expect(shouldHandleAcpSessionOpenRequest(handled, first)).toBe(true);
		expect(
			shouldHandleAcpSessionOpenRequest(handled, {
				...first,
				occurredAt: 2,
			}),
		).toBe(false);
		expect(
			shouldHandleAcpSessionOpenRequest(handled, {
				sessionId: "session-1",
				requestId: "request-2",
				occurredAt: 3,
			}),
		).toBe(true);
	});

	test("uses timestamp identity for older events without requestId", () => {
		const handled = new Set<string>();
		expect(
			shouldHandleAcpSessionOpenRequest(handled, {
				sessionId: "session-1",
				occurredAt: 10,
			}),
		).toBe(true);
		expect(
			shouldHandleAcpSessionOpenRequest(handled, {
				sessionId: "session-1",
				occurredAt: 10,
			}),
		).toBe(false);
		expect(
			shouldHandleAcpSessionOpenRequest(handled, {
				sessionId: "session-1",
				occurredAt: 11,
			}),
		).toBe(true);
	});

	test("evicts old request identities to keep the dedupe set bounded", () => {
		const handled = new Set<string>();
		for (
			let index = 0;
			index < MAX_HANDLED_ACP_SESSION_OPEN_REQUESTS;
			index++
		) {
			expect(
				shouldHandleAcpSessionOpenRequest(handled, {
					sessionId: "session-1",
					requestId: `request-${index}`,
					occurredAt: index,
				}),
			).toBe(true);
		}
		expect(handled.size).toBe(MAX_HANDLED_ACP_SESSION_OPEN_REQUESTS);
		expect(
			shouldHandleAcpSessionOpenRequest(handled, {
				sessionId: "session-1",
				requestId: "request-new",
				occurredAt: MAX_HANDLED_ACP_SESSION_OPEN_REQUESTS,
			}),
		).toBe(true);
		expect(handled.size).toBe(MAX_HANDLED_ACP_SESSION_OPEN_REQUESTS);
		expect(
			shouldHandleAcpSessionOpenRequest(handled, {
				sessionId: "session-1",
				requestId: "request-0",
				occurredAt: 0,
			}),
		).toBe(true);
	});
});
