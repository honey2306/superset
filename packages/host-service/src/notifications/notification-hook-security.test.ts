import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NotificationHookSecurity } from "./notification-hook-security";

const directories: string[] = [];

afterEach(() => {
	for (const directory of directories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

function createSecurity(): {
	security: NotificationHookSecurity;
	dbPath: string;
} {
	const directory = mkdtempSync(join(tmpdir(), "notification-hooks-"));
	directories.push(directory);
	const dbPath = join(directory, "host.db");
	return { security: new NotificationHookSecurity(dbPath), dbPath };
}

describe("NotificationHookSecurity", () => {
	it("scopes capabilities to one terminal and suppresses event replay", () => {
		const { security } = createSecurity();
		const occurredAt = Date.now();
		const capabilityToken = security.capabilityForTerminal("terminal-1");

		expect(
			security.authorizeAndConsume({
				terminalId: "terminal-2",
				capabilityToken,
				eventId: "event-1234567890",
				occurredAt,
			}),
		).toEqual({ ok: false, reason: "invalid_capability" });
		expect(
			security.authorizeAndConsume({
				terminalId: "terminal-1",
				capabilityToken,
				eventId: "event-1234567890",
				occurredAt,
			}),
		).toEqual({ ok: true, duplicate: false });
		expect(
			security.authorizeAndConsume({
				terminalId: "terminal-1",
				capabilityToken,
				eventId: "event-1234567890",
				occurredAt,
			}),
		).toEqual({ ok: true, duplicate: true });
	});

	it("keeps capability and replay state across a host process recreation", () => {
		const { security, dbPath } = createSecurity();
		const occurredAt = Date.now();
		const capabilityToken = security.capabilityForTerminal("terminal-1");
		security.authorizeAndConsume({
			terminalId: "terminal-1",
			capabilityToken,
			eventId: "event-1234567890",
			occurredAt,
		});

		const restarted = new NotificationHookSecurity(dbPath);
		expect(restarted.capabilityForTerminal("terminal-1")).toBe(capabilityToken);
		expect(
			restarted.authorizeAndConsume({
				terminalId: "terminal-1",
				capabilityToken,
				eventId: "event-1234567890",
				occurredAt,
			}),
		).toEqual({ ok: true, duplicate: true });
	});
});
