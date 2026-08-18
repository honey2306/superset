/**
 * Global test setup for Bun tests
 *
 * This file mocks EXTERNAL dependencies only:
 * - Electron APIs (app, dialog, BrowserWindow, ipcMain)
 * - Browser globals (document, window)
 * - trpc-electron renderer requirements
 *
 * DO NOT mock internal code here - tests should use real implementations
 * or mock at the individual test level when necessary.
 */
import { beforeEach, mock } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { z } from "zod";

process.env.NODE_ENV = "test";
process.env.SKIP_ENV_VALIDATION = "1";

const testTmpDir = join(tmpdir(), "superset-test");

// =============================================================================
// Browser Global Mocks (required for renderer code that touches DOM)
// =============================================================================

// Bun runs test files concurrently in one process. Register the real DOM from
// the preload, before any file imports renderer dependencies. Per-file
// `beforeAll` registration leaves a window where modules such as Mermaid and
// Radix observe the incomplete Node stub and cache missing browser APIs.
if (!GlobalRegistrator.isRegistered) {
	GlobalRegistrator.register();
}

// localStorage: renderer stores persisted with zustand's `persist` middleware
// write to it on every setState, and zustand resolves the storage once at
// module load. Install a working mock unconditionally (some environments expose
// a present-but-nonfunctional `localStorage`, so a `typeof === "undefined"`
// guard is not enough) and before any store module is imported.
const localStorageBacking = new Map<string, string>();
const mockLocalStorage: Storage = {
	get length() {
		return localStorageBacking.size;
	},
	clear: () => localStorageBacking.clear(),
	getItem: (key: string) => localStorageBacking.get(key) ?? null,
	key: (index: number) => Array.from(localStorageBacking.keys())[index] ?? null,
	removeItem: (key: string) => {
		localStorageBacking.delete(key);
	},
	setItem: (key: string, value: string) => {
		localStorageBacking.set(key, String(value));
	},
};
Object.defineProperty(globalThis, "localStorage", {
	value: mockLocalStorage,
	writable: true,
	configurable: true,
});
Object.defineProperty(globalThis.window, "localStorage", {
	value: mockLocalStorage,
	writable: true,
	configurable: true,
});

beforeEach(() => {
	localStorageBacking.clear();
});

// =============================================================================
// Electron Preload Mocks (exposed via contextBridge in real app)
// =============================================================================

// trpc-electron expects this global for renderer-side communication
// biome-ignore lint/suspicious/noExplicitAny: Test setup requires extending globalThis
(globalThis as any).electronTRPC = {
	sendMessage: () => {},
	onMessage: (_callback: (msg: unknown) => void) => {},
};

// =============================================================================
// Electron Module Mock (the actual electron package)
// =============================================================================

mock.module("electron", () => ({
	app: {
		getPath: mock(() => testTmpDir),
		getName: mock(() => process.env.SUPERSET_TEST_APP_NAME ?? "test-app"),
		getVersion: mock(() => process.env.SUPERSET_TEST_APP_VERSION ?? "1.0.0"),
		getAppPath: mock(() => testTmpDir),
		get isPackaged() {
			return process.env.SUPERSET_TEST_APP_PACKAGED === "1";
		},
	},
	dialog: {
		showOpenDialog: mock(() =>
			Promise.resolve({ canceled: false, filePaths: [] }),
		),
		showSaveDialog: mock(() =>
			Promise.resolve({ canceled: false, filePath: "" }),
		),
		showMessageBox: mock(() => Promise.resolve({ response: 0 })),
	},
	BrowserWindow: mock(() => ({
		webContents: { send: mock() },
		loadURL: mock(),
		on: mock(),
	})),
	ipcMain: {
		handle: mock(),
		on: mock(),
	},
	shell: {
		openExternal: mock(() => Promise.resolve()),
		openPath: mock(() => Promise.resolve("")),
	},
	clipboard: {
		writeText: mock(),
		readText: mock(() => ""),
	},
	systemPreferences: {
		askForMediaAccess: mock(async () => false),
		getMediaAccessStatus: mock(() => "not-determined"),
		isTrustedAccessibilityClient: mock(() => false),
	},
	screen: {
		getPrimaryDisplay: mock(() => ({
			workAreaSize: { width: 1920, height: 1080 },
			bounds: { x: 0, y: 0, width: 1920, height: 1080 },
		})),
		getAllDisplays: mock(() => [
			{
				bounds: { x: 0, y: 0, width: 1920, height: 1080 },
				workAreaSize: { width: 1920, height: 1080 },
			},
		]),
	},
	Notification: mock(() => ({
		show: mock(),
		on: mock(),
	})),
	Menu: {
		buildFromTemplate: mock(() => ({})),
		setApplicationMenu: mock(),
	},
}));

