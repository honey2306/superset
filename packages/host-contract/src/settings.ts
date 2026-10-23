import type { PromptTransport } from "@superset/shared/agent-prompt-launch";
export interface HostAgentConfig {
	id: string;
	presetId: string;
	/** Built-in icon key to render, or null to fall back to `presetId`. */
	iconId: string | null;
	label: string;
	command: string;
	args: string[];
	promptTransport: PromptTransport;
	promptArgs: string[];
	env: Record<string, string>;
	order: number;
}

export interface DelegationProfile {
	id: string;
	name: string;
	description: string;
	instructions: string | null;
	enabled: boolean;
	order: number;
	executorAgentConfigId: string | null;
	executorModelId: string | null;
}
