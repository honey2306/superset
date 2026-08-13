import { describe, expect, it } from "bun:test";
import { classifyTerminalFailure } from "./terminalConnectionDiagnostics";

describe("classifyTerminalFailure", () => {
	it("reports a generic direct-host connection failure", () => {
		expect(classifyTerminalFailure()).toEqual({
			category: "connection-failed",
			message:
				"Couldn't reach this host. Check that it is online and reachable.",
		});
	});
});
