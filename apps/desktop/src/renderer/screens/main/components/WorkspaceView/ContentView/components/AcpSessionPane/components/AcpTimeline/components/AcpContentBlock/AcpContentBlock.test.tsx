import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import type { ContentBlock } from "@superset/session-protocol";
import { createElement } from "react";
import { ensureHappyDom } from "test-utils/happy-dom-env";
import { AcpContentBlock } from "./AcpContentBlock";

let cleanup: typeof import("@testing-library/react/pure").cleanup;
let render: typeof import("@testing-library/react/pure").render;

beforeAll(async () => {
	await ensureHappyDom();
	({ cleanup, render } = await import("@testing-library/react/pure"));
});

afterEach(() => {
	cleanup();
});

describe("AcpContentBlock", () => {
	test("renders an agent image from its embedded ACP payload when it also has a URI", () => {
		const block: ContentBlock = {
			type: "image",
			data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ",
			mimeType: "image/png",
			uri: "file:///agent-private/generated-image.png",
		};

		const { container } = render(createElement(AcpContentBlock, { block }));
		const image = container.querySelector("img");

		expect(image).not.toBeNull();
		expect(image?.getAttribute("src")).toBe(
			"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ",
		);
	});
});
