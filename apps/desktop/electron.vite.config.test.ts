import { expect, test } from "bun:test";
import viteConfig from "./electron.vite.config";

test("main build emits every external ACP runtime alongside the daemon", () => {
	const input = viteConfig.main?.build?.rollupOptions?.input;

	expect(input).toMatchObject({
		"acp-daemon": expect.stringContaining("daemon-entry.ts"),
		"superset-mcp": expect.stringContaining("superset-mcp.ts"),
		"lazy-mcp-proxy": expect.stringContaining("lazy-mcp-proxy.ts"),
		"codex-app-server-acp": expect.stringContaining("codex-app-server-acp.ts"),
		"claude-agent-acp": expect.stringContaining("claude-agent-acp-entry.ts"),
		"pi-acp": expect.stringContaining("pi-sdk-acp.ts"),
	});
});
