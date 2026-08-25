import { expect, test } from "bun:test";
import type { ContentBlock } from "@superset/session-protocol";
import {
	AcpCommandOutbox,
	type CommandOutboxStorage,
	type PendingAcpCommand,
} from "./acp-command-outbox";

class MemoryStorage implements CommandOutboxStorage {
	private readonly values = new Map<string, string>();
	getItem(key: string): string | null {
		return this.values.get(key) ?? null;
	}
	setItem(key: string, value: string): void {
		this.values.set(key, value);
	}
	removeItem(key: string): void {
		this.values.delete(key);
	}
}

const prompt: ContentBlock[] = [{ type: "text", text: "continue" }];

function command(
	overrides: Partial<PendingAcpCommand> = {},
): PendingAcpCommand {
	return {
		commandId: "command-1",
		sessionId: "session-1",
		operation: "prompt",
		prompt,
		createdAt: 1,
		...overrides,
	};
}

test("persists commands by host and session and a recreated outbox can read them", () => {
	const storage = new MemoryStorage();
	const first = new AcpCommandOutbox("host-a", "session-1", { storage });
	first.put(command());

	const recreated = new AcpCommandOutbox("host-a", "session-1", { storage });
	const otherSession = new AcpCommandOutbox("host-a", "session-2", { storage });
	const otherHost = new AcpCommandOutbox("host-b", "session-1", { storage });

	expect(recreated.list()).toEqual([command()]);
	expect(otherSession.list()).toEqual([]);
	expect(otherHost.list()).toEqual([]);
});

test("keeps a command after a failed admission and removes it after retry success", async () => {
	const storage = new MemoryStorage();
	const first = new AcpCommandOutbox("host-c", "session-1", { storage });
	first.put(command());
	let attempts = 0;
	await first.drain(async () => {
		attempts += 1;
		throw new Error("offline");
	});
	expect(attempts).toBe(1);
	expect(first.list()).toHaveLength(1);

	const recreated = new AcpCommandOutbox("host-c", "session-1", { storage });
	await recreated.drain(async (pending) => {
		expect(pending.commandId).toBe("command-1");
	});
	expect(recreated.list()).toEqual([]);
});

test("serializes drains for recreated clients in one host/session scope", async () => {
	const storage = new MemoryStorage();
	const first = new AcpCommandOutbox("host-d", "session-1", { storage });
	first.put(command());
	let active = 0;
	let maximumActive = 0;
	const execute = async () => {
		active += 1;
		maximumActive = Math.max(maximumActive, active);
		await Promise.resolve();
		active -= 1;
	};
	const second = new AcpCommandOutbox("host-d", "session-1", { storage });
	await Promise.all([first.drain(execute), second.drain(execute)]);
	expect(maximumActive).toBe(1);
	expect(first.list()).toEqual([]);
});

test("does not let a new command jump ahead of an older failed command", async () => {
	const storage = new MemoryStorage();
	const outbox = new AcpCommandOutbox("host-e", "session-1", { storage });
	outbox.put(command({ commandId: "older" }));
	const attempted: string[] = [];

	await expect(
		outbox.send(
			command({ commandId: "newer", createdAt: 2 }),
			async (pending) => {
				attempted.push(pending.commandId);
				if (pending.commandId === "older") throw new Error("still offline");
				return { accepted: true };
			},
		),
	).rejects.toThrow("still offline");

	expect(attempted).toEqual(["older"]);
	expect(outbox.list().map((pending) => pending.commandId)).toEqual([
		"older",
		"newer",
	]);
});

test("command ids are non-empty and unique across generated commands", () => {
	const first = AcpCommandOutbox.createCommandId();
	const second = AcpCommandOutbox.createCommandId();
	expect(first).toBeString();
	expect(first.length).toBeGreaterThan(0);
	expect(second).not.toBe(first);
});
