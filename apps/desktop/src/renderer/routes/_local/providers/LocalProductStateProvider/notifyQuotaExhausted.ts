import { toast } from "@superset/ui/sonner";
import { clearAllTerminalState } from "renderer/lib/terminal/terminal-buffer-gc";

const TOAST_ID = "localstorage-quota-exhausted";
const warnedStorageKeys = new Set<string>();

export function notifyQuotaExhausted(storageKey: string): void {
	if (!warnedStorageKeys.has(storageKey)) {
		warnedStorageKeys.add(storageKey);
		console.warn(
			`[collections] localStorage is full; "${storageKey}" will not persist.`,
		);
	}
	toast.warning("Storage is full", {
		id: TOAST_ID,
		description:
			"Layout and sidebar changes are kept for this session but revert when Superset restarts.",
		action: {
			label: "Free up space",
			onClick: () => {
				const cleared = clearAllTerminalState();
				toast.success(
					`Cleared ${cleared} saved terminal ${cleared === 1 ? "entry" : "entries"}`,
					{ id: TOAST_ID },
				);
			},
		},
	});
}
