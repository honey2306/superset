import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { ensureHappyDom } from "test-utils/happy-dom-env";

const navigateMock = mock(() => {});
const startAtPathMock = mock(async (_path: string) => null);

mock.module("@tanstack/react-router", () => ({
	useNavigate: () => navigateMock,
}));
mock.module("renderer/providers/I18nProvider", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));
mock.module(
	"renderer/routes/_local/_dashboard/components/AddRepositoryModals/hooks/useFolderFirstImport",
	() => ({
		useFolderFirstImport: () => ({
			isPending: false,
			startAtPath: startAtPathMock,
		}),
	}),
);

let SidebarDropZone: typeof import("./SidebarDropZone").SidebarDropZone;
let cleanup: typeof import("@testing-library/react/pure").cleanup;
let render: typeof import("@testing-library/react/pure").render;

beforeAll(async () => {
	await ensureHappyDom();
	({ cleanup, render } = await import("@testing-library/react/pure"));
	({ SidebarDropZone } = await import("./SidebarDropZone"));
});

afterEach(() => {
	cleanup();
	startAtPathMock.mockClear();
	navigateMock.mockClear();
});

function dispatchDragEvent(
	element: Element,
	type: "dragover" | "drop",
	dragTypes: string[],
) {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperty(event, "dataTransfer", {
		value: {
			types: dragTypes,
			files: [],
		},
	});
	element.dispatchEvent(event);
	return event;
}

describe("SidebarDropZone", () => {
	test("does not consume react-dnd dragover events", () => {
		const result = render(
			<SidebarDropZone>
				<div data-testid="child" />
			</SidebarDropZone>,
		);
		const event = dispatchDragEvent(result.getByTestId("child"), "dragover", [
			"application/x-react-dnd",
		]);

		expect(event.defaultPrevented).toBe(false);
	});

	test("does not consume react-dnd drop events", () => {
		const result = render(
			<SidebarDropZone>
				<div data-testid="child" />
			</SidebarDropZone>,
		);
		const event = dispatchDragEvent(result.getByTestId("child"), "drop", [
			"application/x-react-dnd",
		]);

		expect(event.defaultPrevented).toBe(false);
		expect(startAtPathMock).not.toHaveBeenCalled();
	});
});
