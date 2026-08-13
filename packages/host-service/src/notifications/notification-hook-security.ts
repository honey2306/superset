import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

const MAX_EVENT_AGE_MS = 10 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 60 * 1000;
const MAX_REMEMBERED_EVENTS = 2_048;

interface PersistedNotificationHookState {
	secret: string;
	events: Array<{ eventId: string; occurredAt: number }>;
}

export type NotificationHookAuthorization =
	| { ok: true; duplicate: false }
	| { ok: true; duplicate: true }
	| { ok: false; reason: "invalid_capability" | "invalid_timestamp" };

let activeSecurity: NotificationHookSecurity | undefined;

/**
 * Terminal-scoped hook capabilities and a bounded, disk-backed replay ledger.
 * The capability secret is intentionally independent from the Host PSK.
 */
export class NotificationHookSecurity {
	private readonly statePath: string;
	private readonly secret: string;
	private readonly events = new Map<string, number>();

	constructor(dbPath: string) {
		this.statePath = `${dbPath}.notification-hooks.json`;
		const persisted = this.load();
		this.secret = persisted?.secret ?? randomBytes(32).toString("hex");
		for (const event of persisted?.events ?? []) {
			this.events.set(event.eventId, event.occurredAt);
		}
		this.prune(Date.now());
		this.persist();
	}

	capabilityForTerminal(terminalId: string): string {
		return createHmac("sha256", this.secret)
			.update(`terminal-hook:${terminalId}`)
			.digest("base64url");
	}

	authorizeAndConsume(input: {
		terminalId: string;
		capabilityToken: string;
		eventId: string;
		occurredAt: number;
		now?: number;
	}): NotificationHookAuthorization {
		const expected = this.capabilityForTerminal(input.terminalId);
		if (!safeEqual(expected, input.capabilityToken)) {
			return { ok: false, reason: "invalid_capability" };
		}

		const now = input.now ?? Date.now();
		if (
			!Number.isSafeInteger(input.occurredAt) ||
			input.occurredAt < now - MAX_EVENT_AGE_MS ||
			input.occurredAt > now + MAX_FUTURE_SKEW_MS
		) {
			return { ok: false, reason: "invalid_timestamp" };
		}

		this.prune(now);
		if (this.events.has(input.eventId)) {
			return { ok: true, duplicate: true };
		}

		this.events.set(input.eventId, input.occurredAt);
		this.prune(now);
		this.persist();
		return { ok: true, duplicate: false };
	}

	private load(): PersistedNotificationHookState | undefined {
		if (!existsSync(this.statePath)) return undefined;
		try {
			const value = JSON.parse(
				readFileSync(this.statePath, "utf8"),
			) as Partial<PersistedNotificationHookState>;
			if (typeof value.secret !== "string" || !Array.isArray(value.events)) {
				return undefined;
			}
			return {
				secret: value.secret,
				events: value.events.filter(
					(event): event is { eventId: string; occurredAt: number } =>
						typeof event?.eventId === "string" &&
						Number.isSafeInteger(event.occurredAt),
				),
			};
		} catch {
			return undefined;
		}
	}

	private prune(now: number): void {
		for (const [eventId, occurredAt] of this.events) {
			if (occurredAt < now - MAX_EVENT_AGE_MS) this.events.delete(eventId);
		}
		while (this.events.size > MAX_REMEMBERED_EVENTS) {
			const oldest = this.events.keys().next().value;
			if (oldest === undefined) break;
			this.events.delete(oldest);
		}
	}

	private persist(): void {
		const temporaryPath = `${this.statePath}.${process.pid}.tmp`;
		writeFileSync(
			temporaryPath,
			JSON.stringify({
				secret: this.secret,
				events: [...this.events].map(([eventId, occurredAt]) => ({
					eventId,
					occurredAt,
				})),
			}),
			{ mode: 0o600 },
		);
		renameSync(temporaryPath, this.statePath);
	}
}

function safeEqual(expected: string, actual: string): boolean {
	const expectedBuffer = Buffer.from(expected);
	const actualBuffer = Buffer.from(actual);
	return (
		expectedBuffer.length === actualBuffer.length &&
		timingSafeEqual(expectedBuffer, actualBuffer)
	);
}

export function setActiveNotificationHookSecurity(
	security: NotificationHookSecurity,
): void {
	activeSecurity = security;
}

export function getNotificationHookCapability(terminalId: string): string {
	if (!activeSecurity) {
		throw new Error("Notification hook security is not initialized");
	}
	return activeSecurity.capabilityForTerminal(terminalId);
}
