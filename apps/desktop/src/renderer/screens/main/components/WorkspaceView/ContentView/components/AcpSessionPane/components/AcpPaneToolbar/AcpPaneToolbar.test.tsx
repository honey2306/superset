import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { ensureHappyDom } from "test-utils/happy-dom-env";
import type { AcpPaneToolbar as AcpPaneToolbarComponent } from "./AcpPaneToolbar";
import {
	ELAPSED_STORAGE_PREFIX,
	finalizeElapsed,
	mergeStoredElapsedState,
	parseStoredElapsedState,
	type StoredElapsedState,
	serializeStoredElapsedState,
	startOrResumeElapsed,
} from "./AcpPaneToolbar";

let AcpPaneToolbar: typeof AcpPaneToolbarComponent;
let act: typeof import("@testing-library/react/pure").act;
let cleanup: typeof import("@testing-library/react/pure").cleanup;
let render: typeof import("@testing-library/react/pure").render;
let screen: typeof import("@testing-library/react/pure").screen;

beforeAll(async () => {
	await ensureHappyDom();
	({ act, cleanup, render, screen } = await import(
		"@testing-library/react/pure"
	));
	({ AcpPaneToolbar } = await import("./AcpPaneToolbar"));
});

const originalDateNow = Date.now;

afterEach(() => {
	cleanup();
	window.localStorage.clear();
	Date.now = originalDateNow;
});

function state(
	overrides: Partial<StoredElapsedState> = {},
): StoredElapsedState {
	return {
		accumulatedMs: 0,
		runningSince: null,
		lastObservedAt: null,
		...overrides,
	};
}

function storageKey(sessionId: string): string {
	return ELAPSED_STORAGE_PREFIX + sessionId;
}

function renderToolbar(status: "idle" | "running", sessionId = "session-1") {
	return render(
		createElement(AcpPaneToolbar, {
			title: "Test task",
			agentLabel: "Agent",
			status,
			sessionId,
			paneActions: null,
		}),
	);
}

describe("elapsed state persistence", () => {
	test("reads the legacy numeric storage format", () => {
		expect(parseStoredElapsedState("2500")).toEqual(
			state({ accumulatedMs: 2500 }),
		);
	});

	test("serializes an active anchor and resumes it without resetting the start", () => {
		const active = state({
			accumulatedMs: 1_500,
			runningSince: 10_000,
			lastObservedAt: 11_000,
		});
		const encoded = serializeStoredElapsedState(active);
		expect(parseStoredElapsedState(encoded)).toEqual(active);
		expect(startOrResumeElapsed(active, 20_000)).toEqual({
			...active,
			lastObservedAt: 20_000,
		});
	});

	test("caps a stale run at its last mounted observation", () => {
		expect(
			finalizeElapsed(
				state({
					accumulatedMs: 1_000,
					runningSince: 10_000,
					lastObservedAt: 14_000,
				}),
				20_000,
				true,
			),
		).toEqual(
			state({
				accumulatedMs: 5_000,
				lastObservedAt: 20_000,
			}),
		);
	});

	test("does not let an older mounted instance overwrite a newer total", () => {
		const newer = state({ accumulatedMs: 6_000, lastObservedAt: 20_000 });
		const stale = state({
			accumulatedMs: 2_000,
			runningSince: 10_000,
			lastObservedAt: 15_000,
		});

		expect(mergeStoredElapsedState(newer, stale)).toEqual(newer);
	});
});

describe("AcpPaneToolbar elapsed display", () => {
	test("keeps the persisted running anchor across an unmount and remount", async () => {
		let now = 10_000;
		Date.now = () => now;
		const first = renderToolbar("running");
		await act(async () => {});

		expect(
			JSON.parse(
				window.localStorage.getItem(storageKey("session-1")) ?? "null",
			),
		).toEqual({
			accumulatedMs: 0,
			runningSince: 10_000,
			lastObservedAt: 10_000,
		});

		now = 15_000;
		first.unmount();
		expect(
			JSON.parse(
				window.localStorage.getItem(storageKey("session-1")) ?? "null",
			),
		).toMatchObject({ runningSince: 10_000 });

		renderToolbar("running");
		await act(async () => {});
		expect(screen.getByText("用时 5s")).toBeTruthy();
	});

	test("finalizes an active run on a real running-to-idle transition", async () => {
		let now = 10_000;
		Date.now = () => now;
		const result = renderToolbar("running");
		now = 13_500;
		result.rerender(
			createElement(AcpPaneToolbar, {
				title: "Test task",
				agentLabel: "Agent",
				status: "idle",
				sessionId: "session-1",
				paneActions: null,
			}),
		);
		await act(async () => {});

		expect(
			JSON.parse(
				window.localStorage.getItem(storageKey("session-1")) ?? "null",
			),
		).toMatchObject({ accumulatedMs: 3_500, runningSince: null });
		expect(screen.getByText("用时 3s")).toBeTruthy();
	});

	test("keeps the toolbar counter as the total across multiple turns", async () => {
		let now = 10_000;
		Date.now = () => now;
		const result = renderToolbar("running");
		await act(async () => {});

		now = 13_000;
		result.rerender(
			createElement(AcpPaneToolbar, {
				title: "Test task",
				agentLabel: "Agent",
				status: "idle",
				sessionId: "session-1",
				paneActions: null,
			}),
		);
		await act(async () => {});

		now = 20_000;
		result.rerender(
			createElement(AcpPaneToolbar, {
				title: "Test task",
				agentLabel: "Agent",
				status: "running",
				sessionId: "session-1",
				paneActions: null,
			}),
		);
		await act(async () => {});

		now = 24_000;
		result.rerender(
			createElement(AcpPaneToolbar, {
				title: "Test task",
				agentLabel: "Agent",
				status: "idle",
				sessionId: "session-1",
				paneActions: null,
			}),
		);
		await act(async () => {});

		expect(screen.getByText("用时 7s")).toBeTruthy();
	});

	test("finalizes a detached run only through its last observation", async () => {
		const now = 20_000;
		Date.now = () => now;
		window.localStorage.setItem(
			storageKey("session-1"),
			JSON.stringify(
				state({
					accumulatedMs: 1_000,
					runningSince: 10_000,
					lastObservedAt: 14_000,
				}),
			),
		);

		renderToolbar("idle");
		await act(async () => {});

		expect(
			JSON.parse(
				window.localStorage.getItem(storageKey("session-1")) ?? "null",
			),
		).toMatchObject({ accumulatedMs: 5_000, runningSince: null });
	});
});

describe("AcpPaneToolbar actions", () => {
	test("renders the Browser entry before the pane-system actions", () => {
		render(
			createElement(AcpPaneToolbar, {
				title: "Test task",
				agentLabel: "Agent",
				status: "idle",
				sessionId: "session-1",
				browserAction: createElement("button", { type: "button" }, "Browser 3"),
				paneActions: createElement(
					"button",
					{ type: "button" },
					"Pane actions",
				),
			}),
		);

		const actions = screen.getByText("Browser 3").parentElement;
		expect(actions?.textContent).toBe("Browser 3Pane actions");
	});
});
