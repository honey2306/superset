import type {
	SessionConfigOption,
	SessionUpdateEnvelope,
} from "@superset/session-protocol";

import { MYFLICKER_RUNTIME_CONFIG_ID } from "@superset/shared/agent-catalog";

export { MYFLICKER_RUNTIME_CONFIG_ID };
export const MYFLICKER_BACKENDS = ["myflicker", "codex", "claude"] as const;
export type MyFlickerBackend = (typeof MYFLICKER_BACKENDS)[number];

export function isMyFlickerBackend(value: unknown): value is MyFlickerBackend {
	return MYFLICKER_BACKENDS.some((backend) => backend === value);
}

export function myFlickerRuntimeFromJournal(
	entries: readonly SessionUpdateEnvelope[],
): MyFlickerBackend | undefined {
	for (let index = entries.length - 1; index >= 0; index--) {
		const frame = entries[index]?.frame;
		if (frame?.kind !== "state") continue;
		const value = frame.state.configOptions.find(
			(option) => option.id === MYFLICKER_RUNTIME_CONFIG_ID,
		)?.currentValue;
		if (isMyFlickerBackend(value)) return value;
	}
	return undefined;
}

export function withMyFlickerRuntime(
	options: SessionConfigOption[],
	backend: MyFlickerBackend,
): SessionConfigOption[] {
	return [
		...options.filter((option) => option.id !== MYFLICKER_RUNTIME_CONFIG_ID),
		{
			id: MYFLICKER_RUNTIME_CONFIG_ID,
			name: "Runtime",
			description:
				"Choose a backend before sending the first message. Start a new conversation to change it later.",
			type: "select",
			currentValue: backend,
			options: [
				{ value: "myflicker", name: "MyFlicker" },
				{ value: "codex", name: "Codex" },
				{ value: "claude", name: "Claude" },
			],
		},
	];
}
