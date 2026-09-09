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

describe("ACP pane vertical rhythm", () => {
	test("reduces only the space above the floating toolbar", () => {
		expect(rule(".acp-pane__toolbar")).toContain("min-height: 64px");
		expect(rule(".acp-pane__toolbar")).toContain("padding: 16px 28px 6px");
		expect(rule(".acp-pane__toolbar::before")).toContain(
			"inset: 16px 12px 6px 12px",
		);
		expect(rule(".acp-pane__body-inner")).toContain("padding: 32px 56px 24px");
	});
});

describe("ACP context compaction status", () => {
	test("renders a centered card in the composer flow", () => {
		const wrap = rule(".acp-pane__compaction-wrap");
		expect(wrap).toContain("display: block");
		expect(wrap).toContain("margin: 0 auto 8px");
		expect(wrap).not.toContain("position: absolute");
		expect(wrap).toContain("pointer-events: none");

		const card = rule(".acp-pane__compaction-card");
		expect(card).toContain("backdrop-filter: blur(12px)");
		expect(card).not.toContain("background: var(--acp-purple-dim)");
		expect(card).toContain("var(--shadow-2");
	});

	test("uses restrained progress motion for the active state", () => {
		expect(rule(".acp-pane__compaction-spinner")).toContain(
			"animation: acp-compaction-spin",
		);
		expect(rule(".acp-pane__compaction-dots i")).toContain(
			"animation: acp-compaction-dot",
		);
		expect(rule(".acp-pane__compaction-card::after")).toContain(
			"animation: acp-compaction-sweep",
		);
	});
});
