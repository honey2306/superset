import { randomUUID } from "node:crypto";
import {
	AGENT_IDENTITY_IDS,
	type AgentIdentityId,
} from "@superset/shared/agent-catalog";
import {
	buildAgentEffortArgs,
	buildAgentModelArgs,
	buildAgentModelEnv,
} from "@superset/shared/agent-models";
import {
	buildArgvCommand,
	buildPromptCommandString,
	envOverlayPrefix,
	sanitizePromptForPty,
} from "@superset/shared/agent-prompt-launch";
import { getPresetById } from "@superset/shared/host-agent-presets";
import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { HostDb } from "../../../db";
import { hostAgentConfigs, workspaces } from "../../../db/schema";
import { createTerminalSessionInternal } from "../../../terminal/terminal";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, router } from "../../index";
import { resolveAttachmentPath } from "../attachments/storage";
import { useAcpForAgentPresets } from "../settings/acp-preset-launch";

interface ResolvedHostAgentConfig {
	id: string;
	presetId: string;
	label: string;
	command: string;
	args: string[];
	promptTransport: "argv" | "stdin";
	promptArgs: string[];
	env: Record<string, string>;
}

export type AgentPermissionMode = "full_access";

function withFullAccessArgs(
	config: ResolvedHostAgentConfig,
	permissionMode: AgentPermissionMode | undefined,
): ResolvedHostAgentConfig {
	if (permissionMode !== "full_access" || config.presetId !== "myflicker") {
		return config;
	}

	// MyFlicker's ACP adapter documents this as its full-access mode. Do not
	// infer flags for other presets (including custom ones): their configured
	// command remains authoritative unless we have a verified equivalent.
	const args = config.args.filter(
		(arg, index, allArgs) =>
			arg !== "--approval-mode" &&
			!arg.startsWith("--approval-mode=") &&
			allArgs[index - 1] !== "--approval-mode",
	);
	return { ...config, args: ["--approval-mode", "yolo", ...args] };
}

function parseArgv(value: string): string[] {
	try {
		const parsed = JSON.parse(value);
		if (
			!Array.isArray(parsed) ||
			parsed.some((entry) => typeof entry !== "string")
		) {
			return [];
		}
		return parsed as string[];
	} catch {
		return [];
	}
}

function parseEnv(value: string): Record<string, string> {
	try {
		const parsed = JSON.parse(value);
		if (
			parsed === null ||
			typeof parsed !== "object" ||
			Array.isArray(parsed) ||
			Object.values(parsed).some((entry) => typeof entry !== "string")
		) {
			return {};
		}
		return parsed as Record<string, string>;
	} catch {
		return {};
	}
}

function rowToConfig(
	row: typeof hostAgentConfigs.$inferSelect,
): ResolvedHostAgentConfig {
	return {
		id: row.id,
		presetId: row.presetId,
		label: row.label,
		command: row.command,
		args: parseArgv(row.argsJson),
		promptTransport: row.promptTransport as "argv" | "stdin",
		promptArgs: parseArgv(row.promptArgsJson),
		env: parseEnv(row.envJson),
	};
}

export function resolveBundledHostAgentConfig(
	agent: string,
): ResolvedHostAgentConfig | null {
	const preset = getPresetById(agent);
	if (!preset) return null;
	return {
		id: preset.presetId,
		presetId: preset.presetId,
		label: preset.label,
		command: preset.command,
		args: preset.args,
		promptTransport: preset.promptTransport,
		promptArgs: preset.promptArgs,
		env: preset.env,
	};
}

/**
 * Look up a HostAgentConfig by its instance id first, then fall back to the
 * lowest-`order` row matching by presetId. If an older config table predates
 * a built-in preset, resolve its bundled definition so ACP-backed callers can
 * still launch it. Preset ids are short slugs; instance ids are UUIDs — they
 * don't collide.
 */
