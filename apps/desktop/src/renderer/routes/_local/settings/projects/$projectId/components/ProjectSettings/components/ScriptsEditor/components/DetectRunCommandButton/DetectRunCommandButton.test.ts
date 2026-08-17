import { describe, expect, test } from "bun:test";
import {
	retryAcpDaemonDisconnect,
	selectAcpAgentDefinitionId,
} from "./DetectRunCommandButton";

describe("retryAcpDaemonDisconnect", () => {
	test("retries a transient daemon disconnect", async () => {
		let attempts = 0;
		const result = await retryAcpDaemonDisconnect(async () => {
			attempts += 1;
			if (attempts < 3) throw new Error("ACP daemon disconnected");
			return "connected";
		});

		expect(result).toBe("connected");
		expect(attempts).toBe(3);
	});

	test("does not retry unrelated launch failures", async () => {
		let attempts = 0;
		await expect(
			retryAcpDaemonDisconnect(async () => {
				attempts += 1;
				throw new Error("adapter failed");
			}),
		).rejects.toThrow("adapter failed");
		expect(attempts).toBe(1);
	});
});

describe("selectAcpAgentDefinitionId", () => {
	test("selects the first configured ACP-compatible preset", () => {
		expect(
			selectAcpAgentDefinitionId([
				{ presetId: "custom" },
				{ presetId: "codex" },
				{ presetId: "pi" },
			]),
		).toBe("codex");
	});

	test("uses the stable ACP priority rather than host config order", () => {
		expect(
			selectAcpAgentDefinitionId([{ presetId: "pi" }, { presetId: "claude" }]),
		).toBe("claude");
	});

	test("returns null when no compatible preset is configured", () => {
		expect(
			selectAcpAgentDefinitionId([{ presetId: "gemini" }, { presetId: null }]),
		).toBeNull();
	});
});