// =============================================================================
// @superset/local-db Schema Mock (drizzle-orm/sqlite-core not available in Bun tests)
// =============================================================================

const mockTable = (name: string) => ({ id: `${name}_id` });

const agentPresetOverrideSchema = z.object({
	id: z.string(),
	enabled: z.boolean().optional(),
	label: z.string().optional(),
	description: z.string().nullable().optional(),
	command: z.string().optional(),
	promptCommand: z.string().optional(),
	promptCommandSuffix: z.string().nullable().optional(),
	taskPromptTemplate: z.string().optional(),
	contextPromptTemplateSystem: z.string().optional(),
	contextPromptTemplateUser: z.string().optional(),
	model: z.string().optional(),
});

const agentPresetOverrideEnvelopeSchema = z.object({
	version: z.literal(1),
	presets: z.array(agentPresetOverrideSchema),
});

const agentCustomDefinitionSchema = z.object({
	id: z.string().regex(/^custom:/),
	kind: z.literal("terminal"),
	label: z.string(),
	description: z.string().optional(),
	command: z.string(),
	promptCommand: z.string().optional(),
	promptCommandSuffix: z.string().optional(),
	promptTransport: z.enum(["argv", "stdin"]).optional(),
	taskPromptTemplate: z.string(),
	contextPromptTemplateSystem: z.string().optional(),
	contextPromptTemplateUser: z.string().optional(),
	enabled: z.boolean().optional(),
});

const localDbMock = () => ({
	projects: mockTable("projects"),
	workspaces: mockTable("workspaces"),
	worktrees: mockTable("worktrees"),
	settings: mockTable("settings"),
	workspaceSections: mockTable("workspace_sections"),
	agentPresetOverrideSchema,
	agentPresetOverrideEnvelopeSchema,
	agentCustomDefinitionSchema,
	PROMPT_TRANSPORTS: ["argv", "stdin"],
	EXTERNAL_APPS: [],
	EXECUTION_MODES: [
		"split-pane",
		"new-tab",
		"new-tab-split-pane",
		"sequential",
	],
	BRANCH_PREFIX_MODES: ["none", "github", "author", "custom"],
	TERMINAL_LINK_BEHAVIORS: ["external-editor", "file-viewer"],
	FILE_OPEN_MODES: ["split-pane", "new-tab"],
});

// Mock both the package name and the resolved source path to handle
// bun's workspace package resolution in different versions.
mock.module("@superset/local-db", localDbMock);
mock.module("@superset/local-db/schema", localDbMock);

// =============================================================================
// Local DB Mock (better-sqlite3 not supported in Bun tests)
// =============================================================================

mock.module("main/lib/local-db", () => ({
	localDb: {
		select: mock(() => ({
			from: mock(() => ({
				where: mock(() => ({
					get: mock(() => null),
					all: mock(() => []),
				})),
				get: mock(() => null),
				all: mock(() => []),
			})),
		})),
		insert: mock(() => ({
			values: mock(() => ({
				returning: mock(() => ({
					get: mock(() => ({ id: "test-id" })),
				})),
				onConflictDoUpdate: mock(() => ({
					run: mock(),
				})),
				run: mock(),
			})),
		})),
		update: mock(() => ({
			set: mock(() => ({
				where: mock(() => ({
					run: mock(),
					returning: mock(() => ({
						get: mock(() => ({ id: "test-id" })),
					})),
				})),
			})),
		})),
		delete: mock(() => ({
			where: mock(() => ({
				run: mock(),
			})),
		})),
	},
}));