export function resolveHostAgentConfig(
	db: HostDb,
	agent: string,
): ResolvedHostAgentConfig | null {
	const byId = db
		.select()
		.from(hostAgentConfigs)
		.where(eq(hostAgentConfigs.id, agent))
		.get();
	if (byId) return rowToConfig(byId);

	const byPreset = db
		.select()
		.from(hostAgentConfigs)
		.where(eq(hostAgentConfigs.presetId, agent))
		.orderBy(asc(hostAgentConfigs.displayOrder))
		.get();
	if (byPreset) return rowToConfig(byPreset);

	return resolveBundledHostAgentConfig(agent);
}

/**
 * Build a shell command string that runs the resolved agent config with the
 * given prompt. argv transport appends the prompt as a quoted positional;
 * stdin transport delegates heredoc assembly and delimiter collision handling
 * to the shared prompt-launch pipeline.
 *
 * Prompts that sanitize to empty drop `promptArgs` and the prompt payload so
 * codex/opencode/copilot don't get stray prompt-mode flags during promptless
 * launches — emptiness is only knowable after sanitization, so the check
 * lives here rather than in the router's zod schema.
 */
export function buildAgentCommandString(
	config: ResolvedHostAgentConfig,
	rawPrompt: string,
	modelArgs: string[] = [],
	randomId: string = crypto.randomUUID(),
	permissionMode?: AgentPermissionMode,
): string {
	config = withFullAccessArgs(config, permissionMode);
	const prompt = sanitizePromptForPty(rawPrompt);
	const baseArgv = [config.command, ...config.args, ...modelArgs];

	if (prompt === "") {
		return buildArgvCommand(baseArgv);
	}

	if (config.promptTransport === "argv") {
		// Plain quoted positional, not the shared "$(cat <<…)" form: the command
		// is typed into the user's configured shell, and fish has no heredocs.
		return buildArgvCommand([...baseArgv, ...config.promptArgs, prompt]);
	}

	return buildPromptCommandString({
		command: buildArgvCommand([...baseArgv, ...config.promptArgs]),
		transport: "stdin",
		prompt,
		randomId,
	});
}

function buildAttachmentBlock(
	prompt: string,
	resolved: Array<{ attachmentId: string; path: string }>,
): string {
	if (resolved.length === 0) return prompt;
	const lines = resolved.map((item) => `- ${item.path}`);
	const block = `\n\n# Attached files\n\nThe user attached these files. They are available on this host at:\n\n${lines.join("\n")}`;
	return prompt + block;
}

export interface AgentRunInput {
	workspaceId: string;
	agent: string;
	prompt: string;
	terminalId?: string;
	attachmentIds?: string[];
	model?: string;
	effort?: string;
	/** Internal-only capability for unattended trusted dispatches. */
	permissionMode?: AgentPermissionMode;
	/** Internal-only: local automations/todos follow the desktop ACP setting. */
	respectPresetLaunchMode?: true;
}

export type AgentRunResult =
	| { kind: "terminal"; sessionId: string; label: string }
	| { kind: "acp"; sessionId: string; label: string };

const ACP_HARNESS_BY_PRESET_ID = {
	claude: "claude-agent-acp",
	codex: "codex-app-server",
	pi: "pi-acp",
	myflicker: "myflicker-acp",
} as const;

export function getAcpHarnessForPreset(presetId: string) {
	return ACP_HARNESS_BY_PRESET_ID[
		presetId as keyof typeof ACP_HARNESS_BY_PRESET_ID
	];
}

/** Pure dispatch seam: unsupported configs always retain terminal behavior. */
export function shouldRunAgentWithAcp(
	enabled: boolean,
	presetId: string,
): boolean {
	return enabled && getAcpHarnessForPreset(presetId) !== undefined;
}

