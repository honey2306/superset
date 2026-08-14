declare module "@anthropic-ai/claude-agent-sdk" {
	export function resolveSettings(options: {
		settingSources: string[];
	}): Promise<{ effective: { env?: Record<string, string> } }>;
}
