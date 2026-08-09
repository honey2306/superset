import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Hono } from "hono";

const _STATIC_ASSET_EXTS = new Set([
	".js",
	".mjs",
	".cjs",
	".css",
	".map",
	".ico",
	".png",
	".jpg",
	".jpeg",
	".gif",
	".svg",
	".webp",
	".avif",
	".woff",
	".woff2",
	".ttf",
	".otf",
	".json",
	".txt",
	".wasm",
]);

function getExtension(pathname: string): string {
	const dot = pathname.lastIndexOf(".");
	if (dot < 0) return "";
	const slash = pathname.lastIndexOf("/");
	if (slash > dot) return "";
	return pathname.slice(dot).toLowerCase();
}

/**
 * Mount the `apps/web` production bundle at `/app/*`. Assets are served
 * from `distDir`; anything that looks like a client-side route (no known
 * asset extension) falls back to `index.html` so React Router can pick it
 * up on a hard reload.
 *
 * `distDir` is expected to be the Vite `build.outDir` — see the
 * `apps/web/vite.config.ts` which writes into `packages/host-service/public/web`.
 * If the directory is missing (e.g. a dev build that never ran `bun run
 * build --filter @superset/web`), the routes short-circuit to a 404 with
 * a hint instead of throwing at startup.
 */
export function registerStaticAppRoute(options: {
	app: Hono;
	distDir: string;
}): void {
	const { app, distDir } = options;

	const ready =
		existsSync(distDir) &&
		statSync(distDir, { throwIfNoEntry: false })?.isDirectory();

	if (!ready) {
		app.get("/app/*", (c) => {
			return c.text(
				`Superset web bundle not built. Expected ${distDir}. Run 'bun --filter @superset/web build'.`,
				503,
			);
		});
		return;
	}

	const indexHtmlPath = join(distDir, "index.html");

	app.get(
		"/app/*",
		serveStatic({
			root: distDir,
			rewriteRequestPath: (p) => {
				const stripped = p.replace(/^\/app\/?/, "/");
				return stripped === "/" ? "/index.html" : stripped;
			},
			onFound: (_path, c) => {
				const ext = getExtension(new URL(c.req.url).pathname);
				if (ext && ext !== ".html") {
					c.header("Cache-Control", "public, max-age=31536000, immutable");
				} else {
					c.header("Cache-Control", "no-cache");
				}
			},
		}),
		async (c) => {
			// serveStatic fell through — treat as a client-side route and
			// respond with the SPA shell so React Router owns it.
			const url = new URL(c.req.url);
			const ext = getExtension(url.pathname);
			if (ext) return c.notFound();
			try {
				const html = await readFile(indexHtmlPath, "utf8");
				c.header("Content-Type", "text/html; charset=utf-8");
				c.header("Cache-Control", "no-cache");
				return c.body(html);
			} catch {
				return c.notFound();
			}
		},
	);

	// Root convenience: `/app` (no trailing slash) → redirect to `/app/`.
	app.get("/app", (c) => c.redirect("/app/", 302));
}
