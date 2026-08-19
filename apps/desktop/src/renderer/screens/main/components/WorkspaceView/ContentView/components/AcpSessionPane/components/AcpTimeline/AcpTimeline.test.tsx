import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import type {
	FoldedTimeline,
	MessageItem,
	PlanItem,
	TimelineItem,
	ToolCallItem,
} from "@superset/session-protocol";
import { type ComponentProps, createElement, Profiler } from "react";
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

describe("focus-only parent updates", () => {
	test("do not reconcile a long timeline", () => {
		const longTimeline = timeline(80);
		const onRespond = async () => {};
		const updateCosts: Array<{ actual: number; base: number }> = [];
		const onRender: React.ProfilerOnRenderCallback = (
			_id,
			phase,
			actual,
			base,
		) => {
			if (phase === "update") updateCosts.push({ actual, base });
		};
		const renderTree = (isFocused: boolean) => (
			<Profiler id="timeline" onRender={onRender}>
				<div data-focused={isFocused}>
					<AcpTimeline timeline={longTimeline} onRespond={onRespond} />
				</div>
			</Profiler>
		);

		const result = render(renderTree(true));
		act(() => result.rerender(renderTree(false)));
		act(() => result.rerender(renderTree(true)));
		expect(updateCosts).toHaveLength(2);
		expect(updateCosts.every(({ actual, base }) => actual < base * 0.1)).toBe(
			true,
		);
	});

	test("windows the DOM for a long semantic transcript", () => {
		const turnCount = 120;
		const items = Array.from({ length: turnCount }, (_, index) => [
			userMessage(index * 2 + 1),
			message(index * 2 + 2),
		]).flat();
		const result = render(
			createElement(AcpTimeline, {
				timeline: {
					...timeline(0),
					items,
					lastSeq: turnCount * 2,
				},
				onRespond: async () => {},
			}),
		);

		const renderedTurns = result.container.querySelectorAll(".acp-turn");
		expect(renderedTurns.length).toBeGreaterThan(0);
		expect(renderedTurns.length).toBeLessThan(turnCount);
		expect(
			result.container
				.querySelector(".acp-timeline__turns")
				?.getAttribute("style"),
		).toContain("height");
	});
});

