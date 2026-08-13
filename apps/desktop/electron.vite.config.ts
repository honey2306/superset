import { createRequire } from "node:module";
import { resolve } from "node:path";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import reactPlugin from "@vitejs/plugin-react";
import { codeInspectorPlugin } from "code-inspector-plugin";
import { config } from "dotenv";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import injectProcessEnvPlugin from "rollup-plugin-inject-process-env";
import tsconfigPathsPlugin from "vite-tsconfig-paths";
import { patchPiAcpBundle } from "../../packages/host-service/src/runtime/acp-sessions/pi-acp-bundle";
import { dependencies, resources, version } from "./package.json";
import { mainExternalizedDependencies } from "./runtime-dependencies";
import { copyResourcesPlugin, defineEnv, devPath } from "./vite/helpers";

// override: true ensures .env values take precedence over inherited env vars
config({ path: resolve(__dirname, "../../.env"), override: true, quiet: true });

const DEV_SERVER_PORT = Number(process.env.DESKTOP_VITE_PORT);
const moduleRequire = createRequire(import.meta.url);
const piAcpEntry = moduleRequire.resolve("pi-acp");

function piAcpBridgePlugin() {
	return {
		name: "pi-acp-bridge",
		transform(code: string, id: string) {
			if (id !== piAcpEntry) return null;
			// pi-acp's terminal-login branch uses top-level await for a dynamic
			// built-in import. Electron's main bundle is CJS, so make that import
			// static before Rollup renders this standalone subprocess entry.
			return patchPiAcpBundle(
				code
					.replace(
						"#!/usr/bin/env node",
						'#!/usr/bin/env node\nimport { spawnSync as piAcpSpawnSync } from "node:child_process";',
					)
					.replace(
						'const { spawnSync: spawnSync2 } = await import("child_process");',
						"const spawnSync2 = piAcpSpawnSync;",
					),
			);
		},
	};
}

// Validate required env vars at build time using the Zod schema (single source of truth)
await import("./src/main/env.main");

const tsconfigPaths = tsconfigPathsPlugin({
	projects: [resolve("tsconfig.json")],
});

const workspaceDependencies = Object.keys(dependencies).filter((dependency) =>
	dependency.startsWith("@superset/"),
);

// Sentry plugin for uploading sourcemaps (only in CI with auth token)
const sentryPlugin = process.env.SENTRY_AUTH_TOKEN
	? sentryVitePlugin({
			org: "superset-sh",
			project: "desktop",
			authToken: process.env.SENTRY_AUTH_TOKEN,
			release: { name: version },
		})
	: null;

