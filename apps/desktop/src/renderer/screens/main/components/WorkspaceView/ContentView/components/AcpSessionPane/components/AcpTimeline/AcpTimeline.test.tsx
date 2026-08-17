import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import type {
	FoldedTimeline,
	MessageItem,
	PlanItem,
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
	window.localStorage.clear();
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

function userMessage(sequence: number): MessageItem {
	return {
		...message(sequence),
		id: `user:${sequence}`,
		role: "user",
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

function plan(sequence: number): PlanItem {
	return {
		kind: "plan",
		id: `plan:${sequence}`,
		entries: [
			{
				content: "Inspect ACP timeline",
				status: "completed",
				priority: "medium",
			},
			{
				content: "Keep plan docked",
				status: "in_progress",
				priority: "medium",
			},
			{
				content: "Verify behavior",
				status: "pending",
				priority: "medium",
			},
		],
		removed: false,
		startSeq: sequence,
		endSeq: sequence,
	};
}

function tool(
	sequence: number,
	status: "completed" | "in_progress" | "pending",
): ToolCallItem {
	return {
		kind: "tool_call",
		id: `tool:${sequence}`,
		call: {
			toolCallId: `tool-${sequence}`,
			title: "Bash",
			kind: "execute",
			status,
			locations: [],
		},
		semantics: { kind: "tool" },
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

describe("plan dock", () => {
	test("hides a plan after every entry is completed", () => {
		const completedPlan = plan(2);
		completedPlan.entries = completedPlan.entries.map((entry) => ({
			...entry,
			status: "completed",
		}));
		const result = renderTimeline({
			...timeline(0),
			items: [message(1), completedPlan, message(3)],
		});

		expect(result.container.querySelector(".acp-plan-dock")).toBeNull();
		expect(result.container.querySelector(".acp-plan")).toBeNull();
	});

	test("keeps the active plan collapsed below the scrolling timeline", () => {
		const result = renderTimeline({
			...timeline(0),
			items: [message(1), plan(2), message(3)],
		});

		const scroll = result.container.querySelector(".acp-pane__scroll");
		const dock = result.container.querySelector(".acp-plan-dock");
		expect(scroll?.nextElementSibling).toBe(dock);
		expect(scroll?.querySelector(".acp-plan")).toBeNull();
		expect(dock?.querySelector(".acp-plan")).toBeNull();
		expect(screen.getByText("1/3")).toBeTruthy();
		expect(screen.getByText("Keep plan docked")).toBeTruthy();
		expect(
			screen
				.getByRole("button", { name: "Expand plan" })
				.getAttribute("aria-expanded"),
		).toBe("false");
	});

	test("reveals the existing plan card when clicked", () => {
		const result = renderTimeline({
			...timeline(0),
			items: [message(1), plan(2), message(3)],
		});

		fireEvent.click(screen.getByRole("button", { name: "Expand plan" }));

		expect(
			result.container.querySelector(".acp-plan-dock .acp-plan"),
		).toBeTruthy();
		expect(screen.getByRole("button", { name: "Collapse plan" })).toBeTruthy();
		expect(screen.getByText("Inspect ACP timeline")).toBeTruthy();
		expect(screen.getByText("Verify behavior")).toBeTruthy();
	});
});

describe("turn navigation", () => {
	test("renders one numbered marker for each user turn", () => {
		const result = renderTimeline({
			...timeline(0),
			items: [
				message(1),
				userMessage(2),
				message(3),
				userMessage(4),
				message(5),
			],
		});

		const markers = result.container.querySelectorAll(".acp-turn-marker");
		const rail = result.container.querySelector(".acp-turn-rail");
		const scroll = result.container.querySelector(".acp-pane__scroll");
		expect(markers).toHaveLength(2);
		expect(rail).toBeTruthy();
		expect(scroll?.contains(rail)).toBeFalse();
		expect(markers[0]?.getAttribute("aria-label")).toContain(
			"Turn 1, Complete. You: message 2. Agent: message 3",
		);
		expect(markers[1]?.getAttribute("aria-label")).toContain(
			"Turn 2, Complete. You: message 4. Agent: message 5",
		);
	});

	test("navigates to a turn and marks it active when clicked", () => {
		const result = renderTimeline({
			...timeline(0),
			items: [userMessage(1), message(2), userMessage(3), message(4)],
		});
		const firstTurn = result.container.querySelector<HTMLElement>(
			'[data-turn-number="1"]',
		) as HTMLElement;
		const scroll = result.container.querySelector(
			".acp-pane__scroll",
		) as HTMLDivElement;
		Object.defineProperties(scroll, {
			scrollTop: { configurable: true, writable: true, value: 150 },
			getBoundingClientRect: {
				configurable: true,
				value: () => ({ top: 100 }),
			},
		});
		Object.defineProperty(firstTurn, "getBoundingClientRect", {
			configurable: true,
			value: () => ({ top: 300 }),
		});

		fireEvent.click(screen.getByRole("button", { name: /^Turn 1,/ }));

		expect(scroll.scrollTop).toBe(326);
		expect(scroll.dataset.jumpingToUser).toBe("true");
		expect(
			screen
				.getByRole("button", { name: /^Turn 1,/ })
				.getAttribute("aria-current"),
		).toBe("step");
	});
});

describe("AcpTimeline scrolling", () => {
	test("scrolls to the bottom when a new user message arrives", async () => {
		const result = renderTimeline(timeline(2));
		const body = result.container.querySelector(
			".acp-pane__scroll",
		) as HTMLDivElement;
		setScrollMetrics(body, { clientHeight: 100, scrollHeight: 1_000 });

		await act(async () => {
			body.scrollTop = 200;
			fireEvent.scroll(body);
		});

		setScrollMetrics(body, { clientHeight: 100, scrollHeight: 1_300 });
		result.rerender(
			createElement(AcpTimeline, {
				timeline: {
					...timeline(2),
					items: [...timeline(2).items, userMessage(3)],
				},
				onRespond: async () => {},
			}),
		);

		expect(body.scrollTop).toBe(1_300);
		expect(screen.queryByRole("button", { name: "Jump to latest" })).toBeNull();
	});

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

describe("turn collapsing", () => {
	test("does not collapse the latest turn while the session is still running", async () => {
		window.localStorage.setItem(
			"acp-turn-durations:session-running",
			JSON.stringify({ "user:1": { s: Date.now() - 4_000 } }),
		);
		render(
			createElement(AcpTimeline, {
				timeline: {
					...timeline(0),
					items: [
						userMessage(1),
						tool(2, "completed"),
						message(3),
						tool(4, "completed"),
					],
				},
				onRespond: async () => {},
				sessionId: "session-running",
				status: "running",
			}),
		);
		await act(async () => {});

		expect(screen.queryByText(/执行过程/)).toBeNull();
		expect(screen.getAllByText("Bash")).toHaveLength(2);
		const working = screen.getByText("Working…").closest("output");
		expect(working?.textContent).toContain("4s");
		expect(screen.queryByLabelText("Turn duration 4s")).toBeNull();
	});
});

describe("turn durations", () => {
	test("hides a completed turn duration when there is no process summary", async () => {
		window.localStorage.setItem(
			"acp-turn-durations:session-1",
			JSON.stringify({ "user:1": { s: 1_000, e: 3_500 } }),
		);

		render(
			createElement(AcpTimeline, {
				timeline: {
					...timeline(0),
					items: [userMessage(1), message(2)],
				},
				onRespond: async () => {},
				sessionId: "session-1",
				status: "idle",
			}),
		);

		await act(async () => {});
		expect(screen.queryByText(/耗时/)).toBeNull();
	});

	test("shows duration inside a collapsible process summary", async () => {
		window.localStorage.setItem(
			"acp-turn-durations:session-with-tools",
			JSON.stringify({ "user:1": { s: 1_000, e: 3_500 } }),
		);

		render(
			createElement(AcpTimeline, {
				timeline: {
					...timeline(0),
					items: [userMessage(1), tool(2, "completed"), message(3)],
				},
				onRespond: async () => {},
				sessionId: "session-with-tools",
				status: "idle",
			}),
		);

		await act(async () => {});
		expect(screen.getByText("耗时 3s")).toBeTruthy();
	});
});

describe("subagent rendering", () => {
	test("renders a completed workflow's primary output instead of its JSON envelope", () => {
		const item: ToolCallItem = {
			...tool(1, "completed"),
			call: {
				...tool(1, "completed").call,
				title: "subagent",
				kind: "other",
			},
			semantics: {
				kind: "subagent",
				task: "Review the implementation",
				agentType: "reviewer",
				result: [
					{
						content: [{ type: "text", text: "## Review\n\nReadable finding" }],
					},
				],
			},
		};
		renderTimeline({ ...timeline(0), items: [item] });

		fireEvent.click(screen.getByRole("button", { name: /subagent/i }));

		expect(screen.getByRole("heading", { name: "Review" })).toBeTruthy();
		expect(screen.getByText("Readable finding")).toBeTruthy();
		expect(screen.queryByText(/artifactPaths/)).toBeNull();
		expect(screen.queryByText(/private\/session\.jsonl/)).toBeNull();
	});

	test("renders a tool with nested activity as a subagent card", () => {
		const child = tool(2, "in_progress");
		const parent = {
			...tool(1, "in_progress"),
			call: {
				toolCallId: "task-1",
				title: "Inspect the ACP lifecycle",
				kind: "other" as const,
				status: "in_progress" as const,
				locations: [],
				rawInput: { subagent_type: "Explore" },
			},
			semantics: {
				kind: "subagent" as const,
				task: "Inspect the ACP lifecycle",
				agentType: "Explore",
				result: [],
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

	test("stays visible while a subagent tool is running", () => {
		const user = { ...message(1), role: "user" as const };
		const subagent = {
			...tool(2, "in_progress"),
			semantics: {
				kind: "subagent" as const,
				task: "Inspect repository",
				agentType: null,
				result: [],
			},
		};

		expect(shouldShowWorkingIndicator([user, subagent], "running")).toBeTrue();
	});

	test("returns after a completed tool while the session is still running", () => {
		const user = { ...message(1), role: "user" as const };
		expect(
			shouldShowWorkingIndicator([user, tool(2, "completed")], "running"),
		).toBeTrue();
	});
});
