import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

/**
 * Phone-facing web frontend. Deployed under `/app/*` on the host-service
 * (port 4879) which serves the compiled bundle from
 * `packages/host-service/public/web`.
 *
 * Dev workflow: run this Vite dev server on a separate port and let it
 * proxy `/trpc` + `/acp-sessions` + `/events` back to a running
 * host-service. The bundle is not itself part of host-service in dev.
 */
export default defineConfig(({ mode }) => {
	const isAutoMateBuild = mode === "automate";
	const automateEnv = loadEnv(mode, process.cwd(), "VITE_");
	const legacyAutomateRelayUrl = automateEnv.VITE_AUTOMATE_RELAY_URL;
	if (isAutoMateBuild) {
		if (legacyAutomateRelayUrl) {
			throw new Error(
				"VITE_AUTOMATE_RELAY_URL is not allowed in the AutoMate browser build; task 16740 owns the credentialed relay call",
			);
		}
	}

	return {
		base: isAutoMateBuild ? "/webapp/16740/" : "/app/",
		resolve: {
			alias: {
				"~": fileURLToPath(new URL("./src", import.meta.url)),
			},
		},
		plugins: [react(), tailwindcss()],
		server: {
			host: true,
			port: 5177,
			proxy: {
				"/trpc": {
					target: "http://localhost:4879",
					changeOrigin: true,
				},
				"/acp-sessions": {
					target: "http://localhost:4879",
					changeOrigin: true,
					ws: true,
				},
				"/events": {
					target: "http://localhost:4879",
					changeOrigin: true,
					ws: true,
				},
			},
		},
		build: {
			outDir: isAutoMateBuild
				? "dist-automate"
				: "../../packages/host-service/public/web",
			emptyOutDir: true,
			sourcemap: false,
		},
	};
});