export default defineConfig({
	main: {
		plugins: [tsconfigPaths, copyResourcesPlugin(), piAcpBridgePlugin()],

		define: {
			"process.env.NODE_ENV": defineEnv(process.env.NODE_ENV, "production"),
			"process.env.SKIP_ENV_VALIDATION": defineEnv(
				process.env.SKIP_ENV_VALIDATION,
				"",
			),
			"process.env.NEXT_PUBLIC_WEB_URL": defineEnv(
				process.env.NEXT_PUBLIC_WEB_URL,
				"https://app.superset.sh",
			),
			"process.env.NEXT_PUBLIC_MARKETING_URL": defineEnv(
				process.env.NEXT_PUBLIC_MARKETING_URL,
				"https://superset.sh",
			),
			"process.env.NEXT_PUBLIC_DOCS_URL": defineEnv(
				process.env.NEXT_PUBLIC_DOCS_URL,
				"https://docs.superset.sh",
			),
			"process.env.SENTRY_DSN_DESKTOP": defineEnv(
				process.env.SENTRY_DSN_DESKTOP,
			),
			// Must match renderer for analytics in main process
			"process.env.NEXT_PUBLIC_POSTHOG_KEY": defineEnv(
				process.env.NEXT_PUBLIC_POSTHOG_KEY,
			),
			"process.env.NEXT_PUBLIC_POSTHOG_HOST": defineEnv(
				process.env.NEXT_PUBLIC_POSTHOG_HOST,
			),
			"process.env.DESKTOP_VITE_PORT": defineEnv(process.env.DESKTOP_VITE_PORT),
			"process.env.DESKTOP_NOTIFICATIONS_PORT": defineEnv(
				process.env.DESKTOP_NOTIFICATIONS_PORT,
			),
			"process.env.SUPERSET_WORKSPACE_NAME": defineEnv(
				process.env.SUPERSET_WORKSPACE_NAME,
			),
			"process.env.SUPERSET_BUILD_CHANNEL": defineEnv(
				process.env.SUPERSET_BUILD_CHANNEL,
				"stable",
			),
		},

		build: {
			sourcemap: true,
			rollupOptions: {
				input: {
					index: resolve("src/main/index.ts"),
					// Workspace service - local HTTP/tRPC server per org
					"host-service": resolve("src/main/host-service/index.ts"),
					// pty-daemon - long-lived per-org Unix-socket server that owns PTYs.
					// Spawned by PtyDaemonCoordinator; survives host-service restarts.
					"pty-daemon": resolve("src/main/pty-daemon/index.ts"),
					// host-service worker thread — emitted side-by-side with
					// host-service.js so the pool's script resolution finds it.
					"host-worker": resolve("src/main/host-worker/index.ts"),
					// Detached ACP owner — survives host-service/Desktop restarts while
					// retaining active turns and pending permission callbacks.
					"acp-daemon": resolve(
						"../../packages/host-service/src/runtime/acp-sessions/daemon-entry.ts",
					),
					// ACP protocol bridges are subprocesses, so emit standalone entries
					// beside acp-daemon.js where AcpSessionManager resolves them.
					"codex-app-server-acp": resolve(
						"../../packages/host-service/src/runtime/acp-sessions/codex-app-server-acp.ts",
					),
					"pi-acp": piAcpEntry,
				},
				output: {
					dir: resolve(devPath, "main"),
				},
				external: ["electron", ...mainExternalizedDependencies],
				plugins: [sentryPlugin].filter(Boolean),
			},
		},
		resolve: {
			alias: {
				// @xterm/headless 6.0.0 has a packaging bug: `module` field points to
				// non-existent `lib/xterm.mjs`. Force Vite to use the CJS entry instead.
				"@xterm/headless": "@xterm/headless/lib-headless/xterm-headless.js",
			},
		},
	},

	preload: {
		plugins: [
			tsconfigPaths,
			externalizeDepsPlugin({
				exclude: [
					"trpc-electron",
					"@sentry/electron",
					...workspaceDependencies,
				],
			}),
		],

		define: {
			"process.env.NODE_ENV": defineEnv(process.env.NODE_ENV, "production"),
			"process.env.SKIP_ENV_VALIDATION": defineEnv(
				process.env.SKIP_ENV_VALIDATION,
				"",
			),
			__APP_VERSION__: defineEnv(version),
		},

		build: {
			outDir: resolve(devPath, "preload"),
			rollupOptions: {
				input: {
					index: resolve("src/preload/index.ts"),
				},
			},
		},
	},

	renderer: {
		define: {
			"process.env.NODE_ENV": defineEnv(process.env.NODE_ENV),
			"process.env.SKIP_ENV_VALIDATION": defineEnv(
				process.env.SKIP_ENV_VALIDATION,
				"",
			),
			"process.platform": defineEnv(process.platform),
			"process.env.NEXT_PUBLIC_WEB_URL": defineEnv(
				process.env.NEXT_PUBLIC_WEB_URL,
				"https://app.superset.sh",
			),
			"process.env.NEXT_PUBLIC_MARKETING_URL": defineEnv(
				process.env.NEXT_PUBLIC_MARKETING_URL,
				"https://superset.sh",
			),
			"process.env.NEXT_PUBLIC_DOCS_URL": defineEnv(
				process.env.NEXT_PUBLIC_DOCS_URL,
				"https://docs.superset.sh",
			),
			"import.meta.env.DEV_SERVER_PORT": defineEnv(String(DEV_SERVER_PORT)),
			"import.meta.env.NEXT_PUBLIC_POSTHOG_KEY": defineEnv(
				process.env.NEXT_PUBLIC_POSTHOG_KEY,
			),
			"import.meta.env.NEXT_PUBLIC_POSTHOG_HOST": defineEnv(
				process.env.NEXT_PUBLIC_POSTHOG_HOST,
			),
			"import.meta.env.SENTRY_DSN_DESKTOP": defineEnv(
				process.env.SENTRY_DSN_DESKTOP,
			),
			"process.env.DESKTOP_VITE_PORT": defineEnv(process.env.DESKTOP_VITE_PORT),
			"process.env.DESKTOP_NOTIFICATIONS_PORT": defineEnv(
				process.env.DESKTOP_NOTIFICATIONS_PORT,
			),
			"process.env.SUPERSET_WORKSPACE_NAME": defineEnv(
				process.env.SUPERSET_WORKSPACE_NAME,
			),
			"process.env.SUPERSET_BUILD_CHANNEL": defineEnv(
				process.env.SUPERSET_BUILD_CHANNEL,
				"stable",
			),
		},

		server: {
			port: DEV_SERVER_PORT,
			strictPort: false,
		},

		plugins: [
			tanstackRouter({
				target: "react",
				routesDirectory: resolve("src/renderer/routes"),
				generatedRouteTree: resolve("src/renderer/routeTree.gen.ts"),
				indexToken: "page",
				routeToken: "layout",
				autoCodeSplitting: true,
				routeFileIgnorePattern:
					"^(?!(__root|page|layout)\\.tsx$).*\\.(tsx?|jsx?)$",
			}),
			tsconfigPaths,
			tailwindcss(),
			codeInspectorPlugin({
				bundler: "vite",
				hotKeys: ["altKey"],
				hideConsole: true,
				port: Number(process.env.CODE_INSPECTOR_PORT) || undefined,
			}),
			reactPlugin(),
		],

		worker: {
			format: "es",
		},

		publicDir: resolve(resources, "public"),

		build: {
			sourcemap: true,
			outDir: resolve(devPath, "renderer"),

			rollupOptions: {
				plugins: [
					injectProcessEnvPlugin({
						NODE_ENV: "production",
						platform: process.platform,
					}),
					sentryPlugin,
				].filter(Boolean),

				input: {
					index: resolve("src/renderer/index.html"),
				},
			},
		},
	},
});
