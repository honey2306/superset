import { describe, expect, test } from "bun:test";

const css = await Bun.file(new URL("./acp-pane.css", import.meta.url)).text();

function rule(selector: string): string {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
	const match = css.match(
		new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, "u"),
	);
	if (!match?.[1]) throw new Error(`Missing CSS rule: ${selector}`);
	return match[1];
}

describe("ACP pane overflow containment", () => {
	test("wraps long unbroken text inside user message bubbles", () => {
		expect(rule(".acp-msg")).toContain("min-width: 0");
		expect(rule(".acp-msg__bubble")).toContain("min-width: 0");
		expect(rule(".acp-md")).toContain("max-width: 100%");
		const userBubble = rule('.acp-msg[data-role="user"] .acp-msg__bubble');
		expect(userBubble).toContain("overflow-wrap: anywhere");
		expect(userBubble).toContain("word-break: break-word");
	});
});
