import { describe, expect, test } from "bun:test";
import { getAgentContextSection } from "./AgentContextTabs";

describe("getAgentContextSection", () => {
	test("maps the three existing routes to their tabs", () => {
		expect(getAgentContextSection("/memories")).toBe("memories");
		expect(getAgentContextSection("/mcp")).toBe("mcp");
		expect(getAgentContextSection("/skills")).toBe("skills");
	});

	test("keeps nested routes on their parent tab", () => {
		expect(getAgentContextSection("/mcp/example")).toBe("mcp");
		expect(getAgentContextSection("/skills/example")).toBe("skills");
	});
});
