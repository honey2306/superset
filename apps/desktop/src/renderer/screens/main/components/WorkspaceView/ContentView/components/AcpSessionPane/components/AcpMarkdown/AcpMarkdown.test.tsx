import { describe, expect, it, mock } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const messageResponseCalls: Array<Record<string, unknown>> = [];

mock.module("@superset/ui/ai-elements/message", () => ({
	MessageResponse: (props: Record<string, unknown>) => {
		messageResponseCalls.push(props);
		return <div>{props.children as ReactNode}</div>;
	},
}));

const { AcpMarkdown } = await import("./AcpMarkdown");

describe("AcpMarkdown", () => {
	it("delegates complete markdown rendering to the shared conversation renderer", () => {
		messageResponseCalls.length = 0;
		const markdown = "## Heading\n\n**bold** and `code`";

		renderToStaticMarkup(<AcpMarkdown>{markdown}</AcpMarkdown>);

		expect(messageResponseCalls).toHaveLength(1);
		expect(messageResponseCalls[0]).toMatchObject({
			animated: false,
			isAnimating: false,
			className: "acp-md select-text cursor-text",
			children: markdown,
		});
	});
});
