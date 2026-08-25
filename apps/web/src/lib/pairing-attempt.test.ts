import { describe, expect, test } from "bun:test";
import {
	clearPairingAttempt,
	generateRedeemNonce,
	getOrCreatePairingAttempt,
	getPairingAttemptStorageKey,
	PairingAttemptTimeoutError,
	redeemPairingWithRetry,
} from "./pairing-attempt";

class MemoryStorage {
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

describe("pairing attempt recovery", () => {
	test("persists, reuses, and clears only the redeem nonce", () => {
		const storage = new MemoryStorage();
		const code = "abcd-1234";
		const first = getOrCreatePairingAttempt(code, {
			storage,
			nonceFactory: () => "0123456789abcdefghijklmnop",
		});
		const retry = getOrCreatePairingAttempt(code, {
			storage,
			nonceFactory: () => "a-different-nonce-that-must-not-win",
		});

		expect(retry).toEqual(first);
		expect(storage.getItem(getPairingAttemptStorageKey(code))).toContain(
			first.redeemNonce,
		);
		expect(storage.getItem(getPairingAttemptStorageKey(code))).not.toContain(
			"task-token",
		);

		clearPairingAttempt(code, storage);
		expect(storage.getItem(getPairingAttemptStorageKey(code))).toBeNull();
	});

	test("creates a URL-safe high-entropy nonce from injected randomness", () => {
		const nonce = generateRedeemNonce((bytes) => {
			bytes.fill(0xab);
			return bytes;
		});
		expect(nonce).toHaveLength(32);
		expect(nonce).toMatch(/^[A-Za-z0-9_-]+$/);
	});

	test("retries a timed-out response with the exact same nonce", async () => {
		const pairingAttempt = {
			code: "ABCD-1234",
			redeemNonce: "0123456789abcdefghijklmnop",
		};
		const seen: (typeof pairingAttempt)[] = [];
		const statuses: string[] = [];
		let calls = 0;
		const result = await redeemPairingWithRetry(
			pairingAttempt,
			async (attempt) => {
				seen.push(attempt);
				calls += 1;
				return { sessionId: "session-1", call: calls };
			},
			{
				timeout: async <T>(operation: Promise<T>, _ms: number, attempt) => {
					if (attempt === 1) throw new PairingAttemptTimeoutError(attempt);
					return operation;
				},
				sleep: async () => undefined,
				onStatus: (status) => statuses.push(status.kind),
			},
		);

		expect(result).toEqual({ sessionId: "session-1", call: 2 });
		expect(seen).toEqual([pairingAttempt, pairingAttempt]);
		expect(statuses).toEqual(["attempting", "timeout", "retrying"]);
	});

	test("does not retry a permanent invalid-code response", async () => {
		let calls = 0;
		await expect(
			redeemPairingWithRetry(
				{
					code: "ABCD-1234",
					redeemNonce: "0123456789abcdefghijklmnop",
				},
				async () => {
					calls += 1;
					throw new Error("Pairing code is invalid or has expired.");
				},
				{ sleep: async () => undefined },
			),
		).rejects.toThrow(/invalid or has expired/i);
		expect(calls).toBe(1);
	});
});
