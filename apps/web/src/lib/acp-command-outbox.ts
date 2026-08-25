import type { ContentBlock } from "@superset/session-protocol";

export type AcpCommandOperation = "prompt" | "enqueuePrompt" | "sendNow";

export type PendingAcpCommand = {
	commandId: string;
	sessionId: string;
	operation: AcpCommandOperation;
	prompt: ContentBlock[];
	createdAt: number;
};

export interface CommandOutboxStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

type StoredCommand = PendingAcpCommand & { version: 1 };

const STORAGE_PREFIX = "superset.acp.command-outbox.v1";

function getBrowserStorage(): CommandOutboxStorage | undefined {
	if (typeof localStorage === "undefined") return undefined;
	try {
		// Accessing localStorage can itself throw in a privacy-restricted browser.
		localStorage.getItem("__superset_acp_outbox_probe__");
		return localStorage;
	} catch {
		return undefined;
	}
}

function storageKey(hostKey: string, sessionId: string): string {
	return `${STORAGE_PREFIX}:${encodeURIComponent(hostKey)}:${encodeURIComponent(sessionId)}`;
}

function isPendingAcpCommand(value: unknown): value is StoredCommand {
	if (typeof value !== "object" || value === null) return false;
	const command = value as Partial<StoredCommand>;
	return (
		command.version === 1 &&
		typeof command.commandId === "string" &&
		command.commandId.length > 0 &&
		typeof command.sessionId === "string" &&
		command.sessionId.length > 0 &&
		(command.operation === "prompt" ||
			command.operation === "enqueuePrompt" ||
			command.operation === "sendNow") &&
		Array.isArray(command.prompt) &&
		typeof command.createdAt === "number"
	);
}

function readCommands(
	storage: CommandOutboxStorage | undefined,
	key: string,
): PendingAcpCommand[] {
	if (!storage) return [];
	try {
		const raw = storage.getItem(key);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter(isPendingAcpCommand)
			.map(({ version: _, ...command }) => command);
	} catch {
		return [];
	}
}

function writeCommands(
	storage: CommandOutboxStorage | undefined,
	key: string,
	commands: readonly PendingAcpCommand[],
): void {
	if (!storage) return;
	try {
		if (commands.length === 0) {
			storage.removeItem(key);
			return;
		}
		const stored: StoredCommand[] = commands.map((command) => ({
			...command,
			version: 1,
		}));
		storage.setItem(key, JSON.stringify(stored));
	} catch {
		// A blocked/full localStorage must not prevent a direct foreground send.
	}
}

function fallbackCommandId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// A browser can mount two session routes briefly during navigation. Keep one
// in-memory queue per host/session scope so their background drains cannot
// invoke the same persisted command concurrently.
const scopeTails = new Map<string, Promise<void>>();

export class AcpCommandOutbox {
	private readonly key: string;
	private readonly storage: CommandOutboxStorage | undefined;

	constructor(
		readonly hostKey: string,
		readonly sessionId: string,
		options: {
			storage?: CommandOutboxStorage;
		} = {},
	) {
		this.key = storageKey(hostKey, sessionId);
		this.storage = options.storage ?? getBrowserStorage();
	}

	static createCommandId(): string {
		return fallbackCommandId();
	}

	list(): PendingAcpCommand[] {
		return readCommands(this.storage, this.key);
	}

	put(command: PendingAcpCommand): void {
		if (command.sessionId !== this.sessionId) {
			throw new Error("ACP command outbox session scope mismatch");
		}
		const commands = this.list().filter(
			(existing) => existing.commandId !== command.commandId,
		);
		writeCommands(this.storage, this.key, [...commands, command]);
	}

	remove(commandId: string): void {
		writeCommands(
			this.storage,
			this.key,
			this.list().filter((command) => command.commandId !== commandId),
		);
	}

	/**
	 * Drain in insertion order. A failed command remains persisted and stops
	 * the background pass; the next foreground action/reload retries it.
	 */
	drain(
		execute: (command: PendingAcpCommand) => Promise<unknown>,
	): Promise<void> {
		return this.runExclusive(async () => {
			for (const command of this.list()) {
				try {
					await execute(command);
					this.remove(command.commandId);
				} catch {
					break;
				}
			}
		});
	}

	/** Persist before invoking the host, and remove only after admission. */
	send<T>(
		command: PendingAcpCommand,
		execute: (command: PendingAcpCommand) => Promise<T>,
	): Promise<T> {
		this.put(command);
		return this.runExclusive(async () => {
			// Preserve user intent order after an offline period. A newly submitted
			// command must not jump ahead of an older durable command merely because
			// the latter's previous network attempt failed.
			for (const pending of this.list()) {
				const result = await execute(pending);
				this.remove(pending.commandId);
				if (pending.commandId === command.commandId) return result as T;
			}

			// Another serialized drain may have admitted and removed this command
			// before our turn began. Re-issuing the same commandId is intentional:
			// the Host returns the stable idempotent admission result.
			return execute(command);
		});
	}

	private runExclusive<T>(task: () => Promise<T>): Promise<T> {
		const scope = this.key;
		const previous = scopeTails.get(scope) ?? Promise.resolve();
		const next = previous.then(task, task);
		const tail = next.then(
			() => undefined,
			() => undefined,
		);
		scopeTails.set(scope, tail);
		return next;
	}
}

export function getAcpCommandOutboxStorageKey(
	hostKey: string,
	sessionId: string,
): string {
	return storageKey(hostKey, sessionId);
}
