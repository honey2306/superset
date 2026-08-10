import { alert } from "@superset/ui/atoms/Alert";

export async function confirmCloseAcpSession(): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		const shown = alert({
			title: "Close agent session?",
			description:
				"The agent is still running. Closing will cancel the current turn.",
			onDismiss: () => resolve(false),
			actions: [
				{
					label: "Close agent session",
					variant: "destructive",
					onClick: () => resolve(true),
				},
				{ label: "Cancel", variant: "ghost", onClick: () => resolve(false) },
			],
		});
		if (!shown) resolve(true);
	});
}
