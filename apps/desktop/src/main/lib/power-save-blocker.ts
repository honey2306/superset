import type { SessionStatus } from "@superset/session-protocol";

export function hasRunningWork(
	acpStatuses: Iterable<SessionStatus>,
	terminalEvents: Iterable<string>,
): boolean {
	for (const status of acpStatuses) {
		if (
			status === "starting" ||
			status === "running" ||
			status === "awaiting_permission"
		) {
			return true;
		}
	}
	for (const event of terminalEvents) {
		if (event === "Start" || event === "PermissionRequest") return true;
	}
	return false;
}

export interface PowerSaveBlockerPort {
	start(type: "prevent-app-suspension"): number;
	stop(id: number): void;
}

export function createPowerSaveBlockerManager(port: PowerSaveBlockerPort) {
	let blockerId: number | null = null;

	return {
		setActive(active: boolean): void {
			if (active && blockerId === null) {
				blockerId = port.start("prevent-app-suspension");
			} else if (!active && blockerId !== null) {
				port.stop(blockerId);
				blockerId = null;
			}
		},
		stop(): void {
			this.setActive(false);
		},
		isActive(): boolean {
			return blockerId !== null;
		},
	};
}
