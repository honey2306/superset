import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	peekabooBridgeArguments,
	resolvePeekabooBridgeSocket,
} from "./peekaboo-bridge";

describe("Peekaboo GUI bridge resolution", () => {
	test("prefers the authorized GUI app bridge when present", () => {
		const root = mkdtempSync(path.join(tmpdir(), "peekaboo-bridge-"));
		const socketPath = path.join(root, "bridge.sock");
		Bun.write(socketPath, "placeholder");
		try {
			expect(
				resolvePeekabooBridgeSocket({ SUPERSET_PEEKABOO_HOME: root }),
			).toBe(socketPath);
			expect(peekabooBridgeArguments(socketPath)).toEqual([
				"mcp",
				"--allow-foreground",
				"--bridge-socket",
				socketPath,
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("falls back to normal Peekaboo discovery without a GUI bridge", () => {
		expect(peekabooBridgeArguments(null)).toEqual([
			"mcp",
			"--allow-foreground",
		]);
	});
});
