import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { getStatusTooltip, StatusIndicator } from "./StatusIndicator";

describe("StatusIndicator", () => {
	test("uses the expected semantic colors for each agent lifecycle state", () => {
		const statusClasses = {
			working: "bg-[#f97316]",
			review: "bg-success",
			permission: "bg-info",
			askuser: "bg-accent-2",
			failed: "bg-destructive",
		} as const;

		for (const [status, colorClass] of Object.entries(statusClasses)) {
			const markup = renderToStaticMarkup(
				<StatusIndicator status={status as keyof typeof statusClasses} />,
			);
			expect(markup).toContain(`rounded-full ${colorClass}`);
		}
	});

	test("uses a static 8px dot for every status", () => {
		const statuses = [
			"working",
			"review",
			"permission",
			"askuser",
			"failed",
		] as const;

		for (const status of statuses) {
			const markup = renderToStaticMarkup(<StatusIndicator status={status} />);

			expect(markup).toContain("size-2");
			expect(markup).not.toContain("animate-ping");
			expect(markup).not.toContain("animate-pulse");
			expect(markup).not.toContain("-inset-1");
			expect(markup).not.toContain("opacity-");
		}
	});
});

describe("getStatusTooltip", () => {
	test("distinguishes tool permissions from AskUser questions", () => {
		expect(getStatusTooltip("permission")).toBe("Permission needed");
		expect(getStatusTooltip("askuser")).toBe("Question needs an answer");
	});
});
