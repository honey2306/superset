/**
 * PoC validation: confirm @superset/panes renders inside the v1 workspace
 * shell when V2_PANES_IN_V1 is locally overridden.
 *
 *   ./node_modules/.bin/turbo run dev --filter=@superset/api --filter=@superset/desktop
 *   bun run apps/desktop/scripts/cdp-poc-v2-panes.ts
 *
 * Flow: sign in (local dev creds) -> create a workspace -> navigate into it
 * -> set localStorage override -> reload -> assert the panes <Workspace>
 * mount is present and the v1 mosaic is not. Exits 0 PASS / 1 FAIL.
 * Follows AGENTS.md CDP rules (Runtime.evaluate, not Network sniffing).
 */

const PORT = process.env.RENDERER_REMOTE_DEBUG_PORT ?? "19325";
const VITE_PORT = process.env.DESKTOP_VITE_PORT ?? "3025";
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3031";

interface CdpTarget {
	type: string;
	url: string;
	webSocketDebuggerUrl?: string;
}

async function findRendererTarget(): Promise<CdpTarget> {
	const res = await fetch(`http://localhost:${PORT}/json`);
	const targets = (await res.json()) as CdpTarget[];
	const pages = targets.filter(
		(t) =>
			t.type === "page" &&
			t.webSocketDebuggerUrl &&
			t.url.includes(`localhost:${VITE_PORT}`),
	);
	const page = pages[0];
	if (!page?.webSocketDebuggerUrl) {
		throw new Error(
			`No renderer on :${PORT} using vite ${VITE_PORT}. Targets: ${targets.map((t) => t.url).join(", ")}`,
		);
	}
	return page;
}

function cdpEval(
	ws: WebSocket,
	expression: string,
	awaitPromise = true,
): Promise<any> {
	return new Promise((resolve, reject) => {
		const reqId = Math.floor(Math.random() * 1e6) + 1;
		const onMsg = (ev: MessageEvent) => {
			try {
				const msg = JSON.parse(ev.data as string);
				if (msg.id === reqId) {
					ws.removeEventListener("message", onMsg);
					if (msg.error) reject(new Error(JSON.stringify(msg.error)));
					else resolve(msg.result?.result?.value); // returnByValue: value is the parsed result
				}
			} catch {
				/* ignore */
			}
		};
		ws.addEventListener("message", onMsg);
		ws.send(
			JSON.stringify({
				id: reqId,
				method: "Runtime.evaluate",
				params: { expression, returnByValue: true, awaitPromise },
			}),
		);
	});
}

// Run inside the renderer. Sign in with local dev creds, then find a
// workspace (create needs a real repo path, so we rely on an existing one
// from the local seed). CDP Runtime.evaluate cannot resolve bare package
// specifiers, so the public dev creds are inlined here (they are non-secret
// local-dev constants from packages/shared/src/dev-credentials.ts).
const SETUP = `(async () => {
  const API = ${JSON.stringify(API)};
  const si = await fetch(API + "/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email: "admin@local.test", password: "supersetdev" }),
  });
  if (!si.ok) return { ok: false, where: "sign-in", status: si.status };
  const s = await fetch(API + "/api/auth/get-session", { credentials: "include" })
    .then(r => r.json()).catch(e => ({ err: String(e) }));
  const org = s && s.session && s.session.activeOrganizationId;
  if (!org) return { ok: false, where: "session", hasSession: !!s?.session };
  const listInput = encodeURIComponent(JSON.stringify({ "0": { json: { organizationId: org } } }));
  const lr = await fetch(API + "/api/trpc/workspaces.list?batch=1&input=" + listInput, { credentials: "include" });
  const lb = await lr.json();
  const list = lb?.[0]?.result?.data?.json;
  if (Array.isArray(list) && list.length > 0) {
    return { ok: true, workspaceId: list[0].id, org, hadExisting: true };
  }
  return { ok: false, where: "no-workspace", org, listLen: Array.isArray(list) ? list.length : "non-array" };
})()`;

const SET_FLAG = `localStorage.setItem("superset:debug:v2-panes-in-v1", "1"); "set"`;

const CHECK_RENDER = `(() => {
  const buttons = Array.from(document.querySelectorAll('button'));
  const pocButton = buttons.find(b => /\\+ terminal \\(PoC\\)/.test(b.textContent || ''));
  const hasMosaic = !!document.querySelector('.mosaic, .mosaic-window, [class*="mosaic"]');
  return {
    pocMounted: !!pocButton,
    mosaicPresent: hasMosaic,
    url: location.href,
    bodyText: (document.body.innerText || '').slice(0, 150),
  };
})()`;

async function main() {
	const target = await findRendererTarget();
	console.log(`[poc] attached: ${target.url}`);
	const ws = new WebSocket(target.webSocketDebuggerUrl!);
	await new Promise((res, rej) => {
		ws.addEventListener("open", res, { once: true });
		ws.addEventListener("error", rej, { once: true });
	});

	// 1. Sign in + find/create workspace.
	const v1 = await cdpEval(ws, SETUP);
	console.log("[poc] setup:", v1);
	if (!v1?.ok) {
		console.log("FAIL: could not get a workspace:", v1);
		ws.close();
		process.exit(1);
	}

	// 2. Navigate to the workspace route (v1 shell).
	await cdpEval(
		ws,
		`location.hash = "#/workspaces/" + ${JSON.stringify(v1.workspaceId)}; "navigated"`,
		false,
	);
	await new Promise((r) => setTimeout(r, 3000));

	// 3. Set the PoC flag override.
	await cdpEval(ws, SET_FLAG, false);

	// 4. Reload so the flag check (mount-time) re-evaluates and the panes
	//    engine mounts instead of mosaic.
	await cdpEval(ws, `location.reload(); "reloading"`, false);
	await new Promise((r) => setTimeout(r, 5000));

	// 5. Re-attach (reload closed the page context) and check render.
	const v2 = await cdpEval(ws, CHECK_RENDER, false);
	console.log("[poc] render:", v2);

	const passed = v2?.pocMounted === true && v2?.mosaicPresent === false;
	console.log(
		passed
			? "PASS: panes engine mounted in v1 shell"
			: "FAIL: panes not mounted (mosaic or neither)",
	);
	ws.close();
	process.exit(passed ? 0 : 1);
}

main().catch((e) => {
	console.error("[poc] error:", e);
	process.exit(1);
});
