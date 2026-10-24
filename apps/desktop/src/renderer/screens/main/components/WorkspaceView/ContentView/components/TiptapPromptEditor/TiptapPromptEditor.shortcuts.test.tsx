import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import type { ComponentProps, FormEvent } from "react";
import { createRef } from "react";
import { I18nProvider } from "renderer/providers/I18nProvider";
import { ensureHappyDom } from "test-utils/happy-dom-env";

let PromptInputProvider: typeof import("@superset/ui/ai-elements/prompt-input").PromptInputProvider;
let TiptapPromptEditor: typeof import("./TiptapPromptEditor").TiptapPromptEditor;
let act: typeof import("@testing-library/react/pure").act;
let cleanup: typeof import("@testing-library/react/pure").cleanup;
let fireEvent: typeof import("@testing-library/react/pure").fireEvent;
let render: typeof import("@testing-library/react/pure").render;
let screen: typeof import("@testing-library/react/pure").screen;
let waitFor: typeof import("@testing-library/react/pure").waitFor;

type EditorProps = ComponentProps<typeof TiptapPromptEditor>;

beforeAll(async () => {
	await ensureHappyDom();
	({ act, cleanup, fireEvent, render, screen, waitFor } = await import(
		"@testing-library/react/pure"
	));
	({ PromptInputProvider } = await import(
		"@superset/ui/ai-elements/prompt-input"
	));
	({ TiptapPromptEditor } = await import("./TiptapPromptEditor"));
});

afterEach(() => cleanup());

function renderEditor(overrides: Partial<EditorProps> = {}, initialInput = "") {
	const ref =
		createRef<import("./TiptapPromptEditor").TiptapPromptEditorHandle>();
	const onPasteFiles = mock((_files: File[]) => true);
	const onSubmit = mock((event: FormEvent<HTMLFormElement>) =>
		event.preventDefault(),
	);
	render(
		<I18nProvider>
			<PromptInputProvider initialInput={initialInput}>
				<form onSubmit={onSubmit}>
					<TiptapPromptEditor
						ref={ref}
						cwd="/repo"
						searchFiles={async () => [
							{
								id: "/repo/src/demo.ts",
								name: "demo.ts",
								relativePath: "src/demo.ts",
							},
						]}
						slashCommands={[
							{
								name: "review",
								aliases: [],
								description: "Review the change",
								argumentHint: "",
								kind: "custom",
							},
						]}
						onPasteFiles={onPasteFiles}
						{...overrides}
					/>
				</form>
			</PromptInputProvider>
		</I18nProvider>,
	);
	const input = document.querySelector<HTMLElement>("[contenteditable='true']");
	if (!input) throw new Error("Tiptap editor was not rendered");
	input.focus();
	return { input, onPasteFiles, onSubmit, ref };
}

function pasteImage(input: HTMLElement) {
	const image = new File(
		[
			Uint8Array.from(
				atob(
					"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9jAAAAABJRU5ErkJggg==",
				),
				(byte) => byte.charCodeAt(0),
			),
		],
		"pasted.png",
		{ type: "image/png" },
	);
	fireEvent.paste(input, {
		clipboardData: {
			items: [
				{
					kind: "file",
					getAsFile: () => image,
				},
			],
		},
	});
}

describe("TiptapPromptEditor shortcuts after an image paste", () => {
	test("keeps toolbar trigger insertion working", async () => {
		const { input, onPasteFiles, ref } = renderEditor();
		pasteImage(input);
		expect(onPasteFiles).toHaveBeenCalledTimes(1);
		expect(onPasteFiles).toHaveBeenLastCalledWith([
			expect.objectContaining({ name: "pasted.png", type: "image/png" }),
		]);

		await act(async () => ref.current?.insertTrigger("/"));
		expect(screen.getByRole("option", { name: /review/i })).toBeTruthy();
	});

	test("keeps command selection, submit, and newline shortcuts working", async () => {
		const { input, onPasteFiles, onSubmit, ref } = renderEditor();
		pasteImage(input);
		expect(onPasteFiles).toHaveBeenCalledTimes(1);

		await act(async () => ref.current?.insertTrigger("/"));
		fireEvent.keyDown(input, { key: "Enter" });
		expect(
			document.querySelector("[data-node-type='slash-command']"),
		).toBeTruthy();

		fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
		expect(input.textContent).toContain("/review");

		fireEvent.keyDown(input, { key: "Enter" });
		expect(onSubmit).toHaveBeenCalledTimes(1);
	});
});

describe("TiptapPromptEditor editable state", () => {
	test("restores focus after a transient disabled state", async () => {
		const editorNode = (disabled: boolean) => (
			<I18nProvider>
				<PromptInputProvider>
					<TiptapPromptEditor
						cwd="/repo"
						searchFiles={async () => []}
						slashCommands={[]}
						disabled={disabled}
					/>
				</PromptInputProvider>
			</I18nProvider>
		);
		const view = render(editorNode(false));
		const input = document.querySelector<HTMLElement>(
			"[contenteditable='true']",
		);
		if (!input) throw new Error("Tiptap editor was not rendered");
		input.focus();

		view.rerender(editorNode(true));
		await waitFor(() =>
			expect(input.getAttribute("contenteditable")).toBe("false"),
		);

		view.rerender(editorNode(false));
		await waitFor(() => expect(document.activeElement).toBe(input));
	});
});

describe("TiptapPromptEditor deletion", () => {
	test("allows the final character to be deleted", async () => {
		const { input, ref } = renderEditor({}, "x");
		await waitFor(() => expect(input.textContent).toBe("x"));
		act(() => ref.current?.focus());

		fireEvent.keyDown(input, { key: "Backspace" });

		expect(input.textContent).toBe("");
	});

	test("updates the empty-editor placeholder when the prop changes", async () => {
		const editorNode = (placeholder: string) => (
			<I18nProvider>
				<PromptInputProvider>
					<form>
						<TiptapPromptEditor
							cwd="/repo"
							searchFiles={async () => []}
							slashCommands={[]}
							placeholder={placeholder}
						/>
					</form>
				</PromptInputProvider>
			</I18nProvider>
		);
		const view = render(editorNode("Session unavailable"));
		const input = document.querySelector<HTMLElement>(
			"[contenteditable='true']",
		);
		if (!input) throw new Error("Tiptap editor was not rendered");
		const getPlaceholder = () =>
			input.querySelector<HTMLElement>("[data-placeholder]")?.dataset
				.placeholder ?? null;

		await waitFor(() => expect(getPlaceholder()).toBe("Session unavailable"));

		view.rerender(editorNode("Message agent…"));

		await waitFor(() => expect(getPlaceholder()).toBe("Message agent…"));
	});
});