describe("older history", () => {
	test("keeps loading lightweight and only offers a control after failure", () => {
		let loadCalls = 0;
		const onLoadOlder = async () => {
			loadCalls += 1;
		};
		const result = render(
			createElement(AcpTimeline, {
				timeline: timeline(1),
				onRespond: async () => {},
				hasOlder: true,
				onLoadOlder,
			}),
		);
		expect(screen.queryByRole("button")).toBeNull();
		result.rerender(
			createElement(AcpTimeline, {
				timeline: timeline(1),
				onRespond: async () => {},
				hasOlder: true,
				isLoadingOlder: true,
				onLoadOlder,
			}),
		);
		expect(screen.getByText("Loading earlier turns…")).toBeTruthy();
		result.rerender(
			createElement(AcpTimeline, {
				timeline: timeline(1),
				onRespond: async () => {},
				hasOlder: true,
				historyError: new Error("network failed"),
				onLoadOlder,
			}),
		);
		fireEvent.click(screen.getByRole("button", { name: "Retry" }));
		expect(loadCalls).toBe(1);
		result.unmount();
	});

	test("automatically loads older turns when the reader reaches the top", async () => {
		let loadCalls = 0;
		let release: (() => void) | undefined;
		const loading = new Promise<void>((resolve) => {
			release = resolve;
		});
		const result = render(
			createElement(AcpTimeline, {
				timeline: timeline(2),
				onRespond: async () => {},
				hasOlder: true,
				onLoadOlder: async () => {
					loadCalls += 1;
					await loading;
				},
			}),
		);
		const scroll = result.container.querySelector(
			".acp-pane__scroll",
		) as HTMLDivElement;
		setScrollMetrics(scroll, { clientHeight: 200, scrollHeight: 1_000 });
		scroll.scrollTop = 0;
		fireEvent.scroll(scroll);
		fireEvent.scroll(scroll);
		expect(loadCalls).toBe(1);
		release?.();
		await act(async () => {
			await loading;
		});
	});

	test("keeps the semantic reading anchor stable after an automatic prepend", async () => {
		let release: (() => void) | undefined;
		const loading = new Promise<void>((resolve) => {
			release = resolve;
		});
		const firstPage = {
			...timeline(0),
			items: [userMessage(3), message(4)],
		};
		const result = render(
			createElement(AcpTimeline, {
				timeline: firstPage,
				onRespond: async () => {},
				hasOlder: true,
				onLoadOlder: async () => {
					await loading;
				},
			}),
		);
		const scroll = result.container.querySelector(
			".acp-pane__scroll",
		) as HTMLDivElement;
		setScrollMetrics(scroll, { clientHeight: 200, scrollHeight: 1_000 });
		Object.defineProperty(scroll, "getBoundingClientRect", {
			configurable: true,
			value: () => ({ top: 100 }),
		});
		const anchor =
			result.container.querySelector<HTMLElement>("[data-turn-id]");
		if (!anchor) throw new Error("expected a loaded semantic turn");
		Object.defineProperty(anchor, "getBoundingClientRect", {
			configurable: true,
			value: () => ({ top: 260, bottom: 420 }),
		});
		fireEvent.scroll(scroll);

		result.rerender(
			createElement(AcpTimeline, {
				timeline: firstPage,
				onRespond: async () => {},
				hasOlder: true,
				isLoadingOlder: true,
				onLoadOlder: async () => {
					await loading;
				},
			}),
		);
		setScrollMetrics(scroll, { clientHeight: 200, scrollHeight: 1_250 });
		Object.defineProperty(anchor, "getBoundingClientRect", {
			configurable: true,
			value: () => ({ top: 510, bottom: 670 }),
		});
		release?.();
		await act(async () => {
			await loading;
		});
		result.rerender(
			createElement(AcpTimeline, {
				timeline: {
					...timeline(0),
					items: [userMessage(1), message(2), ...firstPage.items],
				},
				onRespond: async () => {},
				hasOlder: false,
				isLoadingOlder: false,
				onLoadOlder: async () => {},
			}),
		);

		expect(scroll.scrollTop).toBe(250);
	});

	test("shows the server total and unloaded rail markers", () => {
		const result = render(
			createElement(AcpTimeline, {
				timeline: {
					...timeline(0),
					items: [userMessage(3), message(4)],
				},
				onRespond: async () => {},
				totalTurns: 3,
				loadedTurnNumbers: [2],
				turnIndex: [
					{
						turnNumber: 1,
						startSeq: 1,
						endSeq: 2,
						userPreview: "old",
						agentPreview: "answer",
						isComplete: true,
					},
					{
						turnNumber: 2,
						startSeq: 3,
						endSeq: 4,
						userPreview: "middle",
						agentPreview: "answer",
						isComplete: true,
					},
					{
						turnNumber: 3,
						startSeq: 5,
						endSeq: 6,
						userPreview: "latest",
						agentPreview: "answer",
						isComplete: true,
					},
				],
			}),
		);
		expect(screen.queryByText("Turn 2 / 3")).toBeNull();
		expect(result.container.querySelectorAll(".acp-turn-marker")).toHaveLength(
			3,
		);
		expect(
			result.container.querySelector('[data-loaded="false"]'),
		).toBeTruthy();
	});
});

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

	test("loads an unloaded rail turn before locating it", async () => {
		let rendered: ReturnType<typeof render>;
		let loadCalls = 0;
		const index = [
			{
				turnNumber: 1,
				startSeq: 1,
				endSeq: 2,
				userPreview: "old",
				agentPreview: "answer",
				isComplete: true,
			},
			{
				turnNumber: 2,
				startSeq: 3,
				endSeq: 4,
				userPreview: "latest",
				agentPreview: "answer",
				isComplete: true,
			},
		];
		const latest = [userMessage(3), message(4)];
		const all = [userMessage(1), message(2), ...latest];
		const props = (items: TimelineItem[]) => ({
			timeline: { ...timeline(0), items },
			onRespond: async () => {},
			totalTurns: 2,
			turnIndex: index,
			loadedTurnNumbers: items === latest ? [2] : [1, 2],
			onLoadTurn: async () => {
				loadCalls += 1;
				rendered.rerender(createElement(AcpTimeline, props(all)));
			},
		});
		rendered = render(createElement(AcpTimeline, props(latest)));

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /^Turn 1,/ }));
			await new Promise((resolve) => setTimeout(resolve, 40));
		});
		expect(loadCalls).toBe(1);
		expect(
			(rendered.container.querySelector(".acp-pane__scroll") as HTMLElement)
				.dataset.jumpingToUser,
		).toBe("true");
	});
});

