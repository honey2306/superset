import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const { AcpMarkdown } = await import("./AcpMarkdown");

describe("AcpMarkdown", () => {
	it("renders markdown with ACP's selectable text treatment", () => {
		const markdown = "## Heading\n\n**bold** and `code`";

		const html = renderToStaticMarkup(<AcpMarkdown>{markdown}</AcpMarkdown>);

		expect(html).toContain("acp-md");
		expect(html).toContain("select-text cursor-text");
		expect(html).toContain("<h2>Heading</h2>");
		expect(html).toContain("<strong>bold</strong>");
		expect(html).toContain("<code>code</code>");
	});
});
