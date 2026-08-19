import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import type { ContentBlock } from "@superset/session-protocol";
import { createElement } from "react";
import { ensureHappyDom } from "test-utils/happy-dom-env";
import { AcpContentBlock } from "./AcpContentBlock";

let cleanup: typeof import("@testing-library/react/pure").cleanup;
let fireEvent: typeof import("@testing-library/react/pure").fireEvent;
let render: typeof import("@testing-library/react/pure").render;
let screen: typeof import("@testing-library/react/pure").screen;

beforeAll(async () => {
	await ensureHappyDom();
	({ cleanup, fireEvent, render, screen } = await import(
		"@testing-library/react/pure"
	));
});

afterEach(() => {
	cleanup();
});

describe("AcpContentBlock", () => {
	test("renders an embedded message image as a compact preview", () => {
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
		expect(image?.style.maxHeight).toBe("160px");
		expect(image?.style.maxWidth).toBe("min(100%, 240px)");
	});

	test("opens a full-size preview when the thumbnail is clicked", () => {
		const block: ContentBlock = {
			type: "image",
			data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ",
			mimeType: "image/png",
			uri: "file:///agent-private/generated-image.png",
		};

		render(createElement(AcpContentBlock, { block }));

		const thumbnail = screen.getByRole("button", {
			name: "Open image preview",
		});
		fireEvent.click(thumbnail);

		const dialog = screen.getByRole("dialog", { name: "Image preview" });
		const preview = dialog.querySelector("img");
		expect(preview?.getAttribute("src")).toBe(
			"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ",
		);
		expect(preview?.style.maxHeight).toBe("85vh");
		expect(preview?.style.maxWidth).toBe("90vw");
	});
});