describe("AcpTimeline scrolling", () => {
	test("keeps the reading position stable when an older page is prepended", () => {
		const onLoadOlder = async () => {};
		const firstPage = timeline(2);
		const result = render(
			createElement(AcpTimeline, {
				timeline: firstPage,
				onRespond: async () => {},
				hasOlder: true,
				historyError: new Error("first request failed"),
				onLoadOlder,
			}),
		);
		const scroll = result.container.querySelector(
			".acp-pane__scroll",
		) as HTMLDivElement;
		setScrollMetrics(scroll, { clientHeight: 200, scrollHeight: 1_000 });
		scroll.scrollTop = 260;
		fireEvent.scroll(scroll);
		fireEvent.click(screen.getByRole("button", { name: "Retry" }));

		result.rerender(
			createElement(AcpTimeline, {
				timeline: firstPage,
				onRespond: async () => {},
				hasOlder: true,
				isLoadingOlder: true,
				onLoadOlder,
			}),
		);
		setScrollMetrics(scroll, { clientHeight: 200, scrollHeight: 1_450 });
		result.rerender(
			createElement(AcpTimeline, {
				timeline: timeline(3),
				onRespond: async () => {},
				hasOlder: false,
				isLoadingOlder: false,
				onLoadOlder,
			}),
		);

		expect(scroll.scrollTop).toBe(710);
	});

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

	test("returns to the latest item after an auto-following hidden tab is shown", () => {
		let pendingFrame: FrameRequestCallback | undefined;
		const originalRequestAnimationFrame = window.requestAnimationFrame;
		const originalCancelAnimationFrame = window.cancelAnimationFrame;
		window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
			pendingFrame = callback;
			return 1;
		}) as typeof window.requestAnimationFrame;
		window.cancelAnimationFrame =
			(() => {}) as typeof window.cancelAnimationFrame;

		try {
			const onRespond = async () => {};
			const hiddenTimeline = timeline(3);
			const initialTimeline = timeline(2);
			const result = render(
				createElement(AcpTimeline, {
					timeline: initialTimeline,
					onRespond,
					isFocused: true,
				}),
			);
			const body = result.container.querySelector(
				".acp-pane__scroll",
			) as HTMLDivElement;

			// Reproduce the real lifecycle: the visited tab remains mounted, but its
			// ancestor becomes display:none before the stream update arrives.
			result.rerender(
				createElement(AcpTimeline, {
					timeline: initialTimeline,
					onRespond,
					isFocused: false,
				}),
			);
			setScrollMetrics(body, { clientHeight: 0, scrollHeight: 0 });

			// A stream update while display:none records a zero scroll height.
			result.rerender(
				createElement(AcpTimeline, {
					timeline: hiddenTimeline,
					onRespond,
					isFocused: false,
				}),
			);
			expect(body.scrollTop).toBe(0);

			// Layout becomes measurable only after the tab is displayed. The focus
			// effect must wait for rAF rather than retaining the hidden zero.
			setScrollMetrics(body, { clientHeight: 100, scrollHeight: 1_300 });
			result.rerender(
				createElement(AcpTimeline, {
					timeline: hiddenTimeline,
					onRespond,
					isFocused: true,
				}),
			);
			expect(body.scrollTop).toBe(0);
			expect(pendingFrame).toBeTruthy();
			act(() => pendingFrame?.(0));
			expect(body.scrollTop).toBe(1_300);
		} finally {
			window.requestAnimationFrame = originalRequestAnimationFrame;
			window.cancelAnimationFrame = originalCancelAnimationFrame;
		}
	});

	test("keeps a manual reading position when a hidden tab is shown", async () => {
		const onRespond = async () => {};
		const hiddenTimeline = timeline(3);
		const result = render(
			createElement(AcpTimeline, {
				timeline: timeline(2),
				onRespond,
				isFocused: true,
			}),
		);
		const body = result.container.querySelector(
			".acp-pane__scroll",
		) as HTMLDivElement;
		setScrollMetrics(body, { clientHeight: 100, scrollHeight: 1_000 });

		await act(async () => {
			body.scrollTop = 200;
			fireEvent.scroll(body);
		});

		setScrollMetrics(body, { clientHeight: 0, scrollHeight: 0 });
		result.rerender(
			createElement(AcpTimeline, {
				timeline: hiddenTimeline,
				onRespond,
				isFocused: false,
			}),
		);
		setScrollMetrics(body, { clientHeight: 100, scrollHeight: 1_300 });
		result.rerender(
			createElement(AcpTimeline, {
				timeline: hiddenTimeline,
				onRespond,
				isFocused: true,
			}),
		);

		expect(body.scrollTop).toBe(200);
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

	test("stays visible for any timeline activity while running", () => {
		const user = { ...message(1), role: "user" as const };
		const agent = message(2);
		expect(shouldShowWorkingIndicator([user, agent], "running")).toBeTrue();
		expect(
			shouldShowWorkingIndicator([user, tool(2, "in_progress")], "running"),
		).toBeTrue();
		expect(
			shouldShowWorkingIndicator([user, tool(2, "pending")], "running"),
		).toBeTrue();
		expect(
			shouldShowWorkingIndicator([user, tool(2, "completed")], "running"),
		).toBeTrue();
	});

	test("renders below an in-progress tool while the session is running", () => {
		render(
			createElement(AcpTimeline, {
				timeline: {
					...timeline(0),
					items: [userMessage(1), tool(2, "in_progress")],
				},
				onRespond: async () => {},
				status: "running",
			}),
		);

		expect(screen.getByRole("status").textContent).toContain("Working…");
	});

	test("hides the indicator outside running status", () => {
		const user = { ...message(1), role: "user" as const };
		expect(
			shouldShowWorkingIndicator([user] as TimelineItem[], "idle"),
		).toBeFalse();
		expect(
			shouldShowWorkingIndicator([user] as TimelineItem[], "dead"),
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
