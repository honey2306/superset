import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Phone-facing web frontend. Deployed under `/app/*` on the host-service
 * (port 4879) which serves the compiled bundle from
 * `packages/host-service/public/web`.
 *
 * Dev workflow: run this Vite dev server on a separate port and let it
 * proxy `/trpc` + `/acp-sessions` + `/events` back to a running
 * host-service. The bundle is not itself part of host-service in dev.
 */
export default defineConfig({
	base: "/app/",
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
		outDir: "../../packages/host-service/public/web",
		emptyOutDir: true,
		sourcemap: false,
	},
});
