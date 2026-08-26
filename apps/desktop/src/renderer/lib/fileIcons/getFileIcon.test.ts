import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { getFileIcon } from "./getFileIcon";

const originalLocation = globalThis.location;

beforeAll(() => {
	Object.defineProperty(globalThis, "location", {
		configurable: true,
		value: { href: "http://localhost/" },
	});
});

afterAll(() => {
	Object.defineProperty(globalThis, "location", {
		configurable: true,
		value: originalLocation,
	});
});

describe("getFileIcon", () => {
	it.each([
		"index.html",
		"page.htm",
	])("uses the HTML icon for %s", (fileName) => {
		expect(getFileIcon(fileName, false).src).toBe(
			"http://localhost/file-icons/html.svg",
		);
	});
});
