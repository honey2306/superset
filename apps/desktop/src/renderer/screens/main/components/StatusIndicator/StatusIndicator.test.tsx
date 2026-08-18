import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { getStatusTooltip, StatusIndicator } from "./StatusIndicator";

describe("StatusIndicator", () => {
	test("uses distinct semantic colors for the four agent lifecycle states", () => {
		const statusClasses = {
			working: "bg-info",
			review: "bg-success",
			permission: "bg-warning",
			askuser: "bg-accent-2",
		} as const;

		for (const [status, colorClass] of Object.entries(statusClasses)) {
			const markup = renderToStaticMarkup(
				<StatusIndicator status={status as keyof typeof statusClasses} />,
			);
			expect(markup).toContain(`rounded-full ${colorClass}"`);
		}
	});
});

describe("getStatusTooltip", () => {
	test("distinguishes tool permissions from AskUser questions", () => {
		expect(getStatusTooltip("permission")).toBe("Permission needed");
		expect(getStatusTooltip("askuser")).toBe("Question needs an answer");
	});
});
