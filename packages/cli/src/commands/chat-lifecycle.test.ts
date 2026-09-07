import { describe, expect, test } from "bun:test";
import { emitKeypressEvents } from "node:readline";
import { PassThrough } from "node:stream";
import {
	type AcpSessionsApi,
	emptyTimeline,
	type SessionScopedState,
} from "@superset/session-protocol";
import {
	AcpSessionController,
	type AcpSessionControllerSnapshot,
} from "@superset/session-protocol/controller";
import type { HostConnection } from "../lib/host-connection";
import {
	attachSessionController,
	consumeMouseInput,
	defer,
	refreshSessions,
	syncFromController,
	type TuiState,
} from "./chat";

function session(id = "s1"): TuiState["sessions"][number] {
	return {
		sessionId: id,
		title: id,
		agent: "pi",
		status: "idle",
		messages: [],
		pendingPermissions: [],
		queuedPrompts: [],
		lastSeq: 0,
		createdAt: Date.now(),
		updatedAt: Date.now(),
	};
}

// Only the data/input seam runs here; active=false suppresses terminal painting.
function state(): TuiState {
	return {
		active: false,
		view: "conversation",
		sessions: [session()],
		currentIndex: 0,
		attachedSessionId: "s1",
		scrollOffset: 0,
		workspace: { id: "w1" },
	} as TuiState;
}

function snapshot(): AcpSessionControllerSnapshot {
	return {
		state: null,
		timeline: {
			...emptyTimeline(),
			items: [
				{
					kind: "message",
					id: "m1",
					role: "agent",
					blocks: [{ type: "text", text: "second reply" }],
					failed: false,
					startSeq: 1,
					endSeq: 1,
					startedAt: 1,
					updatedAt: 1,
				},
			],
		},
		streamStatus: "open",
		isLoading: false,
		availability: "live",
		error: null,
		hasOlder: false,
		isLoadingOlder: false,
		historyError: null,
		totalTurns: 1,
		turnIndex: [],
		loadedTurnNumbers: [],
	};
}

describe("CLI input recovery", () => {
	function input(sequence: string) {
		const ui = state();
		const stream = new PassThrough();
		const forwarded: string[] = [];
		emitKeypressEvents(stream);
		stream.on("keypress", (character, key) => {
			if (!consumeMouseInput(ui, character, key) && character)
				forwarded.push(character);
		});
		stream.write(sequence);
		stream.destroy();
		return { ui, text: forwarded.join("") };
	}

	test("unknown terminal escape does not swallow the next message and Enter", () => {
		expect(input("\x1b[999~hello\r").text).toBe("hello\r");
	});
	test("truncated mouse report releases subsequent ordinary keys", () => {
		expect(input("\x1b[<64;hello\r").text).toBe("hello\r");
	});
	test("real mouse report is consumed without polluting the composer", () => {
		const result = input("\x1b[<64;1;1Mhello\r");
		expect(result.text).toBe("hello\r");
		expect(result.ui.scrollOffset).toBe(3);
	});
});

describe("CLI session lifecycle", () => {
	test("real controller recovers its subscription after all four bootstrap attempts fail", async () => {
		const ui = state();
		let available = false;
		let attempts = 0;
		let sockets = 0;
		const authoritative: SessionScopedState = {
			sessionId: "s1",
			epoch: "e1",
			workspaceId: "w1",
			harness: "pi-acp",
			status: "idle",
			title: "recovery",
			currentMode: null,
			configOptions: [],
			availableCommands: null,
			pendingPermissions: [],
			queuedPrompts: [],
			cwd: "/tmp",
			lastSeq: 0,
			lastStopReason: null,
			lastError: null,
			createdAt: 1,
			updatedAt: 1,
		};
		const controller = new AcpSessionController({
			sessionId: "s1",
			connectionKey: "cli-recovery-test",
			streamUrl: "ws://fixture",
			api: {
				get: async () => {
					attempts += 1;
					if (!available) throw new Error("host offline");
					return authoritative;
				},
				getMessages: async () => ({ items: [], nextCursor: null }),
			} as unknown as AcpSessionsApi,
			createWebSocket: () => {
				sockets += 1;
				return {
					onopen: null,
					onclose: null,
					onmessage: null,
					onerror: null,
					close() {},
				};
			},
		});
		ui.controller = controller;
		try {
			await controller.start();
			const deadline = Date.now() + 3000;
			while (
				controller.getSnapshot().availability !== "unavailable" &&
				Date.now() < deadline
			) {
				await new Promise((resolve) => setTimeout(resolve, 25));
			}
			expect(controller.getSnapshot().availability).toBe("unavailable");
			expect(attempts).toBe(4);
			expect(sockets).toBe(0);
			available = true;
			await attachSessionController(ui, ui.sessions[0]!);
			await Promise.resolve();
			expect(controller.getSnapshot().error).toBeNull();
			expect(controller.getSnapshot().state?.title).toBe("recovery");
			expect(sockets).toBe(1);
		} finally {
			controller.stop();
		}
	}, 5000);
	test("reattachment refreshes a controller whose retries were exhausted", async () => {
		const ui = state();
		let recovered = false;
		ui.controller = {
			getSnapshot: () => ({
				...snapshot(),
				availability: recovered ? "live" : "unavailable",
				error: recovered ? null : new Error("host offline"),
			}),
			refresh: async () => {
				recovered = true;
			},
		} as unknown as AcpSessionController;
		await attachSessionController(ui, ui.sessions[0]!);
		expect(recovered).toBe(true);
	});

	test("failed recovery rejects before another prompt can be silently sent", async () => {
		const ui = state();
		ui.controller = {
			getSnapshot: () => ({
				...snapshot(),
				availability: "unavailable",
				error: new Error("host offline"),
			}),
			refresh: async () => {},
		} as unknown as AcpSessionController;
		await expect(attachSessionController(ui, ui.sessions[0]!)).rejects.toThrow(
			"host offline",
		);
	});
	test("deferred failures are surfaced, not unhandled rejections", async () => {
		const ui = state();
		ui.active = true;
		defer(ui, async () => {
			// Suppress painting only; exercise the real async error boundary.
			ui.active = false;
			throw new Error("submission failed");
		});
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(ui.notice?.text).toBe("submission failed");
	});

	test("queued input does not execute after exit", async () => {
		const ui = state();
		let calls = 0;
		defer(ui, async () => {
			calls += 1;
		});
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(calls).toBe(0);
	});
	test("list refresh keeps live updates connected to the displayed session", async () => {
		const ui = state();
		const attached = ui.sessions[0]!;
		ui.connection = {
			client: {
				acpSessions: {
					list: {
						query: async () => ({
							items: [{ ...attached, harness: "pi-acp" }],
							nextCursor: null,
						}),
					},
				},
			},
		} as unknown as HostConnection;
		await refreshSessions(ui);
		syncFromController(ui, attached, { getSnapshot: snapshot });
		expect(ui.sessions[0]?.messages).toEqual([
			{ role: "agent", text: "second reply" },
		]);
	});

	test("late update from another session cannot overwrite active streaming state", () => {
		const ui = state();
		ui.streamingText = "active reply";
		syncFromController(ui, session("old"), { getSnapshot: snapshot });
		expect(ui.streamingText).toBe("active reply");
	});

	test("controller failure is visible instead of silently looking ready", () => {
		const ui = state();
		syncFromController(ui, ui.sessions[0]!, {
			getSnapshot: () => ({
				...snapshot(),
				availability: "unavailable",
				error: new Error("connection lost"),
			}),
		});
		expect(ui.notice?.text).toContain("connection lost");
	});
});
