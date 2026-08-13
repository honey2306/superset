import type { AppRouter } from "@superset/host-service";
import type { TRPCClient } from "@trpc/client";
import { useMemo } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { registerTerminalCleanup } from "renderer/lib/terminal/terminal-cleanup";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import { useWorkspaceCatalog } from "renderer/routes/_local/providers/WorkspaceCatalogProvider";
import { normalizeTerminalCommand } from "./launch-command";

export interface HostTerminalTarget {
	hostUrl: string;
	workspaceId: string;
}

export interface HostTerminalInput {
	workspaceId: string;
	terminalId: string;
}

export interface HostTerminalCreateInput extends HostTerminalInput {
	initialCommand?: string;
	cwd?: string;
	cols?: number;
	rows?: number;
	themeType?: "dark" | "light";
}

export interface HostTerminalLaunchCommandInput extends HostTerminalInput {
	command: string;
	cwd?: string;
	noExecute?: boolean;
}

export interface HostTerminalLauncher {
	resolve(workspaceId: string): HostTerminalTarget;
	create(input: HostTerminalCreateInput): Promise<{ terminalId: string }>;
	launchCommand(input: HostTerminalLaunchCommandInput): Promise<void>;
	write(input: HostTerminalInput & { data: string }): Promise<void>;
	kill(input: HostTerminalInput): Promise<void>;
}

interface HostTerminalLauncherDeps {
	resolveTarget: (workspaceId: string) => HostTerminalTarget | null;
	getClient?: (hostUrl: string) => TRPCClient<AppRouter>;
}

/**
 * Creates terminal sessions directly through host-service. It deliberately has
 * no dependency on a mounted pane or the terminal runtime registry: callers
 * may launch a background tab before React mounts its terminal component.
 */
export function createHostTerminalLauncher({
	resolveTarget,
	getClient = getHostServiceClientByUrl,
}: HostTerminalLauncherDeps): HostTerminalLauncher {
	const resolve = (workspaceId: string): HostTerminalTarget => {
		const target = resolveTarget(workspaceId);
		if (!target) {
			throw new Error(
				`Workspace ${workspaceId} is not available on the local host service`,
			);
		}
		return target;
	};

	const clientFor = (workspaceId: string) => {
		const target = resolve(workspaceId);
		return { target, client: getClient(target.hostUrl) };
	};

	const create = async (input: HostTerminalCreateInput) => {
		const { target, client } = clientFor(input.workspaceId);
		const result = await client.terminal.createSession.mutate({
			workspaceId: target.workspaceId,
			terminalId: input.terminalId,
			initialCommand: input.initialCommand,
			cwd: input.cwd,
			cols: input.cols,
			rows: input.rows,
			themeType: input.themeType,
		});
		registerTerminalCleanup(input.terminalId, async () => {
			await client.terminal.killSession.mutate({
				workspaceId: target.workspaceId,
				terminalId: result.terminalId,
			});
		});
		return { terminalId: result.terminalId };
	};

	const write = async (input: HostTerminalInput & { data: string }) => {
		const { target, client } = clientFor(input.workspaceId);
		await client.terminal.writeInput.mutate({
			workspaceId: target.workspaceId,
			terminalId: input.terminalId,
			data: input.data,
		});
	};

	return {
		resolve,
		create,
		async launchCommand(input) {
			if (input.noExecute) {
				await create(input);
				await write({
					workspaceId: input.workspaceId,
					terminalId: input.terminalId,
					data: input.command,
				});
				return;
			}
			await create({
				workspaceId: input.workspaceId,
				terminalId: input.terminalId,
				initialCommand: normalizeTerminalCommand(input.command),
				cwd: input.cwd,
			});
		},
		write,
		async kill(input) {
			const { target, client } = clientFor(input.workspaceId);
			await client.terminal.killSession.mutate({
				workspaceId: target.workspaceId,
				terminalId: input.terminalId,
			});
		},
	};
}

/** Maps Catalog workspace IDs to the single local host-service URL. */
export function useHostTerminalLauncher(): HostTerminalLauncher {
	const { activeHostUrl } = useLocalHostService();
	const { workspaces } = useWorkspaceCatalog();
	const workspaceIds = useMemo(
		() => new Set(workspaces.map((workspace) => workspace.id)),
		[workspaces],
	);

	return useMemo(
		() =>
			createHostTerminalLauncher({
				resolveTarget: (workspaceId) =>
					activeHostUrl && workspaceIds.has(workspaceId)
						? { hostUrl: activeHostUrl, workspaceId }
						: null,
			}),
		[activeHostUrl, workspaceIds],
	);
}
