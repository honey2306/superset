import "@sentry/electron/preload";

import { contextBridge, ipcRenderer, webUtils } from "electron";
import { exposeElectronTRPC } from "trpc-electron/main";
import { createDesktopEvents, type DesktopEvents } from "./desktop-events";

declare const __APP_VERSION__: string;

declare global {
	interface Window {
		App: typeof API;
		desktopEvents: DesktopEvents;
		webUtils: {
			getPathForFile: (file: File) => string;
		};
	}
}

const API = {
	sayHelloFromBridge: () => console.log("\nHello from bridgeAPI! 👋\n\n"),
	username: process.env.USER,
	appVersion: __APP_VERSION__,
};

const desktopEvents = createDesktopEvents({
	on: (channel, listener) => ipcRenderer.on(channel, listener),
	removeListener: (channel, listener) =>
		ipcRenderer.removeListener(channel, listener),
});

// Expose electron-trpc IPC channel FIRST (must be before contextBridge calls)
exposeElectronTRPC();

contextBridge.exposeInMainWorld("App", API);
contextBridge.exposeInMainWorld("desktopEvents", desktopEvents);
contextBridge.exposeInMainWorld("webUtils", {
	getPathForFile: (file: File) => webUtils.getPathForFile(file),
});
