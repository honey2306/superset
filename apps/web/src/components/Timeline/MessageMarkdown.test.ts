import { expect, test } from "bun:test";
import { getSafeMarkdownLinkHref } from "./MessageMarkdown";

test("permits ordinary web and mail links in assistant markdown", () => {
	expect(getSafeMarkdownLinkHref("https://superset.sh/docs")).toBe(
		"https://superset.sh/docs",
	);
	expect(getSafeMarkdownLinkHref("mailto:hello@example.com")).toBe(
		"mailto:hello@example.com",
	);
});

test("rejects executable and unsupported markdown link schemes", () => {
	expect(getSafeMarkdownLinkHref("javascript:alert(1)")).toBeUndefined();
	expect(getSafeMarkdownLinkHref("data:text/html,boom")).toBeUndefined();
});
