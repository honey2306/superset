import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { AlertOptions } from "@superset/ui/atoms/Alert";

let suppressed = false;
const suppress = mock(() => {
	suppressed = true;
});
mock.module("renderer/stores/terminal-close-confirm/store", () => ({
	useTerminalCloseConfirmStore: { getState: () => ({ suppressed, suppress }) },
}));
const { confirmClosePorts } = await import("./confirmClosePorts");

describe("confirmClosePorts", () => {
	beforeEach(() => {
		suppressed = false;
		suppress.mockClear();
	});
	it("uses singular copy and confirms", async () => {
		let options: AlertOptions | undefined;
		const confirmation = confirmClosePorts(1, (value) => {
			options = value;
			return true;
		});
		expect(options?.title).toBe("This port is still in use");
		expect(options?.actions[0]?.label).toBe("Close port");
		await options?.actions[0]?.onClick?.({ checkboxChecked: false });
		expect(await confirmation).toBe(true);
	});
	it("cancels and suppresses shared prompts", async () => {
		let options: AlertOptions | undefined;
		const confirmation = confirmClosePorts(2, (value) => {
			options = value;
			return true;
		});
		expect(options?.title).toBe("These ports are still in use");
		await options?.actions[1]?.onClick?.({ checkboxChecked: false });
		expect(await confirmation).toBe(false);
		const accepted = confirmClosePorts(1, (value) => {
			options = value;
			return true;
		});
		await options?.actions[0]?.onClick?.({ checkboxChecked: true });
		expect(await accepted).toBe(true);
		expect(await confirmClosePorts(1, () => false)).toBe(true);
	});
	it("fails open when alert cannot display", async () => {
		expect(await confirmClosePorts(1, () => false)).toBe(true);
	});
});
