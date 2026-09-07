import { runAcp } from "@agentclientprotocol/claude-agent-acp/dist/acp-agent.js";
import { resolveSettings } from "@anthropic-ai/claude-agent-sdk";

async function main(): Promise<void> {
	const policy = await resolveSettings({ settingSources: [] });
	for (const [key, value] of Object.entries(policy.effective.env ?? {})) {
		process.env[key] = String(value);
	}
	// ACP reserves stdout for JSON-RPC frames.
	console.log = console.error;
	console.info = console.error;
	console.warn = console.error;
	console.debug = console.error;
	process.on("unhandledRejection", (reason, promise) => {
		console.error("Unhandled Rejection at:", promise, "reason:", reason);
	});

	const { connection, agent } = runAcp();
	const steerableAgent = agent as typeof agent & {
		extMethod?: (
			method: string,
			params: Record<string, unknown>,
		) => Promise<Record<string, unknown>>;
	};
	steerableAgent.extMethod = async (method, params) => {
		if (method !== "sh.superset/session/steer") {
			throw new Error(`Unsupported extension method: ${method}`);
		}
		const sessionId = params.sessionId;
		const prompt = params.prompt;
		if (typeof sessionId !== "string" || !Array.isArray(prompt)) {
			throw new Error("Invalid steer payload");
		}
		void agent
			.prompt({ sessionId, prompt: prompt as never })
			.catch((error) => console.error("Failed to steer Claude session", error));
		return { accepted: true };
	};
	const shutdown = async () => {
		await agent.dispose().catch((error) => {
			console.error("Error during cleanup:", error);
		});
		process.exit(0);
	};
	connection.closed.then(shutdown);
	process.on("SIGTERM", shutdown);
	process.on("SIGINT", shutdown);
	process.stdin.resume();
}

void main();
