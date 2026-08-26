/**
 * Small Pi-shaped ACP fixture. It deliberately emits Pi's startup prelude
 * after `session/new` completes, which is the production adapter's timing.
 */
import { randomUUID } from "node:crypto";
import { Readable, Writable } from "node:stream";
import {
	agent,
	ndJsonStream,
	PROTOCOL_VERSION,
	type schema,
} from "@agentclientprotocol/sdk";

let sessionId = "fake-pi-unset";
let supportsTerminalOutput = false;

const app = agent({ name: "fake-pi-acp-adapter" })
	.onRequest("initialize", (context) => {
		supportsTerminalOutput =
			context.params.clientCapabilities?._meta?.terminal_output === true;
		return { protocolVersion: PROTOCOL_VERSION };
	})
	.onRequest("session/new", (context) => {
		sessionId = `fake-pi-${randomUUID()}`;
		const startupInfo =
			process.env.SUPERSET_PI_ACP_UPDATE_NOTICE ??
			"pi v0.84.0\nContext: AGENTS.md\nSkills: example\nExtensions: example";
		setTimeout(() => {
			void context.client.notify("session/update", {
				sessionId,
				update: {
					sessionUpdate: "agent_message_chunk",
					content: {
						type: "text",
						text: startupInfo,
					},
				},
			});
		}, 0);
		return {
			sessionId,
			_meta: {
				piAcp: {
					startupInfo,
				},
			},
		};
	})
	.onRequest("session/load", (context) => {
		sessionId = context.params.sessionId;
		return {};
	})
	.onRequest("session/prompt", async (context) => {
		const notify = (update: schema.SessionUpdate) =>
			context.client.notify("session/update", { sessionId, update });
		const promptText = context.params.prompt
			.filter(
				(block): block is schema.TextContent & { type: "text" } =>
					block.type === "text",
			)
			.map((block) => block.text)
			.join("\n");
		await notify({
			sessionUpdate: "agent_thought_chunk",
			content: { type: "text", text: "actual thought" },
		});
		await notify({
			sessionUpdate: "tool_call",
			toolCallId: "actual-tool",
			title: "actual tool",
			kind: "read",
			status: "completed",
		});
		if (supportsTerminalOutput) {
			await notify({
				sessionUpdate: "tool_call",
				toolCallId: "pi-terminal-tool",
				title: "run Pi command",
				kind: "execute",
				status: "in_progress",
				content: [{ type: "terminal", terminalId: "pi-opaque-terminal" }],
				_meta: {
					terminal_info: {
						terminal_id: "pi-opaque-terminal",
						cwd: "/fake-workspace",
					},
				},
			});
			await notify({
				sessionUpdate: "tool_call_update",
				toolCallId: "pi-terminal-tool",
				status: "completed",
				_meta: {
					terminal_output: {
						terminal_id: "pi-opaque-terminal",
						data: "fake Pi terminal output\n",
					},
					terminal_exit: {
						terminal_id: "pi-opaque-terminal",
						exit_code: 0,
						signal: null,
					},
				},
			});
		}
		if (promptText.includes("image")) {
			const image = {
				type: "image" as const,
				data: Buffer.from("fake-pi-image").toString("base64"),
				mimeType: "image/png",
			};
			await notify({
				sessionUpdate: "tool_call_update",
				toolCallId: "pi-image-tool",
				status: "completed",
				content: [{ type: "content", content: image }],
				rawOutput: {
					content: [image],
					details: {
						mcpResult: { content: [{ type: "content", content: image }] },
					},
				},
			});
		}
		await notify({
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: "actual agent reply" },
		});
		return { stopReason: "end_turn" as const };
	});

const stream = ndJsonStream(
	Writable.toWeb(process.stdout) as unknown as WritableStream<Uint8Array>,
	Readable.toWeb(process.stdin) as unknown as ReadableStream<Uint8Array>,
);

void app.connect(stream);