async function runTerminalAgent(
	ctx: Pick<HostServiceContext, "db" | "eventBus" | "terminalAgentStore">,
	input: AgentRunInput,
): Promise<AgentRunResult> {
	const config = resolveHostAgentConfig(ctx.db, input.agent);
	if (!config) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `No host agent config matching '${input.agent}' (tried instance id then preset id).`,
		});
	}

	const resolvedAttachments: Array<{ attachmentId: string; path: string }> = [];
	for (const attachmentId of input.attachmentIds ?? []) {
		const resolved = resolveAttachmentPath(attachmentId);
		if (!resolved) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: `Attachment not found: ${attachmentId}`,
			});
		}
		resolvedAttachments.push({ attachmentId, path: resolved.path });
	}

	const prompt = buildAttachmentBlock(input.prompt, resolvedAttachments);
	const modelArgs = buildAgentModelArgs(config.presetId, input.model);
	const effortArgs = buildAgentEffortArgs(config.presetId, input.effort);
	const command = buildAgentCommandString(
		config,
		prompt,
		[...modelArgs, ...effortArgs],
		undefined,
		input.permissionMode,
	);
	const modelEnv = buildAgentModelEnv(config.presetId, input.model);
	const fullCommand = `${envOverlayPrefix({ ...config.env, ...modelEnv })}${command}`;

	const terminalId = input.terminalId ?? crypto.randomUUID();
	const result = await createTerminalSessionInternal({
		terminalId,
		workspaceId: input.workspaceId,
		db: ctx.db,
		eventBus: ctx.eventBus,
		initialCommand: fullCommand,
	});

	if ("error" in result) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: result.error,
		});
	}

	const agentId = AGENT_IDENTITY_IDS.find(
		(candidate): candidate is AgentIdentityId => candidate === config.presetId,
	);
	if (agentId) {
		const occurredAt = Date.now();
		ctx.terminalAgentStore.recordEvent({
			terminalId: result.terminalId,
			workspaceId: input.workspaceId,
			eventType: "Attached",
			agentId,
			occurredAt,
		});
		ctx.eventBus.broadcastAgentLifecycle({
			eventId: randomUUID(),
			workspaceId: input.workspaceId,
			eventType: "Attached",
			terminalId: result.terminalId,
			agent: { agentId },
			occurredAt,
		});
	}

	return {
		kind: "terminal",
		sessionId: result.terminalId,
		label: config.label,
	};
}

async function runAcpAgent(
	ctx: HostServiceContext,
	input: AgentRunInput,
	config: ResolvedHostAgentConfig,
): Promise<AgentRunResult> {
	const harness = getAcpHarnessForPreset(config.presetId);
	if (!harness) return runTerminalAgent(ctx, input);
	if (!ctx.runtime.acpSessionsEnabled) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "ACP sessions are disabled on this host.",
		});
	}
	const sessionId = crypto.randomUUID();
	await ctx.runtime.acpSessions.create({
		sessionId,
		workspaceId: input.workspaceId,
		harness,
		model: input.model,
	});
	await ctx.runtime.acpSessions.prompt({
		sessionId,
		prompt: [{ type: "text", text: input.prompt }],
	});
	return { kind: "acp", sessionId, label: config.label };
}

export async function runAgentInWorkspace(
	ctx: HostServiceContext,
	input: AgentRunInput,
): Promise<AgentRunResult> {
	const workspace = ctx.db.query.workspaces
		.findFirst({ where: eq(workspaces.id, input.workspaceId) })
		.sync();
	if (!workspace) {
		// NOT_FOUND (not a 500) so callers like automation dispatch can tell a
		// dead workspace pin apart from a host-side failure.
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Workspace ${input.workspaceId} not found on this host — it may have been deleted.`,
		});
	}
	const config = resolveHostAgentConfig(ctx.db, input.agent);
	if (!config) return runTerminalAgent(ctx, input);
	return input.respectPresetLaunchMode &&
		shouldRunAgentWithAcp(useAcpForAgentPresets(), config.presetId)
		? runAcpAgent(ctx, input, config)
		: runTerminalAgent(ctx, input);
}

export const agentsRouter = router({
	run: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				agent: z.string().min(1),
				// Empty means launch the configured interactive CLI without a
				// prompt. buildAgentCommandString deliberately drops prompt-only
				// flags for this case.
				prompt: z.string(),
				terminalId: z.string().min(1).optional(),
				attachmentIds: z.array(z.string().uuid()).optional(),
				model: z.string().min(1).optional(),
				effort: z.string().min(1).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => runAgentInWorkspace(ctx, input)),
});
