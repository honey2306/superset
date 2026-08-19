import { describe, expect, test } from "bun:test";
import { patchPiAcpBundle } from "./pi-acp-bundle";

const piAcp033 = `
const args = ["--mode", "rpc", "--no-themes"];
const quietStartup = getQuietStartup(params.cwd);
class PiAcpSession {
  async flushEmits() {
    await this.lastEmit;
  }
  startTurn() {
    void this.flushEmits().finally(() => {
    });
  }
  handlePiEvent() {
    void this.flushEmits().finally(() => {
    });
  }
}
async function newSession() {
    if (preludeText) setTimeout(() => session.sendStartupInfoIfPending(), 0);
    setTimeout(() => {
    }, 0);
}
async function prompt() {
        await this.conn.sessionUpdate({
          sessionId: session.sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text }
          }
        });
        return { stopReason: "end_turn" };
}
async function loadSession() {
    const response = {
      configOptions,
      models,
      modes,
      _meta: {
        piAcp: {
          startupInfo: null
        }
      }
    };
    setTimeout(() => {
    }, 0);
}
async function unstable_setSessionModel(params) {
    await setSessionModel(session.proc, params.modelId);
    await emitConfigOptionsUpdate(this.conn, session.sessionId, session.proc);
}
async function setSessionConfigOption() {
    const configOptions = await emitConfigOptionsUpdate(this.conn, session.sessionId, session.proc);
    return { configOptions };
}
function extensionCommands() {
    toAvailableCommandsFromPiGetCommands(pi, {
      includeExtensionCommands: false
    });
    toAvailableCommandsFromPiGetCommands(pi, {
      includeExtensionCommands: false
    });
}
async function handleExtensionUiRequest() {
    if (method === "input" || method === "editor") {
      this.emit({
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: \`Pi \${method} UI request is not supported in ACP yet; cancelling it.\`
        }
      });
      await this.proc.sendExtensionUiResponse({ id, cancelled: true });
      return;
    }
    if (method === "notify") {
      this.emit({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: stringProp(ev, "message") ?? "Pi notification" },
        _meta: { piAcp: { notify: { level: stringProp(ev, "notifyType") ?? "info" } } }
      });
      await this.proc.sendExtensionUiResponse({ id, cancelled: true });
      return;
    }
}
function buildUpdateNotice() {
  spawnSync("npm", ["view"]);
  return null;
}
function buildStartupInfo() {}
`;

describe("patchPiAcpBundle", () => {
	test("removes synchronous upgrade work and makes extension skipping opt-in", () => {
		const patched = patchPiAcpBundle(piAcp033);
		expect(patched).toContain("SUPERSET_PI_ACP_UPDATE_NOTICE");
		expect(patched).not.toContain('spawnSync("npm"');
		expect(patched).toContain("SUPERSET_PI_ACP_QUIET_STARTUP");
		expect(patched).toContain("SUPERSET_PI_ACP_DISABLE_EXTENSIONS");
		expect(patched).toContain("SUPERSET_PI_ACP_MCP_EXTENSION");
		expect(patched).toContain('["--extension", process.env.');
		expect(patched).toContain('sessionUpdate: "usage_update", used, size');
		expect(patched).toContain("stats?.contextUsage?.tokens");
		expect(patched).toContain("stats?.contextUsage?.contextWindow");
		expect(
			patched.match(
				/this\.flushEmits\(\)\.then\(\(\) => this\.emitUsageUpdate\(\)\)/g,
			),
		).toHaveLength(2);
		expect(patched).not.toContain("void this.flushEmits().finally(() => {");
		expect(patched).toContain("await session.emitUsageUpdate();");
		expect(patched).toContain(
			"if (configId === MODEL_CONFIG_ID) await session.emitUsageUpdate();",
		);
		expect(patched.match(/void session\.emitUsageUpdate\(\);/g)).toHaveLength(
			2,
		);
		expect(patched).not.toContain("includeExtensionCommands: false");
		expect(patched.match(/includeExtensionCommands: true/g)).toHaveLength(2);
		expect(patched).toContain(
			'response.outcome._meta?.["sh.superset/customResponse"]',
		);
		expect(patched).not.toContain(
			"UI request is not supported in ACP yet; cancelling it.",
		);
	});

	test("suppresses info notifications while preserving warning and error updates", () => {
		const patched = patchPiAcpBundle(piAcp033);

		expect(patched).toMatch(
			/if \(method === "notify"\) \{\s*const notifyType = stringProp\(ev, "notifyType"\) \?\? "info";\s*if \(notifyType !== "info"\) \{[\s\S]*?sessionUpdate: "agent_message_chunk"[\s\S]*?level: notifyType/s,
		);
		expect(patched).toContain(
			"await this.proc.sendExtensionUiResponse({ id, cancelled: true });",
		);
	});

	test("fails closed when pi-acp changes its patch points", () => {
		expect(() => patchPiAcpBundle("export {};")).toThrow(
			"Unsupported pi-acp bundle",
		);
	});
});
