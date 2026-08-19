import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { getStatusTooltip, StatusIndicator } from "./StatusIndicator";

describe("StatusIndicator", () => {
	test("uses the expected semantic colors for each agent lifecycle state", () => {
		const statusClasses = {
			working: "bg-warning",
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

	test("uses a restrained same-size breathing animation for working", () => {
		const workingMarkup = renderToStaticMarkup(
			<StatusIndicator status="working" />,
		);

		expect(workingMarkup).toContain("animate-pulse");
		expect(workingMarkup).toContain("opacity-75");
		expect(workingMarkup).not.toContain("-inset-1");
		expect(workingMarkup).not.toContain("animate-ping");
	});

	test("uses a larger, opaque pulse for attention states", () => {
		const attentionStatuses = ["permission", "askuser", "failed"] as const;

		for (const status of attentionStatuses) {
			const markup = renderToStaticMarkup(<StatusIndicator status={status} />);

			expect(markup).toContain("-inset-1");
			expect(markup).toContain("animate-ping");
			expect(markup).toContain("opacity-100");
		}

		const reviewMarkup = renderToStaticMarkup(
			<StatusIndicator status="review" />,
		);
		expect(reviewMarkup).not.toContain("animate-ping");
	});
});

describe("getStatusTooltip", () => {
	test("distinguishes tool permissions from AskUser questions", () => {
		expect(getStatusTooltip("permission")).toBe("Permission needed");
		expect(getStatusTooltip("askuser")).toBe("Question needs an answer");
	});
});
