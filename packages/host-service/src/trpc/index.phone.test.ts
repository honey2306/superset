import { expect, test } from "bun:test";
import { isPhoneAllowedPath } from "./index";

test("paired phones can read workspace terminal sessions", () => {
	expect(isPhoneAllowedPath("terminal.listSessions")).toBe(true);
});

test("paired phones cannot use terminal mutation or daemon surfaces", () => {
	expect(isPhoneAllowedPath("terminal.writeInput")).toBe(false);
	expect(isPhoneAllowedPath("terminal.killSession")).toBe(false);
	expect(isPhoneAllowedPath("terminal.daemon.listSessions")).toBe(false);
});

test("paired phone allowlist keeps ACP and terminal agent capabilities explicit", () => {
	expect(isPhoneAllowedPath("acpSessions.list")).toBe(true);
	expect(isPhoneAllowedPath("terminalAgents.listByWorkspace")).toBe(true);
	expect(isPhoneAllowedPath("workspace.destroy")).toBe(false);
});
