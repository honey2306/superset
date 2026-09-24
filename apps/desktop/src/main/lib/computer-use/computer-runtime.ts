import {
	CuaDriver,
	currentMacOsPermissionStatus,
	type ToolResult,
} from "@trycua/cua-driver";
import {
	hasRequiredMacOSPermissions,
	requestMacOSPermissions,
} from "@trycua/cua-driver/electron";
import { SupersetComputerToolsRuntime } from "./superset-computer-runtime";

type JsonRecord = Record<string, unknown>;

export interface ComputerProviderTool {
	name: string;
	description?: string;
	inputSchema: JsonRecord;
	outputSchema?: JsonRecord;
	annotations?: JsonRecord;
	[key: string]: unknown;
}

export interface ComputerProviderCatalog {
	capability_version?: string;
	schema_version?: string;
	tools: ComputerProviderTool[];
	[key: string]: unknown;
}

export interface SerializableComputerToolResult {
	text: string;
	images: Array<{ mimeType: string; dataBase64: string }>;
	structuredJson?: string;
	isError: boolean;
	errorCode?: string;
	degraded: boolean;
	rawJson: string;
	action?: unknown;
	verification?: unknown;
}

export interface ComputerPermissionState {
	platform: NodeJS.Platform;
	accessibility: boolean | null;
	screenRecording: boolean | null;
	ready: boolean;
	prompted: boolean;
	relaunchRequired: boolean;
}

type CuaDriverInstance = ReturnType<typeof CuaDriver.create>;

function serializeResult(result: ToolResult): SerializableComputerToolResult {
	return {
		text: result.text,
		images: result.images.map((image) => ({
			mimeType: image.mimeType,
			dataBase64: image.dataBase64,
		})),
		...(result.structuredJson ? { structuredJson: result.structuredJson } : {}),
		isError: result.isError,
		...(result.errorCode ? { errorCode: result.errorCode } : {}),
		degraded: result.degraded,
		rawJson: result.rawJson,
		...(result.action ? { action: result.action } : {}),
		...(result.verification ? { verification: result.verification } : {}),
	};
}

function asCatalog(value: unknown): ComputerProviderCatalog {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("Cua Driver returned an invalid tool catalog");
	}
	const catalog = value as ComputerProviderCatalog;
	if (!Array.isArray(catalog.tools)) {
		throw new Error("Cua Driver tool catalog is missing tools");
	}
	return catalog;
}

/**
 * Application-lifetime desktop provider. It intentionally lives in Electron
 * main so macOS TCC attributes Accessibility and Screen Recording to Superset.
 */
export class ComputerRuntime {
	private driver: CuaDriverInstance | null = null;
	private cuaCatalog: ComputerProviderCatalog | null = null;
	private catalog: ComputerProviderCatalog | null = null;
	private starting: Promise<CuaDriverInstance> | null = null;
	private readonly supersetTools = new SupersetComputerToolsRuntime(
		(sessionId, name, args, signal) =>
			this.callCuaTool(sessionId, name, args, signal),
	);

	async isAvailable(): Promise<boolean> {
		try {
			const driver = await this.ensureDriver();
			return driver.isAvailable();
		} catch {
			return false;
		}
	}

	async metadata(): Promise<Record<string, unknown>> {
		const driver = await this.ensureDriver();
		const value = await driver.metadata();
		return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
	}

	async listTools(): Promise<ComputerProviderCatalog> {
		if (this.catalog) return this.catalog;
		const cua = await this.listCuaTools();
		const superset = this.supersetTools
			.tools()
			.map((tool) => JSON.parse(JSON.stringify(tool)) as ComputerProviderTool);
		this.catalog = {
			...cua,
			tools: [...cua.tools, ...superset],
		};
		return this.catalog;
	}

	async callTool(
		sessionId: string,
		name: string,
		args: JsonRecord,
		signal?: AbortSignal,
	): Promise<SerializableComputerToolResult> {
		if (name.startsWith("superset_")) {
			return this.supersetTools.call(sessionId, name, args, signal);
		}
		return this.callCuaTool(sessionId, name, args, signal);
	}

	permissions(prompt = false): ComputerPermissionState {
		if (process.platform !== "darwin") {
			return {
				platform: process.platform,
				accessibility: null,
				screenRecording: null,
				ready: true,
				prompted: false,
				relaunchRequired: false,
			};
		}
		const before = currentMacOsPermissionStatus();
		const status = prompt ? requestMacOSPermissions() : before;
		const ready = hasRequiredMacOSPermissions(status);
		return {
			platform: process.platform,
			accessibility: status.accessibility,
			screenRecording: status.screenRecording,
			ready,
			prompted: prompt,
			relaunchRequired:
				prompt &&
				(!before.accessibility || !before.screenRecording) &&
				ready !== true,
		};
	}

	async endSession(sessionId: string): Promise<void> {
		try {
			const catalog = await this.listCuaTools();
			if (!catalog.tools.some((tool) => tool.name === "end_session")) return;
			const driver = await this.ensureDriver();
			await driver.callTool(
				"end_session",
				JSON.stringify({ session: sessionId }),
			);
		} catch {
			// Session cleanup is best effort; the runtime also expires idle sessions.
		}
	}

	async shutdown(): Promise<void> {
		const driver = this.driver;
		this.driver = null;
		this.cuaCatalog = null;
		this.catalog = null;
		this.starting = null;
		if (!driver) return;
		await driver.shutdown();
		if (
			"uniffiDestroy" in driver &&
			typeof driver.uniffiDestroy === "function"
		) {
			driver.uniffiDestroy();
		}
	}

	private async listCuaTools(): Promise<ComputerProviderCatalog> {
		if (this.cuaCatalog) return this.cuaCatalog;
		const driver = await this.ensureDriver();
		this.cuaCatalog = asCatalog(JSON.parse(await driver.listToolsJson()));
		return this.cuaCatalog;
	}

	private async callCuaTool(
		sessionId: string,
		name: string,
		args: JsonRecord,
		signal?: AbortSignal,
	): Promise<SerializableComputerToolResult> {
		const catalog = await this.listCuaTools();
		const tool = catalog.tools.find((candidate) => candidate.name === name);
		if (!tool) throw new Error(`Unsupported Cua Computer tool: ${name}`);

		const prepared: JsonRecord = { ...args };
		delete prepared.session;
		const properties =
			tool.inputSchema &&
			typeof tool.inputSchema.properties === "object" &&
			tool.inputSchema.properties !== null &&
			!Array.isArray(tool.inputSchema.properties)
				? (tool.inputSchema.properties as JsonRecord)
				: null;
		if (properties && "session" in properties) {
			prepared.session = sessionId;
		}

		const driver = await this.ensureDriver();
		const result = await driver.callTool(
			name,
			JSON.stringify(prepared),
			signal ? { signal } : undefined,
		);
		return serializeResult(result);
	}

	private async ensureDriver(): Promise<CuaDriverInstance> {
		if (this.driver) return this.driver;
		if (this.starting) return this.starting;
		this.starting = Promise.resolve().then(() => {
			const driver = CuaDriver.create(undefined);
			this.driver = driver;
			return driver;
		});
		try {
			return await this.starting;
		} finally {
			this.starting = null;
		}
	}
}
