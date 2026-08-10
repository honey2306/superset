import { describe, expect, test } from "bun:test";
import { formatPiUpdateNotice, PiStartupCache } from "./pi-startup";

describe("PiStartupCache", () => {
	test("refreshes in the background while callers can immediately read a cache miss", async () => {
		let resolveNpm!: (value: { stdout: string; stderr: string }) => void;
		const cache = new PiStartupCache((command) => {
			if (command === "pi")
				return Promise.resolve({ stdout: "v1.2.3\n", stderr: "" });
			return new Promise((resolve) => {
				resolveNpm = resolve;
			});
		});
		cache.refreshInBackground();
		expect(cache.getUpdateNotice()).toBeNull();
		await Promise.resolve();
		await Promise.resolve();
		resolveNpm({ stdout: "1.3.0\n", stderr: "" });
		await Promise.resolve();
		await Promise.resolve();
		expect(cache.getUpdateNotice()).toContain("v1.3.0");
	});

	test("does not advertise equal or malformed versions", () => {
		expect(formatPiUpdateNotice("1.2.3", "1.2.3")).toBeNull();
		expect(formatPiUpdateNotice("1.2.3", null)).toBeNull();
	});

	test("does not refresh again before its TTL expires", async () => {
		let now = 1_000;
		let calls = 0;
		const cache = new PiStartupCache(
			async (command) => {
				if (command === "pi") calls += 1;
				return { stdout: "1.2.3", stderr: "" };
			},
			100,
			() => now,
		);
		cache.refreshInBackground();
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		cache.refreshInBackground();
		expect(calls).toBe(1);
		now += 100;
		cache.refreshInBackground();
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		expect(calls).toBe(2);
	});
});
