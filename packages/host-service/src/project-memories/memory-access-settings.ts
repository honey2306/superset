import { randomUUID } from "node:crypto";
import {
	chmodSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";

const MEMORY_ACCESS_DIRECTORY = "memory-access";

export const memoryAccessSettingsSchema = z
	.object({
		mode: z.enum(["off", "selected", "all"]),
		projectIds: z.array(z.string().uuid()).max(500),
	})
	.strict()
	.superRefine((value, context) => {
		if (new Set(value.projectIds).size !== value.projectIds.length) {
			context.addIssue({
				code: "custom",
				path: ["projectIds"],
				message: "Project IDs must be unique.",
			});
		}
	});

export type MemoryAccessSettings = z.infer<typeof memoryAccessSettingsSchema>;
export type MemoryAccessSettingsInput = z.input<
	typeof memoryAccessSettingsSchema
>;

const DEFAULT_MEMORY_ACCESS_SETTINGS: MemoryAccessSettings = {
	mode: "off",
	projectIds: [],
};

export function memoryAccessSettingsConfigPath(
	organizationId: string,
	environment: NodeJS.ProcessEnv = process.env,
): string {
	const home =
		environment.SUPERSET_HOME_DIR?.trim() || path.join(homedir(), ".superset");
	return path.join(
		home,
		MEMORY_ACCESS_DIRECTORY,
		`${encodeURIComponent(organizationId)}.json`,
	);
}

export function readMemoryAccessSettings(
	organizationId: string,
	configPath = memoryAccessSettingsConfigPath(organizationId),
): MemoryAccessSettings {
	let raw: unknown;
	try {
		raw = JSON.parse(readFileSync(configPath, "utf8"));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return { ...DEFAULT_MEMORY_ACCESS_SETTINGS };
		}
		throw new Error(
			`Could not read memory access settings at ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	const parsed = memoryAccessSettingsSchema.safeParse(raw);
	if (!parsed.success) {
		throw new Error(
			`Invalid memory access settings at ${configPath}: ${parsed.error.issues[0]?.message ?? "invalid configuration"}`,
		);
	}
	return parsed.data;
}

export function writeMemoryAccessSettings(
	organizationId: string,
	input: MemoryAccessSettingsInput,
	configPath = memoryAccessSettingsConfigPath(organizationId),
): MemoryAccessSettings {
	const settings = memoryAccessSettingsSchema.parse(input);
	const directory = path.dirname(configPath);
	mkdirSync(directory, { recursive: true, mode: 0o700 });
	const temporaryPath = `${configPath}.${randomUUID()}.tmp`;
	try {
		writeFileSync(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, {
			encoding: "utf8",
			mode: 0o600,
		});
		renameSync(temporaryPath, configPath);
		chmodSync(configPath, 0o600);
	} finally {
		rmSync(temporaryPath, { force: true });
	}
	return settings;
}
