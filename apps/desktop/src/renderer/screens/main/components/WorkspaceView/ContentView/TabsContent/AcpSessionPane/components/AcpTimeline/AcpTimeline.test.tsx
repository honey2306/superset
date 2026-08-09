import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import type {
	FoldedTimeline,
	MessageItem,
	TimelineItem,
	ToolCallItem,
} from "@superset/session-protocol";
import { type ComponentProps, createElement } from "react";
import { ensureHappyDom } from "test-utils/happy-dom-env";
import {
	type AcpTimeline as AcpTimelineComponent,
	shouldShowWorkingIndicator,
} from "./AcpTimeline";

let AcpTimeline: typeof AcpTimelineComponent;
let act: typeof import("@testing-library/react/pure").act;
let cleanup: typeof import("@testing-library/react/pure").cleanup;
let fireEvent: typeof import("@testing-library/react/pure").fireEvent;
let render: typeof import("@testing-library/react/pure").render;
let screen: typeof import("@testing-library/react/pure").screen;

beforeAll(async () => {
	await ensureHappyDom();
	({ act, cleanup, fireEvent, render, screen } = await import(
		"@testing-library/react/pure"
	));
	({ AcpTimeline } = await import("./AcpTimeline"));
});

afterEach(() => {
	cleanup();
});

function message(sequence: number): MessageItem {
	return {
		kind: "message",
		id: `agent:${sequence}`,
		role: "agent",
		blocks: [{ type: "text", text: `message ${sequence}` }],
		failed: false,
		startSeq: sequence,
		endSeq: sequence,
	};
}

function timeline(count: number): FoldedTimeline {
	return {
		items: Array.from({ length: count }, (_, index) => message(index + 1)),
		meta: {
			title: null,
			usage: null,
			currentMode: null,
			configOptions: null,
			availableCommands: null,
		},
		state: null,
		lastSeq: count,
		resetReason: null,
	};
}

function tool(
	sequence: number,
	status: "completed" | "in_progress" | "pending",
): ToolCallItem {
	return {
		kind: "tool_call",
		id: `tool:${sequence}`,
		call: { toolCallId: `tool-${sequence}`, title: "Bash", status },
		permissions: [],
		children: [],
		terminals: {},
		startSeq: sequence,
		endSeq: sequence,
	};
}

function renderTimeline(initialTimeline: FoldedTimeline) {
	const props: ComponentProps<typeof AcpTimelineComponent> = {
		timeline: initialTimeline,
		onRespond: async () => {},
	};
	return render(createElement(AcpTimeline, props));
}

function setScrollMetrics(
	element: HTMLDivElement,
	{
		clientHeight,
		scrollHeight,
	}: { clientHeight: number; scrollHeight: number },
) {
	Object.defineProperties(element, {
		clientHeight: { configurable: true, value: clientHeight },
		scrollHeight: { configurable: true, value: scrollHeight },
	});
}

describe("AcpTimeline scrolling", () => {
	test("preserves a manual reading position when new timeline items arrive", async () => {
		const result = renderTimeline(timeline(2));
		const body = result.container.querySelector(
			".acp-pane__scroll",
		) as HTMLDivElement;
		setScrollMetrics(body, { clientHeight: 100, scrollHeight: 1_000 });

		await act(async () => {
			body.scrollTop = 200;
			fireEvent.scroll(body);
		});
		expect(screen.getByRole("button", { name: "Jump to latest" })).toBeTruthy();

		setScrollMetrics(body, { clientHeight: 100, scrollHeight: 1_300 });
		result.rerender(
			createElement(AcpTimeline, {
				timeline: timeline(3),
				onRespond: async () => {},
			}),
		);

		expect(body.scrollTop).toBe(200);
	});

	test("follows new items near the bottom and jumps to the latest item on demand", async () => {
		const result = renderTimeline(timeline(2));
		const body = result.container.querySelector(
			".acp-pane__scroll",
		) as HTMLDivElement;
		setScrollMetrics(body, { clientHeight: 100, scrollHeight: 1_000 });

		await act(async () => {
			body.scrollTop = 900;
			fireEvent.scroll(body);
		});
		expect(screen.queryByRole("button", { name: "Jump to latest" })).toBeNull();

		setScrollMetrics(body, { clientHeight: 100, scrollHeight: 1_400 });
		result.rerender(
			createElement(AcpTimeline, {
				timeline: timeline(3),
				onRespond: async () => {},
			}),
		);
		expect(body.scrollTop).toBe(1_400);

		await act(async () => {
			body.scrollTop = 250;
			fireEvent.scroll(body);
		});
		fireEvent.click(screen.getByRole("button", { name: "Jump to latest" }));
		expect(body.scrollTop).toBe(1_400);
		expect(screen.queryByRole("button", { name: "Jump to latest" })).toBeNull();
	});
});

describe("subagent rendering", () => {
	test("renders a tool with nested activity as a subagent card", () => {
		const child = tool(2, "in_progress");
		const parent = {
			...tool(1, "in_progress"),
			call: {
				toolCallId: "task-1",
				title: "Inspect the ACP lifecycle",
				status: "in_progress" as const,
				rawInput: { subagent_type: "Explore" },
			},
			children: [child],
		};
		renderTimeline({ ...timeline(0), items: [parent] });

		expect(screen.getByText("SUBAGENT")).toBeTruthy();
		expect(screen.getByText("Explore")).toBeTruthy();
		expect(screen.getByText("Inspect the ACP lifecycle")).toBeTruthy();
		expect(screen.getByText("1 tool")).toBeTruthy();
	});
});

describe("working indicator", () => {
	test("renders after a user message while a running session has no visible activity", () => {
		const initialTimeline = { ...timeline(0), items: [message(1)] };
		initialTimeline.items[0] = {
			...initialTimeline.items[0],
			role: "user",
		};
		render(
			createElement(AcpTimeline, {
				timeline: initialTimeline,
				onRespond: async () => {},
				status: "running",
			}),
		);

		expect(screen.getByRole("status").textContent).toContain("Working…");
	});

	test("does not duplicate visible activity or appear outside running status", () => {
		const user = { ...message(1), role: "user" as const };
		const agent = message(2);
		expect(shouldShowWorkingIndicator([user, agent], "running")).toBeFalse();
		expect(
			shouldShowWorkingIndicator([user, tool(2, "in_progress")], "running"),
		).toBeFalse();
		expect(
			shouldShowWorkingIndicator([user, tool(2, "pending")], "running"),
		).toBeFalse();
		expect(
			shouldShowWorkingIndicator([user] as TimelineItem[], "idle"),
		).toBeFalse();
	});

	test("returns after a completed tool while the session is still running", () => {
		const user = { ...message(1), role: "user" as const };
		expect(
			shouldShowWorkingIndicator([user, tool(2, "completed")], "running"),
		).toBeTrue();
	});
});
