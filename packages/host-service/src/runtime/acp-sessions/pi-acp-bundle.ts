/**
 * pi-acp 0.0.33 has no ACP-specific configuration hook for its synchronous
 * npm upgrade check, startup prelude, or context-usage updates. Keep these
 * narrow source patches at our bundling boundary rather than modifying
 * node_modules. The checks make an upstream change fail the build instead of
 * silently regressing startup or the context indicator.
 */
export function patchPiAcpBundle(source: string): string {
	const withRpcFlags = source.replace(
		'const args = ["--mode", "rpc", "--no-themes"];',
		`const args = [
  "--mode",
  "rpc",
  "--no-themes",
  ...(process.env.SUPERSET_PI_ACP_DISABLE_EXTENSIONS === "1" ? ["--no-extensions"] : []),
  ...(process.env.SUPERSET_PI_ACP_MCP_EXTENSION ? ["--extension", process.env.SUPERSET_PI_ACP_MCP_EXTENSION] : []),
];`,
	);
	if (withRpcFlags === source) {
		throw new Error("Unsupported pi-acp bundle: RPC launch flags changed");
	}
	const withQuietStartup = withRpcFlags.replace(
		"const quietStartup = getQuietStartup(params.cwd);",
		'const quietStartup = process.env.SUPERSET_PI_ACP_QUIET_STARTUP === "1" || getQuietStartup(params.cwd);',
	);
	if (withQuietStartup === withRpcFlags) {
		throw new Error("Unsupported pi-acp bundle: quiet startup hook changed");
	}
	const withCachedUpdateNotice = withQuietStartup.replace(
		/function buildUpdateNotice\(\) \{[\s\S]*?\n\}\nfunction buildStartupInfo\(/,
		`function buildUpdateNotice() {
  const cached = process.env.SUPERSET_PI_ACP_UPDATE_NOTICE;
  return typeof cached === "string" && cached.trim() ? cached.trim() : null;
}
function buildStartupInfo(`,
	);
	if (withCachedUpdateNotice === withQuietStartup) {
		throw new Error("Unsupported pi-acp bundle: update notice hook changed");
	}
	const withUsageEmitter = withCachedUpdateNotice.replace(
		`  async flushEmits() {
    await this.lastEmit;
  }`,
		`  async flushEmits() {
    await this.lastEmit;
  }
  async emitUsageUpdate() {
    try {
      const stats = await this.proc.getSessionStats();
      const used = stats?.contextUsage?.tokens;
      const size = stats?.contextUsage?.contextWindow;
      if (typeof used !== "number" || !Number.isFinite(used) || used < 0) return;
      if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) return;
      this.emit({ sessionUpdate: "usage_update", used, size });
      await this.flushEmits();
    } catch {
    }
  }`,
	);
	if (withUsageEmitter === withCachedUpdateNotice) {
		throw new Error("Unsupported pi-acp bundle: usage emitter hook changed");
	}
	const turnUsageHook = "void this.flushEmits().finally(() => {";
	const turnUsageHookCount = withUsageEmitter.split(turnUsageHook).length - 1;
	if (turnUsageHookCount !== 2) {
		throw new Error("Unsupported pi-acp bundle: turn usage hook changed");
	}
	const withTurnUsage = withUsageEmitter.replaceAll(
		turnUsageHook,
		"void this.flushEmits().then(() => this.emitUsageUpdate()).finally(() => {",
	);
	const withNewSessionUsage = withTurnUsage.replace(
		`    if (preludeText) setTimeout(() => session.sendStartupInfoIfPending(), 0);
    setTimeout(() => {`,
		`    if (preludeText) setTimeout(() => session.sendStartupInfoIfPending(), 0);
    setTimeout(() => {
      void session.emitUsageUpdate();
    }, 0);
    setTimeout(() => {`,
	);
	if (withNewSessionUsage === withTurnUsage) {
		throw new Error(
			"Unsupported pi-acp bundle: new-session usage hook changed",
		);
	}
	const withLoadedSessionUsage = withNewSessionUsage.replace(
		`          startupInfo: null
        }
      }
    };
    setTimeout(() => {`,
		`          startupInfo: null
        }
      }
    };
    setTimeout(() => {
      void session.emitUsageUpdate();
    }, 0);
    setTimeout(() => {`,
	);
	if (withLoadedSessionUsage === withNewSessionUsage) {
		throw new Error(
			"Unsupported pi-acp bundle: loaded-session usage hook changed",
		);
	}
	const withCompactUsage = withLoadedSessionUsage.replace(
		`        await this.conn.sessionUpdate({
          sessionId: session.sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text }
          }
        });
        return { stopReason: "end_turn" };`,
		`        await this.conn.sessionUpdate({
          sessionId: session.sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text }
          }
        });
        await session.emitUsageUpdate();
        return { stopReason: "end_turn" };`,
	);
	if (withCompactUsage === withLoadedSessionUsage) {
		throw new Error("Unsupported pi-acp bundle: compact usage hook changed");
	}
	const withLegacyModelUsage = withCompactUsage.replace(
		`    await setSessionModel(session.proc, params.modelId);
    await emitConfigOptionsUpdate(this.conn, session.sessionId, session.proc);`,
		`    await setSessionModel(session.proc, params.modelId);
    await emitConfigOptionsUpdate(this.conn, session.sessionId, session.proc);
    await session.emitUsageUpdate();`,
	);
	if (withLegacyModelUsage === withCompactUsage) {
		throw new Error(
			"Unsupported pi-acp bundle: legacy model usage hook changed",
		);
	}
	const withModelUsage = withLegacyModelUsage.replace(
		`    const configOptions = await emitConfigOptionsUpdate(this.conn, session.sessionId, session.proc);
    return { configOptions };`,
		`    const configOptions = await emitConfigOptionsUpdate(this.conn, session.sessionId, session.proc);
    if (configId === MODEL_CONFIG_ID) await session.emitUsageUpdate();
    return { configOptions };`,
	);
	if (withModelUsage === withLegacyModelUsage) {
		throw new Error("Unsupported pi-acp bundle: model usage hook changed");
	}
	const extensionCommandsHook = "includeExtensionCommands: false";
	const extensionCommandsHookCount =
		withModelUsage.split(extensionCommandsHook).length - 1;
	if (extensionCommandsHookCount !== 2) {
		throw new Error(
			"Unsupported pi-acp bundle: extension commands hook changed",
		);
	}
	const withExtensionCommands = withModelUsage.replaceAll(
		extensionCommandsHook,
		"includeExtensionCommands: true",
	);
	const withExtensionInput = withExtensionCommands.replace(
		`    if (method === "input" || method === "editor") {
      this.emit({
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: \`Pi \${method} UI request is not supported in ACP yet; cancelling it.\`
        }
      });
      await this.proc.sendExtensionUiResponse({ id, cancelled: true });
      return;
    }`,
		`    if (method === "input" || method === "editor") {
      const response = await this.requestExtensionPermission(id, ev, [
        { optionId: "cancel", name: "Cancel", kind: "reject_once" }
      ]);
      const value = response?.outcome.outcome === "selected"
        ? response.outcome._meta?.["sh.superset/customResponse"]
        : null;
      await this.proc.sendExtensionUiResponse(
        typeof value === "string" && value.trim()
          ? { id, value }
          : { id, cancelled: true }
      );
      return;
    }`,
	);
	if (withExtensionInput === withExtensionCommands) {
		throw new Error("Unsupported pi-acp bundle: extension input hook changed");
	}
	return withExtensionInput;
}
