export const DEEP_LINK_NAVIGATE_CHANNEL = "deep-link-navigate";

type IpcListener = (event: unknown, ...args: unknown[]) => void;

interface IpcEventSource {
	on: (channel: string, listener: IpcListener) => void;
	removeListener: (channel: string, listener: IpcListener) => void;
}

export function createDesktopEvents(ipcEvents: IpcEventSource) {
	return {
		onDeepLinkNavigate: (listener: (path: string) => void) => {
			const wrappedListener: IpcListener = (_event, path) => {
				if (typeof path === "string") {
					listener(path);
				}
			};
			let subscribed = true;

			ipcEvents.on(DEEP_LINK_NAVIGATE_CHANNEL, wrappedListener);

			return () => {
				if (!subscribed) return;
				subscribed = false;
				ipcEvents.removeListener(DEEP_LINK_NAVIGATE_CHANNEL, wrappedListener);
			};
		},
	};
}

export type DesktopEvents = ReturnType<typeof createDesktopEvents>;
