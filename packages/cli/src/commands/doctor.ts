/**
 * `superset doctor` — diagnose why the CLI can't reach the local runtime.
 *
 * Deliberately does not use `ctx.host()`: that helper throws on exactly the
 * failures this command exists to explain. Each check runs in order and
 * reports what it found, so a user (or an agent) learns whether the desktop
 * app is closed, the manifest is stale, or auth is being rejected.
 */

import {
	hostManifestPath,
	isProcessAlive,
	LOCAL_HOST_SCOPE_ID,
	readHostManifest,
	resolveBuildChannel,
	resolveSupersetHomeDir,
} from "@superset/shared/host-paths";
import type { CommandContext } from "../lib/context";
import { EXIT_CODES } from "../lib/exit-codes";
import { createHostClient } from "../lib/host-connection";
import { CLI_VERSION } from "../lib/version";

type CheckStatus = "ok" | "warn" | "fail";

interface Check {
	name: string;
	status: CheckStatus;
	detail: string;
	/** Actionable next step, shown only when the check did not pass. */
	remedy?: string;
}

export async function doctorCommand(ctx: CommandContext): Promise<number> {
	const checks: Check[] = [];
	const env = ctx.env;

	const homeDir = resolveSupersetHomeDir(env);
	const manifestPath = hostManifestPath(LOCAL_HOST_SCOPE_ID, env);
	checks.push({
		name: "home directory",
		status: "ok",
		detail: `${homeDir} (channel: ${resolveBuildChannel(env)})`,
	});

	const manifest = readHostManifest(LOCAL_HOST_SCOPE_ID, env);
	if (!manifest) {
		checks.push({
			name: "manifest",
			status: "fail",
			detail: `not found at ${manifestPath}`,
			remedy: "Start the Superset desktop app.",
		});
		return report(ctx, checks);
	}
	checks.push({ name: "manifest", status: "ok", detail: manifestPath });

	if (!isProcessAlive(manifest.pid)) {
		checks.push({
			name: "host process",
			status: "fail",
			detail: `pid ${manifest.pid} is not running (stale manifest)`,
			remedy:
				"The desktop app exited without cleaning up. Start it again to refresh the manifest.",
		});
		return report(ctx, checks);
	}
	checks.push({
		name: "host process",
		status: "ok",
		detail: `pid ${manifest.pid} alive`,
	});

	// health.check is a public procedure: it separates "unreachable" from
	// "reachable but rejecting our token", which are different fixes.
	const client = createHostClient(manifest);
	try {
		await client.health.check.query();
		checks.push({
			name: "reachable",
			status: "ok",
			detail: manifest.endpoint,
		});
	} catch (error) {
		checks.push({
			name: "reachable",
			status: "fail",
			detail: `${manifest.endpoint} — ${errorMessage(error)}`,
			remedy:
				"The process is alive but not serving. Restart the Superset desktop app.",
		});
		return report(ctx, checks);
	}

	try {
		const info = await client.host.info.query();
		checks.push({
			name: "authentication",
			status: "ok",
			detail: "pre-shared key accepted",
		});
		checks.push({
			name: "host version",
			status: info.version === CLI_VERSION ? "ok" : "warn",
			detail:
				info.version === CLI_VERSION
					? `${info.version} (matches CLI)`
					: `host ${info.version}, CLI ${CLI_VERSION}`,
			remedy:
				info.version === CLI_VERSION
					? undefined
					: "Version drift: update the desktop app and the CLI together.",
		});
	} catch (error) {
		checks.push({
			name: "authentication",
			status: "fail",
			detail: errorMessage(error),
			remedy:
				"The manifest token was rejected. Restart the desktop app to reissue it.",
		});
		return report(ctx, checks);
	}

	try {
		const sessions = await client.acpSessions.list.query({ limit: 1 });
		checks.push({
			name: "conversations",
			status: sessions.enabled ? "ok" : "warn",
			detail: sessions.enabled
				? "ACP sessions available"
				: "ACP sessions are disabled on this host",
			remedy: sessions.enabled
				? undefined
				: "Set SUPERSET_ACP_SESSIONS=1 for the host-service to enable them.",
		});
	} catch (error) {
		checks.push({
			name: "conversations",
			status: "warn",
			detail: errorMessage(error),
		});
	}

	return report(ctx, checks);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function report(ctx: CommandContext, checks: readonly Check[]): number {
	const failed = checks.some((check) => check.status === "fail");

	if (ctx.out.isMachineReadable) {
		ctx.out.json({
			ok: !failed,
			checks: checks.map((check) => ({
				name: check.name,
				status: check.status,
				detail: check.detail,
				remedy: check.remedy,
			})),
		});
		return failed ? EXIT_CODES.UNAVAILABLE : EXIT_CODES.OK;
	}

	ctx.out.line();
	for (const check of checks) {
		const marker =
			check.status === "ok"
				? ctx.out.green("✓")
				: check.status === "warn"
					? ctx.out.yellow("!")
					: ctx.out.red("✗");
		ctx.out.line(`  ${marker} ${check.name}`);
		ctx.out.line(`    ${ctx.out.dim(check.detail)}`);
		if (check.remedy) ctx.out.line(`    ${ctx.out.dim(`→ ${check.remedy}`)}`);
	}
	ctx.out.line();
	ctx.out.line(
		failed
			? ctx.out.red("The local runtime is not reachable.")
			: ctx.out.green("The local runtime is healthy."),
	);
	ctx.out.line();

	return failed ? EXIT_CODES.UNAVAILABLE : EXIT_CODES.OK;
}
