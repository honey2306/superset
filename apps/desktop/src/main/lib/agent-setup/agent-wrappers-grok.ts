import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	buildWrapperScript,
	createWrapper,
	getManagedNotifyHookCommand,
	writeFileIfChanged,
} from "./agent-wrappers-common";

const GROK_HOOK_EVENTS = [
	"SessionStart",
	"SessionEnd",
	"UserPromptSubmit",
	"PostToolUse",
	"PostToolUseFailure",
	"Stop",
	"StopFailure",
] as const;

export function getGrokHooksJsonContent(): string {
	const command = getManagedNotifyHookCommand("grok");
	return `${JSON.stringify(
		{
			hooks: Object.fromEntries(
				GROK_HOOK_EVENTS.map((event) => [
					event,
					[{ hooks: [{ type: "command", command }] }],
				]),
			),
		},
		null,
		2,
	)}\n`;
}

export function createGrokHooksJson(): void {
	const hooksPath = path.join(
		os.homedir(),
		".grok",
		"hooks",
		"superset-notify.json",
	);
	fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
	writeFileIfChanged(hooksPath, getGrokHooksJsonContent(), 0o644);
}

export function createGrokWrapper(): void {
	createWrapper(
		"grok",
		buildWrapperScript("grok", 'exec "$REAL_BIN" "$@"', { agentId: "grok" }),
	);
}
