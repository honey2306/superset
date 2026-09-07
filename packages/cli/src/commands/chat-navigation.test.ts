import { expect, test } from "bun:test";
import { onKeypress, type TuiState } from "./chat";

function state(status = "idle"): TuiState {
	return {
		active: true,
		view: "conversation",
		buffer: "",
		cursor: 0,
		currentIndex: 0,
		sessions: [{ sessionId: "s1", status }],
	} as TuiState;
}

test("Esc returns an idle conversation to its session list", () => {
	const ui = state();
	onKeypress(ui, undefined, { name: "escape" });
	expect(ui.view).toBe("sessions");
});

test("Ctrl+L returns while running without cancelling the background turn", () => {
	const ui = state("running");
	onKeypress(ui, undefined, { name: "l", ctrl: true });
	expect(ui.view).toBe("sessions");
	expect(ui.sessions[0]?.status).toBe("running");
});

test("Esc closes the slash menu before leaving the conversation", () => {
	const ui = state();
	ui.buffer = "/sessions";
	onKeypress(ui, undefined, { name: "escape" });
	expect(ui.view).toBe("conversation");
	expect(ui.buffer).toBe("");
});
