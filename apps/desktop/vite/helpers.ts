import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, normalize, resolve } from "node:path";
import type { Plugin } from "vite";

import { main, resources } from "../package.json";

export const devPath = normalize(dirname(main)).split(/\/|\\/g)[0];

function copyDir({ src, dest }: { src: string; dest: string }): void {
	if (!existsSync(src)) return;

	if (existsSync(dest)) {
		rmSync(dest, { recursive: true });
	}
	mkdirSync(dest, { recursive: true });
	cpSync(src, dest, { recursive: true });
}

export function defineEnv(
	value: string | undefined,
	fallback?: string,
): string {
	return JSON.stringify(value || fallback);
}

export const RESOURCES_TO_COPY = [
	{
		src: resolve(__dirname, "..", resources, "sounds"),
		dest: resolve(__dirname, "..", devPath, "resources/sounds"),
	},
	{
		src: resolve(__dirname, "..", resources, "tray"),
		dest: resolve(__dirname, "..", devPath, "resources/tray"),
	},
	{
		src: resolve(__dirname, "../../../packages/local-db/drizzle"),
		dest: resolve(__dirname, "..", devPath, "resources/migrations"),
	},
	{
		src: resolve(__dirname, "../../../packages/host-service/drizzle"),
		dest: resolve(__dirname, "..", devPath, "resources/host-migrations"),
	},
	{
		src: resolve(__dirname, "../../../packages/host-service/public/web"),
		dest: resolve(__dirname, "..", devPath, "resources/web"),
	},
	{
		src: resolve(__dirname, "../src/main/lib/agent-setup/templates"),
		dest: resolve(__dirname, "..", devPath, "main/templates"),
	},
	{
		src: resolve(
			__dirname,
			"../../../packages/host-service/src/runtime/acp-sessions/sidecar",
		),
		dest: resolve(__dirname, "..", devPath, "main/sidecar"),
	},
];

/**
 * Copies resources to dist/ for preview/production mode.
 * In preview mode, __dirname resolves relative to dist/main, so resources
 * need to be copied there for the main process to access them.
 */
export function copyResourcesPlugin(): Plugin {
	const copyAllResources = () => {
		for (const resource of RESOURCES_TO_COPY) copyDir(resource);
	};
	return {
		name: "copy-resources",
		buildStart() {
			// Electron-vite watch does not run writeBundle again when only a copied
			// non-JS sidecar changes. Materialize it before every watch build so the
			// daemon never points at a source-only Python file.
			for (const resource of RESOURCES_TO_COPY) {
				if (!resource.dest.endsWith("main/sidecar")) continue;
				copyDir(resource);
			}
		},
		writeBundle: copyAllResources,
	};
}
