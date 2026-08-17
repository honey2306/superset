import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import viteConfig, {
	piAcpMcpExtensionCjsInteropPlugin,
} from "./electron.vite.config";

test("main build emits every external ACP runtime alongside the daemon", () => {
	const input = viteConfig.main?.build?.rollupOptions?.input;

	expect(input).toMatchObject({
		"acp-daemon": expect.stringContaining("daemon-entry.ts"),
		"superset-mcp": expect.stringContaining("superset-mcp.ts"),
		"codex-app-server-acp": expect.stringContaining("codex-app-server-acp.ts"),
		"claude-agent-acp": expect.stringContaining("claude-agent-acp-entry.ts"),
		"pi-acp": expect.any(String),
		"pi-acp-mcp-extension": expect.stringContaining("pi-acp-mcp-extension.ts"),
	});
});

test("main Pi extension bundle requires to Pi's default factory contract", () => {
	const plugin = piAcpMcpExtensionCjsInteropPlugin();
	const extension = {
		type: "chunk" as const,
		name: "pi-acp-mcp-extension",
		fileName: "pi-acp-mcp-extension.js",
		code: "exports.default = () => 'pi factory';",
	};
	plugin.generateBundle({}, { [extension.fileName]: extension }, false);

	const temporaryDirectory = mkdtempSync(
		path.join(os.tmpdir(), "pi-cjs-factory-"),
	);
	const extensionPath = path.join(temporaryDirectory, extension.fileName);
	try {
		writeFileSync(extensionPath, extension.code);
		const loaded = createRequire(import.meta.url)(extensionPath);
		expect(typeof loaded).toBe("function");
		expect(loaded()).toBe("pi factory");
	} finally {
		rmSync(temporaryDirectory, { recursive: true, force: true });
	}
});
