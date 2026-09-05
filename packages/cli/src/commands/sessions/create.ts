/**
 * `superset sessions create` — start a new conversation in a workspace.
 *
 * The session id is client-generated so the call is idempotent: retrying with
 * the same id returns the existing session rather than starting a second one.
 */

import { getFlag, getOption } from "../../lib/args";
import type { CommandContext } from "../../lib/context";
import { usageError } from "../../lib/exit-codes";
import { loadCatalog, resolveWorkspace } from "../../lib/resolve";
import { serializeSession, statusLabel } from "./shared";

const HARNESSES = [
	"claude-agent-acp",
	"codex-app-server",
	"pi-acp",
	"myflicker-acp",
	"deepseek-acp",
] as const;

type Harness = (typeof HARNESSES)[number];

/** Accept short aliases so callers need not spell out the adapter id. */
const HARNESS_ALIASES: Record<string, Harness> = {
	claude: "claude-agent-acp",
	codex: "codex-app-server",
	pi: "pi-acp",
	myflicker: "myflicker-acp",
	deepseek: "deepseek-acp",
};

function resolveHarness(raw: string | undefined): Harness | undefined {
	if (!raw) return undefined;
	const alias = HARNESS_ALIASES[raw.toLowerCase()];
	if (alias) return alias;
	if ((HARNESSES as readonly string[]).includes(raw)) return raw as Harness;
	throw usageError(
		`Unknown agent: ${raw}`,
		`Available: ${Object.keys(HARNESS_ALIASES).join(", ")}`,
	);
}

export async function sessionsCreateCommand(
	ctx: CommandContext,
): Promise<void> {
	const connection = await ctx.host();
	const catalog = await loadCatalog(connection);

	const workspace = resolveWorkspace(
		catalog.workspaces,
		getOption(ctx.args, "workspace", "w"),
		process.cwd(),
	);

	const session = await connection.client.acpSessions.create.mutate({
		sessionId: crypto.randomUUID(),
		workspaceId: workspace.id,
		harness: resolveHarness(getOption(ctx.args, "harness", "agent")),
		model: getOption(ctx.args, "model"),
	});

	if (ctx.out.isMachineReadable) {
		ctx.out.json(serializeSession(session, workspace.name));
		return;
	}

	if (getFlag(ctx.args, "quiet")) {
		ctx.out.result(session.sessionId);
		return;
	}

	ctx.out.line();
	ctx.out.line(`${ctx.out.green("✓")} Conversation created`);
	ctx.out.line();
	ctx.out.table([
		[ctx.out.dim("id"), session.sessionId],
		[ctx.out.dim("agent"), session.harness],
		[ctx.out.dim("workspace"), workspace.name],
		[ctx.out.dim("status"), statusLabel(ctx, session.status)],
	]);
	ctx.out.line();
	ctx.out.line(
		ctx.out.dim(
			`Continue it: superset sessions send ${session.sessionId.slice(0, 8)} "..." --follow`,
		),
	);
	ctx.out.line();
}
