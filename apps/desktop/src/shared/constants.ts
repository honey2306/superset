import { PROTOCOL_SCHEMES } from "@superset/shared/constants";
import {
	type BuildChannel,
	getBuildChannel,
	getWorkspaceName,
} from "./env.shared";

export const PLATFORM = {
	IS_MAC: process.platform === "darwin",
	IS_WINDOWS: process.platform === "win32",
	IS_LINUX: process.platform === "linux",
};

const workspace = getWorkspaceName();
export const SUPERSET_DIR_NAME = workspace
	? `.superset-${workspace}`
	: ".superset";
export const CANARY_PRODUCT_NAME = "Superset Canary";
export const CANARY_SUPERSET_DIR_NAME = ".superset-canary";
export const PERSONAL_PRODUCT_NAME = "Superset Personal";
export const PERSONAL_SUPERSET_DIR_NAME = ".superset-personal";
export const PERSONAL_PROTOCOL_SCHEME = "superset-personal";

/**
 * Canary builds must never share mutable runtime data with the stable app.
 * Development worktrees keep their existing workspace-specific directories.
 */
export function getSupersetDirNameForApp(appName: string): string {
	if (appName === PERSONAL_PRODUCT_NAME) return PERSONAL_SUPERSET_DIR_NAME;
	if (appName === CANARY_PRODUCT_NAME) return CANARY_SUPERSET_DIR_NAME;
	return SUPERSET_DIR_NAME;
}

export function getSupersetDirNameForBuild(buildChannel: BuildChannel): string {
	if (buildChannel === "personal") return PERSONAL_SUPERSET_DIR_NAME;
	if (buildChannel === "canary") return CANARY_SUPERSET_DIR_NAME;
	return SUPERSET_DIR_NAME;
}

export function getProtocolSchemeForBuild(
	buildChannel: BuildChannel,
	workspaceName = workspace,
): string {
	if (workspaceName) return `superset-${workspaceName}`;
	return buildChannel === "personal"
		? PERSONAL_PROTOCOL_SCHEME
		: PROTOCOL_SCHEMES.PROD;
}

export const PROTOCOL_SCHEME = getProtocolSchemeForBuild(getBuildChannel());
// Project-level directory name (always .superset, not conditional)
export const PROJECT_SUPERSET_DIR_NAME = ".superset";
export const WORKTREES_DIR_NAME = "worktrees";
export const PROJECTS_DIR_NAME = "projects";
export const CONFIG_FILE_NAME = "config.json";
export const LOCAL_CONFIG_FILE_NAME = "config.local.json";
export const PORTS_FILE_NAME = "ports.json";

export const CONFIG_TEMPLATE = `{
  "setup": [],
  "teardown": [],
  "run": []
}`;

export const NOTIFICATION_EVENTS = {
	AGENT_LIFECYCLE: "agent-lifecycle",
	FOCUS_TAB: "focus-tab",
	FOCUS_NOTIFICATION_SOURCE: "focus-notification-source",
	TERMINAL_EXIT: "terminal-exit",
} as const;

// Stable scope for the single local desktop runtime. Keep this value stable so
// existing host.db data created by the previous local-session shim remains
// discoverable after cloud identity is removed.
export const LOCAL_HOST_SCOPE_ID = "1887f807-99db-49c0-9568-fc085a2fd36a";

// Development/testing mock values (used when SKIP_ENV_VALIDATION is set)
export const MOCK_ORG_ID = "mock-org-id";

// Terminal defaults
export const DEFAULT_TERMINAL_SCROLLBACK = 5000;
// Hidden (parked) xterm instances kept fully alive before LRU eviction. (SUPER-1545)
export const DEFAULT_TERMINAL_PARKED_RUNTIME_CAP = 12;
export const MIN_TERMINAL_PARKED_RUNTIME_CAP = 2;
export const MAX_TERMINAL_PARKED_RUNTIME_CAP = 64;

// Default user preference values
export const DEFAULT_CONFIRM_ON_QUIT = true;
export const DEFAULT_TERMINAL_LINK_BEHAVIOR = "file-viewer" as const;
export const DEFAULT_FILE_OPEN_MODE = "split-pane" as const;
export const DEFAULT_AUTO_APPLY_DEFAULT_PRESET = true;
export const DEFAULT_SHOW_PRESETS_BAR = true;
export const DEFAULT_USE_COMPACT_TERMINAL_ADD_BUTTON = true;
export const DEFAULT_TELEMETRY_ENABLED = true;
export const DEFAULT_SHOW_RESOURCE_MONITOR = true;
export const DEFAULT_USE_ACP_FOR_AGENT_PRESETS = false;

// External links (documentation, help resources, etc.)
export const EXTERNAL_LINKS = {
	SETUP_TEARDOWN_SCRIPTS: `${process.env.NEXT_PUBLIC_DOCS_URL}/setup-teardown-scripts`,
} as const;
