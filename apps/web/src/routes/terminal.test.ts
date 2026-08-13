import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("terminal route delegates input to xterm without a mobile command composer", () => {
	const source = readFileSync(
		fileURLToPath(new URL("./terminal.tsx", import.meta.url)),
		"utf8",
	);

	expect(source).not.toContain("MobileTerminalInput");
	expect(source).toContain("terminal.onData");
	expect(source).toContain('type: "input"');
});
