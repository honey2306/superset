import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export type PortKillResult = { success: boolean; error?: string };

export interface PortKillTarget {
	workspaceId: string;
	/** Backend workspace id when the visible workspace uses a different id. */
	killWorkspaceId: string;
	terminalId: string;
	port: number;
	hostUrl: string;
}

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

export async function killPortTarget(
	target: PortKillTarget,
): Promise<PortKillResult> {
	try {
		return await getHostServiceClientByUrl(target.hostUrl).ports.kill.mutate({
			workspaceId: target.killWorkspaceId,
			terminalId: target.terminalId,
			port: target.port,
		});
	} catch (error) {
		return { success: false, error: toErrorMessage(error) };
	}
}
