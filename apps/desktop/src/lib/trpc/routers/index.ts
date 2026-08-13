import type { BrowserWindow } from "electron";
import { router } from "..";
import { createAnalyticsRouter } from "./analytics";
import { createAutoUpdateRouter } from "./auto-update";
import { createDeviceRouter } from "./device";
import { createExternalRouter } from "./external";
import { createHostServiceCoordinatorRouter } from "./host-service-coordinator";
import { createKeyboardLayoutRouter } from "./keyboardLayout";
import { createMenuRouter } from "./menu";
import { createNotificationsRouter } from "./notifications";
import { createPermissionsRouter } from "./permissions";
import { createResourceMetricsRouter } from "./resource-metrics";
import { createRingtoneRouter } from "./ringtone";
import { createSettingsRouter } from "./settings";
import { createSystemRouter } from "./system";
import { createUiStateRouter } from "./ui-state";
import { createWindowRouter } from "./window";

export const createAppRouter = (getWindow: () => BrowserWindow | null) => {
	return router({
		analytics: createAnalyticsRouter(),
		autoUpdate: createAutoUpdateRouter(),
		window: createWindowRouter(getWindow),
		notifications: createNotificationsRouter(getWindow),
		permissions: createPermissionsRouter(),
		resourceMetrics: createResourceMetricsRouter(),
		menu: createMenuRouter(),
		external: createExternalRouter(),
		settings: createSettingsRouter(),
		system: createSystemRouter(),
		device: createDeviceRouter(),
		uiState: createUiStateRouter(),
		ringtone: createRingtoneRouter(getWindow),
		hostServiceCoordinator: createHostServiceCoordinatorRouter(),
		keyboardLayout: createKeyboardLayoutRouter(),
	});
};

export type AppRouter = ReturnType<typeof createAppRouter>;
