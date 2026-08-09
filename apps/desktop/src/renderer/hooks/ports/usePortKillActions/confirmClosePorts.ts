import { type AlertOptions, alert } from "@superset/ui/atoms/Alert";
import { useTerminalCloseConfirmStore } from "renderer/stores/terminal-close-confirm/store";

type ShowAlert = (options: AlertOptions) => boolean;

export function confirmClosePorts(
	portCount: number,
	showAlert: ShowAlert = alert,
): Promise<boolean> {
	if (portCount === 0 || useTerminalCloseConfirmStore.getState().suppressed)
		return Promise.resolve(true);
	const single = portCount === 1;
	return new Promise((resolve) => {
		const shown = showAlert({
			title: single
				? "This port is still in use"
				: "These ports are still in use",
			description: single
				? "Closing this port will end the process using it."
				: "Closing these ports will end the processes using them.",
			checkbox: { label: "Don't ask again" },
			onDismiss: () => resolve(false),
			actions: [
				{
					label: single ? "Close port" : "Close ports",
					variant: "destructive",
					onClick: ({ checkboxChecked }) => {
						if (checkboxChecked)
							useTerminalCloseConfirmStore.getState().suppress();
						resolve(true);
					},
				},
				{ label: "Cancel", variant: "ghost", onClick: () => resolve(false) },
			],
		});
		if (!shown) resolve(true);
	});
}
