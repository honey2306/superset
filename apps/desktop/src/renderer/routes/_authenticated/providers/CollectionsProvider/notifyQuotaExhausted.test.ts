import { describe, expect, it, mock } from "bun:test";

const calls: Array<{
	title: string;
	options?: { id?: string; action?: { label: string; onClick: () => void } };
}> = [];
mock.module("@superset/ui/sonner", () => ({
	toast: {
		warning: (title: string, options?: (typeof calls)[number]["options"]) =>
			calls.push({ title, options }),
		success: () => {},
	},
}));

const { notifyQuotaExhausted } = await import("./notifyQuotaExhausted");

describe("notifyQuotaExhausted", () => {
	it("deduplicates console warnings but provides a reusable reclaim action", () => {
		calls.length = 0;
		const warning = console.warn;
		const warnings: unknown[][] = [];
		console.warn = (...args: unknown[]) => warnings.push(args);
		try {
			notifyQuotaExhausted("quota-test-dedupe");
			notifyQuotaExhausted("quota-test-dedupe");
		} finally {
			console.warn = warning;
		}
		expect(warnings).toHaveLength(1);
		expect(calls).toHaveLength(2);
		expect(calls[0]?.title).toBe("Storage is full");
		expect(calls[0]?.options?.id).toBe(calls[1]?.options?.id);
		expect(calls[0]?.options?.action?.label).toBe("Free up space");
	});
});
