import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { ensureHappyDom } from "test-utils/happy-dom-env";
import { TerminalRef } from "./TerminalRef";

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

describe("TerminalRef", () => {
	test("reveals real agent command/output on demand and keeps the adapter id secondary", () => {
		render(
			createElement(TerminalRef, {
				terminalId: "adapter-tool-42",
				title: "Run test suite",
				rawInput: { command: "bun run test" },
				rawOutput: { stdout: "59 passed" },
				status: "completed",
			}),
		);

		const toggle = screen.getByRole("button", {
			name: "Show agent command details",
		});
		expect(toggle.getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByText("59 passed")).toBeNull();

		fireEvent.click(toggle);

		expect(toggle.getAttribute("aria-expanded")).toBe("true");
		expect(screen.getAllByText("bun run test")).toHaveLength(2);
		expect(screen.getByText("59 passed")).toBeTruthy();
		expect(screen.getByText("adapter-tool-42")).toBeTruthy();
	});

	test("does not render an output section when the adapter sent none", () => {
		render(
			createElement(TerminalRef, {
				terminalId: "adapter-tool-empty",
				title: "Inspect files",
				status: "in_progress",
			}),
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Show agent command details" }),
		);

		expect(screen.queryByText("Output")).toBeNull();
		expect(screen.getByText("adapter-tool-empty")).toBeTruthy();
	});

	test("renders the matching normalized Pi stream rather than raw output", () => {
		render(
			createElement(TerminalRef, {
				terminalId: "pi-opaque-1",
				rawOutput: { stdout: "stale output" },
				terminal: {
					terminalId: "pi-opaque-1",
					output: "live Pi output",
					cwd: "/repo",
					exitCode: 0,
					signal: null,
				},
			}),
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Show agent command details" }),
		);

		expect(screen.getByText("live Pi output")).toBeTruthy();
		expect(screen.queryByText("stale output")).toBeNull();
		expect(screen.getByText("/repo")).toBeTruthy();
		expect(screen.getByText("0")).toBeTruthy();
	});
});
