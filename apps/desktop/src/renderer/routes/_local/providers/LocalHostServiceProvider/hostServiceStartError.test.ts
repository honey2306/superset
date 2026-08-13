import { describe, expect, test } from "bun:test";
import { handleHostServiceStartError } from "./hostServiceStartError";

describe("handleHostServiceStartError", () => {
	test("does not report an expected missing-auth error", () => {
		const logCalls: unknown[][] = [];
		const toastCalls: unknown[][] = [];

		handleHostServiceStartError(
			{
				data: { code: "UNAUTHORIZED" },
				message: "No auth token available — user must be logged in",
			},
			{
				logError: (...args) => logCalls.push(args),
				showToast: (...args) => toastCalls.push(args),
			},
		);

		expect(logCalls).toEqual([]);
		expect(toastCalls).toEqual([]);
	});

	test("reports an unexpected start failure", () => {
		const error = {
			data: { code: "INTERNAL_SERVER_ERROR" },
			message: "spawn failed",
		};
		const logCalls: unknown[][] = [];
		const toastCalls: unknown[][] = [];

		handleHostServiceStartError(error, {
			logError: (...args) => logCalls.push(args),
			showToast: (...args) => toastCalls.push(args),
		});

		expect(logCalls).toEqual([["[host-service] start failed:", error]]);
		expect(toastCalls).toEqual([
			[
				"Host service failed to start",
				{
					id: "host-service-start-failed",
					description: "spawn failed",
				},
			],
		]);
	});
});
