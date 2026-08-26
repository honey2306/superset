import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		HOST_DB_PATH: z.string().min(1),
		HOST_MIGRATIONS_FOLDER: z.string().min(1),
		HOST_SERVICE_SECRET: z.string().min(1),
		HOST_SERVICE_PORT: z.coerce.number().int().positive(),
		HOST_SERVICE_HOSTNAME: z.string().min(1).default("127.0.0.1"),
		SUPERSET_WEB_APP_DIR: z.string().min(1).optional(),
		ORGANIZATION_ID: z.string().min(1),
		DESKTOP_VITE_PORT: z.coerce.number().int().positive(),
		AUTOMATE_RELAY_URL: z.string().url().optional(),
		/** Opaque namespace used to isolate non-stable desktop builds/workspaces. */
		AUTOMATE_RELAY_MAILBOX_NAMESPACE: z.string().min(1).optional(),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});
