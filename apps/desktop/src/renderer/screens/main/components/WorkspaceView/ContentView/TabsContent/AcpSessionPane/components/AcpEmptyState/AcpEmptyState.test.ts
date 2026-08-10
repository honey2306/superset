import { describe, expect, test } from "bun:test";
import {
	buildBootLines,
	createAgentAsciiBanner,
	normalizeAgentName,
} from "./AcpEmptyState";

describe("AcpEmptyState agent wordmark", () => {
	test.each([
		["Claude Code", "CLAUDE"],
		["Codex CLI", "CODEX"],
		["Grok", "GROK"],
		["  My Agent!  ", "MY AGENT"],
		[undefined, "AGENT"],
	])("normalizes %p to %p", (label, expected) => {
		expect(normalizeAgentName(label)).toBe(expected);
	});

	test("keeps terminal wordmarks safe and compact", () => {
		expect(normalizeAgentName("  <My ✨ agent>  ")).toBe("MY AGENT");
		expect(normalizeAgentName("An exceptionally long agent name")).toBe(
			"AN EXCEPTION",
		);
	});

	test("renders a distinct six-row banner for each agent", () => {
		const codexBanner = createAgentAsciiBanner("Codex");
		const grokBanner = createAgentAsciiBanner("Grok");
		expect(codexBanner.split("\n")).toHaveLength(6);
		expect(grokBanner.split("\n")).toHaveLength(6);
		expect(codexBanner).not.toBe(grokBanner);
	});
});

describe("buildBootLines", () => {
	test("uses live agent, model, and workspace values", () => {
		const lines = buildBootLines({
			agentLabel: "Codex",
			model: "gpt-5.6",
			cwd: "/Users/example/project",
		});
		expect(lines.slice(0, 3)).toMatchObject([
			{ text: "Agent connected · Codex" },
			{ text: "Model loaded · gpt-5.6" },
			{ text: "Workspace mounted · /Users/example/project" },
		]);
	});

	test("does not invent a model when the session has not reported one", () => {
		const lines = buildBootLines({ agentLabel: "Grok", cwd: "/repo" });
		expect(lines[1]?.text).toBe("Model loaded");
	});
});
