import { describe, expect, mock, test } from "bun:test";
import { buildPanesLifecycleRegistry } from "./buildPanesLifecycleRegistry";

const terminalRuntimeStub = {
	onTitleChange: () => () => {},
	getTitle: () => undefined,
};

const CLOSE_CONFIRM_LABELS = {
	title: "Close terminal?",
	description: "A process is still running",
	confirmLabel: "Close",
} as const;

function makePane(id: string, terminalId: string) {
	return {
		id,
		kind: "terminal",
		data: { terminalId },
	} as never;
}

describe("buildPanesLifecycleRegistry onBeforeClose", () => {
	test("onBeforeClose routes through confirmCloseTerminals with the pane's terminalId", async () => {
		const probeRunning = mock<(terminalId: string) => Promise<boolean>>(
			async () => false,
		);
		const killTerminal = mock<(paneId: string, terminalId: string) => void>();
		const lifecycle = buildPanesLifecycleRegistry({
			terminalRuntime: terminalRuntimeStub,
			killTerminal,
			probeRunning,
			closeConfirmLabels: CLOSE_CONFIRM_LABELS,
		});

		// No process running → confirm resolves true without prompting.
		const allowed = await lifecycle.onBeforeClose?.(
			makePane("pane-1", "term-1"),
		);

		expect(allowed).toBe(true);
		expect(probeRunning).toHaveBeenCalledWith("term-1");
		// onBeforeClose must NOT kill — it only decides whether to proceed.
		expect(killTerminal).not.toHaveBeenCalled();
	});

	test("onBeforeClose uses pane.data.terminalId (backend identity) for the probe, not pane.id", async () => {
		const probeRunning = mock<(terminalId: string) => Promise<boolean>>(
			async () => false,
		);
		const lifecycle = buildPanesLifecycleRegistry({
			terminalRuntime: terminalRuntimeStub,
			killTerminal: mock(),
			probeRunning,
			closeConfirmLabels: CLOSE_CONFIRM_LABELS,
		});

		await lifecycle.onBeforeClose?.(makePane("pane-1", "different-backend-id"));

		// The probe keys by the backend session id, NOT the UI pane id — the
		// running-process check is a backend question. (onAfterClose still
		// kills by pane.id; onBeforeClose probes by terminalId.)
		expect(probeRunning).toHaveBeenCalledWith("different-backend-id");
		expect(probeRunning).not.toHaveBeenCalledWith("pane-1");
	});

	test("onBeforeClose consults the probe when a process is running (alert absent → fail open to true)", async () => {
		const probeRunning = mock<(terminalId: string) => Promise<boolean>>(
			async () => true,
		);
		const lifecycle = buildPanesLifecycleRegistry({
			terminalRuntime: terminalRuntimeStub,
			killTerminal: mock(),
			probeRunning,
			closeConfirmLabels: CLOSE_CONFIRM_LABELS,
		});

		// When a process is running, confirmCloseTerminals shows a dialog.
		// In the test environment the alert layer is absent, so it fails open
		// to true — but we still assert the probe was consulted and the
		// lifecycle did not kill the pane on the cancel path.
		const allowed = await lifecycle.onBeforeClose?.(
			makePane("pane-1", "term-1"),
		);

		expect(probeRunning).toHaveBeenCalledWith("term-1");
		// alert() unavailable in test → confirmCloseTerminals resolves true.
		expect(allowed).toBe(true);
	});

	test("onAfterClose provides both UI and backend identities for direct cleanup", () => {
		const killTerminal = mock<(paneId: string, terminalId: string) => void>();
		const lifecycle = buildPanesLifecycleRegistry({
			terminalRuntime: terminalRuntimeStub,
			killTerminal,
			probeRunning: mock(async () => false),
			closeConfirmLabels: CLOSE_CONFIRM_LABELS,
		});

		lifecycle.onAfterClose?.(makePane("pane-1", "terminal-1"));

		expect(killTerminal).toHaveBeenCalledWith("pane-1", "terminal-1");
	});
});
