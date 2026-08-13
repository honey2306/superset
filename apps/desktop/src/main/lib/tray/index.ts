import { existsSync } from "node:fs";
import { join } from "node:path";
import {
	app,
	Menu,
	type MenuItemConstructorOptions,
	nativeImage,
	Tray,
} from "electron";
import { getHostServiceSpawnConfig } from "lib/trpc/routers/host-service-coordinator/utils/get-host-service-spawn-config";
import { focusMainWindow, quitApp } from "main/index";
import {
	getHostServiceCoordinator,
	type HostServiceStatusEvent,
} from "main/lib/host-service-coordinator";
import { menuEmitter } from "main/lib/menu-events";
import { confirmAndQuitCompletely } from "main/lib/quit-completely";

/** Must have "Template" suffix for macOS dark/light mode support */
const TRAY_ICON_FILENAME = "iconTemplate.png";

function getTrayIconPath(): string | null {
	if (app.isPackaged) {
		const prodPath = join(
			process.resourcesPath,
			"app.asar.unpacked/resources/tray",
			TRAY_ICON_FILENAME,
		);
		if (existsSync(prodPath)) return prodPath;
		return null;
	}

	const previewPath = join(__dirname, "../resources/tray", TRAY_ICON_FILENAME);
	if (existsSync(previewPath)) {
		return previewPath;
	}

	const devPath = join(
		app.getAppPath(),
		"src/resources/tray",
		TRAY_ICON_FILENAME,
	);
	if (existsSync(devPath)) {
		return devPath;
	}

	console.warn("[Tray] Icon not found at:", previewPath, "or", devPath);
	return null;
}

let tray: Tray | null = null;

function createTrayIcon(): Electron.NativeImage | null {
	const iconPath = getTrayIconPath();
	if (!iconPath) {
		console.warn("[Tray] Icon not found");
		return null;
	}

	try {
		let image = nativeImage.createFromPath(iconPath);
		const size = image.getSize();

		if (image.isEmpty() || size.width === 0 || size.height === 0) {
			console.warn("[Tray] Icon loaded with zero size from:", iconPath);
			return null;
		}

		// 16x16 is standard menu bar size, auto-scales for Retina
		if (size.width > 22 || size.height > 22) {
			image = image.resize({ width: 16, height: 16 });
		}
		image.setTemplateImage(true);
		return image;
	} catch (error) {
		console.warn("[Tray] Failed to load icon:", error);
		return null;
	}
}

function openSettings(): void {
	focusMainWindow();
	menuEmitter.emit("open-settings");
}

interface HostInfo {
	hostName: string;
	version: string;
}

async function fetchHostInfo(): Promise<HostInfo | null> {
	const connection = getHostServiceCoordinator().getConnection();
	if (!connection) return null;

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 2000);
	try {
		const res = await fetch(
			`http://127.0.0.1:${connection.port}/trpc/host.info`,
			{
				headers: { Authorization: `Bearer ${connection.secret}` },
				signal: controller.signal,
			},
		);
		if (!res.ok) return null;
		const data = await res.json();
		const info = data?.result?.data?.json;
		if (!info?.hostName) return null;
		return {
			hostName: info.hostName,
			version: info.version ?? "",
		};
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

function buildHostServiceSubmenu(
	info: HostInfo | null,
): MenuItemConstructorOptions[] {
	const coordinator = getHostServiceCoordinator();
	const status = coordinator.getProcessStatus();
	const isRunning = status === "running";
	const label = info?.hostName ?? (isRunning ? "Loading…" : "Local");
	const versionSuffix = info?.version ? ` (v${info.version})` : "";

	return [
		{ label, enabled: false },
		{ label: `  ${status}${versionSuffix}`, enabled: false },
		{
			label: "  Restart",
			enabled: status !== "starting",
			click: () => {
				void coordinator
					.restart(getHostServiceSpawnConfig())
					.catch((error) => {
						console.error(
							"[Tray] Failed to restart embedded host-service:",
							error,
						);
					})
					.finally(() => void updateTrayMenu());
			},
		},
		{
			label: "  Stop",
			enabled: isRunning,
			click: () => {
				coordinator.stop();
				void updateTrayMenu();
			},
		},
	];
}

async function updateTrayMenu(): Promise<void> {
	if (!tray) return;

	const info = await fetchHostInfo();
	if (!tray) return;

	const menu = Menu.buildFromTemplate([
		{
			label: "Host Service",
			submenu: buildHostServiceSubmenu(info),
		},
		{ type: "separator" },
		{ label: "Open Superset", click: focusMainWindow },
		{ label: "Settings", click: openSettings },
		{
			label: "Check for Updates",
			click: () => {
				const { checkForUpdatesInteractive } = require("../auto-updater");
				checkForUpdatesInteractive();
			},
		},
		{ type: "separator" },
		{ label: "Close Superset", click: () => quitApp() },
		{ type: "separator" },
		{
			label: "Quit Superset Completely",
			click: () => {
				void confirmAndQuitCompletely();
			},
		},
	]);

	tray.setContextMenu(menu);
}

/** Call once after app.whenReady() */
export function initTray(): void {
	if (tray) {
		console.warn("[Tray] Already initialized");
		return;
	}

	if (process.platform !== "darwin") {
		return;
	}

	try {
		const icon = createTrayIcon();
		if (!icon) {
			console.warn("[Tray] Skipping initialization - no icon available");
			return;
		}

		tray = new Tray(icon);
		tray.setToolTip("Superset");

		void updateTrayMenu();

		const manager = getHostServiceCoordinator();
		manager.on("status-changed", (_event: HostServiceStatusEvent) => {
			void updateTrayMenu();
		});

		tray.on("mouse-enter", () => {
			void updateTrayMenu();
		});

		console.log("[Tray] Initialized successfully");
	} catch (error) {
		console.error("[Tray] Failed to initialize:", error);
	}
}

/** Call on app quit */
export function disposeTray(): void {
	if (tray) {
		tray.destroy();
		tray = null;
	}
}
