import { describe, expect, it } from "bun:test";
import { withQuotaGuard } from "./withQuotaGuard";

function quotaError(): Error {
	const error = new Error("quota exhausted");
	error.name = "QuotaExceededError";
	return error;
}

describe("withQuotaGuard", () => {
	it("reclaims terminal state then retries the failed write", () => {
		const values = new Map([["terminal-buffer:old", "x".repeat(100)]]);
		const guarded = withQuotaGuard(
			{},
			{
				storage: {
					getItem: (key) => values.get(key) ?? null,
					removeItem: (key) => values.delete(key),
					setItem: (key, value) => {
						if (values.has("terminal-buffer:old")) throw quotaError();
						values.set(key, value);
					},
				},
				reclaim: () => {
					values.delete("terminal-buffer:old");
					return 1;
				},
				onPersistFailed: () => {
					throw new Error("unexpected persist failure");
				},
			},
		) as { storage: Storage };
		guarded.storage.setItem("collection", "saved");
		expect(values.get("collection")).toBe("saved");
	});

	it("reports and rethrows quota exhaustion when reclaim cannot free space", () => {
		let attempts = 0;
		const failures: string[] = [];
		const guarded = withQuotaGuard(
			{},
			{
				storage: {
					getItem: () => null,
					removeItem: () => {},
					setItem: () => {
						attempts++;
						throw quotaError();
					},
				},
				reclaim: () => 0,
				onPersistFailed: (key) => failures.push(key),
			},
		) as { storage: Storage };
		expect(() => guarded.storage.setItem("collection", "value")).toThrow(
			"quota exhausted",
		);
		expect(attempts).toBe(1);
		expect(failures).toEqual(["collection"]);
	});

	it("rethrows non-quota failures without trying to reclaim", () => {
		let reclaimed = false;
		const guarded = withQuotaGuard(
			{},
			{
				storage: {
					getItem: () => null,
					removeItem: () => {},
					setItem: () => {
						throw new DOMException("blocked", "SecurityError");
					},
				},
				reclaim: () => {
					reclaimed = true;
					return 0;
				},
				onPersistFailed: () => {},
			},
		) as { storage: Storage };
		expect(() => guarded.storage.setItem("k", "v")).toThrow("blocked");
		expect(reclaimed).toBe(false);
	});
});
