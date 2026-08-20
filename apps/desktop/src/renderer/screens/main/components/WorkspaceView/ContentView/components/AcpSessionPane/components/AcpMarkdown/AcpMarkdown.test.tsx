import { afterEach, describe, expect, it, mock } from "bun:test";
import {
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react/pure";
import { renderToStaticMarkup } from "react-dom/server";

const { AcpMarkdown } = await import("./AcpMarkdown");

afterEach(cleanup);

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

	it("linkifies plain and inline-code file paths with locations", () => {
		const markdown = "Open docs/guide.md:12:4 or `apps/desktop/src/main.ts:8`.";
		const html = renderToStaticMarkup(<AcpMarkdown>{markdown}</AcpMarkdown>);

		expect(html.match(/href="#superset-file=/g)).toHaveLength(2);
		expect(html).toContain("docs/guide.md:12:4</a>");
		expect(html).toContain("<code>apps/desktop/src/main.ts:8</code></a>");
	});

	it("linkifies inline-code URLs without including trailing punctuation", () => {
		const markdown =
			"See `https://example.com/docs?q=1`, then `www.example.com/help`.";
		const html = renderToStaticMarkup(<AcpMarkdown>{markdown}</AcpMarkdown>);

		expect(html).toContain('href="https://example.com/docs?q=1"');
		expect(html).toContain("<code>https://example.com/docs?q=1</code></a>");
		expect(html).toContain("</a>, then ");
		expect(html).toContain('href="https://www.example.com/help"');
	});

	it("preserves balanced URL parentheses and excludes unmatched punctuation", () => {
		const markdown = "https://example.com/a_(b)).";
		const html = renderToStaticMarkup(<AcpMarkdown>{markdown}</AcpMarkdown>);

		expect(html).toContain('href="https://example.com/a_(b)"');
		expect(html).toContain("</a>).");
	});

	it("does not linkify file paths or URLs inside fenced code", () => {
		const markdown = "```text\ndocs/guide.md\nhttps://example.com\n```";
		const html = renderToStaticMarkup(<AcpMarkdown>{markdown}</AcpMarkdown>);

		expect(html).not.toContain("<a ");
		expect(html).toContain("docs/guide.md");
		expect(html).toContain("https://example.com");
	});

	it("routes plain file clicks in-app and modifier clicks externally", () => {
		const onOpenFile = mock(() => {});
		render(
			<AcpMarkdown onOpenFile={onOpenFile}>docs/guide.md:12:4</AcpMarkdown>,
		);
		const link = screen.getByRole("link");

		fireEvent.click(link);
		fireEvent.click(link, { metaKey: true });

		expect(onOpenFile).toHaveBeenNthCalledWith(
			1,
			{ path: "docs/guide.md", line: 12, column: 4 },
			false,
		);
		expect(onOpenFile).toHaveBeenNthCalledWith(
			2,
			{ path: "docs/guide.md", line: 12, column: 4 },
			true,
		);
	});

	it("routes explicit relative Markdown links as files", () => {
		const onOpenFile = mock(() => {});
		render(
			<AcpMarkdown onOpenFile={onOpenFile}>
				{"[guide](docs/guide.md:9)"}
			</AcpMarkdown>,
		);

		fireEvent.click(screen.getByRole("link"));

		expect(onOpenFile).toHaveBeenCalledWith(
			{ path: "docs/guide.md", line: 9 },
			false,
		);
	});

	it("routes recognized web URLs through the app callback", () => {
		const onOpenUrl = mock(() => {});
		render(
			<AcpMarkdown onOpenUrl={onOpenUrl}>
				`https://example.com/docs`
			</AcpMarkdown>,
		);

		fireEvent.click(screen.getByRole("link"));

		expect(onOpenUrl).toHaveBeenCalledWith("https://example.com/docs");
	});
});
