import { runChatTaskSmoke } from "./chat-task-actions";
import { runSkillsSmoke } from "./skills-actions";
import {
	verifyTaskEmptyLayout,
	verifyTaskPopulatedLayout,
} from "./task-layout-actions";
/** Real Electron DOM/input → real Task UI → isolated HTTP Host/ACP/Pi.
 * Only platform discovery and model inference are test-controlled. This is not
 * the installed app bootstrap and never restarts or migrates live user data. */
import "../../../../packages/host-service/test/setup-env";
import { execFileSync, spawn } from "node:child_process";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer as createNetServer } from "node:net";
import { join, resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createServer as createViteServer } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { createTaskTransportFixture } from "../../../../packages/host-service/src/tasks/task-transport-fixture";

const desktop = resolve(import.meta.dir, "../.."),
	repo = resolve(desktop, "../..");
const runDir = join(desktop, ".cache", `task-ui-smoke-${Date.now()}`);
mkdirSync(runDir, { recursive: true });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function freePort() {
	const server = createNetServer();
	await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
	const port = (server.address() as { port: number }).port;
	await new Promise<void>((done) => server.close(() => done()));
	return port;
}
const rendererPort = await freePort(),
	cdpPort = await freePort();
const rendererUrl = `http://127.0.0.1:${rendererPort}`;
const deliverySmoke = process.env.SUPERSET_TASK_SMOKE_DELIVERY === "1";
const skillsSmoke = process.env.SUPERSET_SKILLS_SMOKE === "1";
const chatSmoke = process.env.SUPERSET_TASK_CHAT_SMOKE === "1";
const chatSessionId = crypto.randomUUID();
// Explicit isolated filesystem target; never write/read the user's real global skills.
const previousGlobalSkillsDir = process.env.SUPERSET_GLOBAL_SKILLS_DIR;
if (skillsSmoke)
	process.env.SUPERSET_GLOBAL_SKILLS_DIR = join(runDir, "global-skills");
const fixture = await createTaskTransportFixture({
	conversationMode: chatSmoke,
	stopFirstTaskTurn: chatSmoke,
	allowedOrigins: [rendererUrl],
	delayMs: 800,
});
let child: ReturnType<typeof spawn> | undefined;
let vite: Awaited<ReturnType<typeof createViteServer>> | undefined;
let socket: WebSocket | undefined;
const errors: string[] = [],
	networkFailures: string[] = [];
const pending = new Map<
	number,
	{
		resolve: (result: unknown) => void;
		reject: (error: Error) => void;
		timer: ReturnType<typeof setTimeout>;
	}
>();
let nextId = 0;
function send<T = unknown>(
	method: string,
	params: Record<string, unknown> = {},
): Promise<T> {
	return new Promise((resolve, reject) => {
		const id = ++nextId;
		const timer = setTimeout(
			() => {
				pending.delete(id);
				reject(new Error(`CDP timeout: ${method}`));
			},
			method === "Page.captureScreenshot" ? 45000 : 15000,
		);
		pending.set(id, {
			resolve: resolve as (result: unknown) => void,
			reject,
			timer,
		});
		socket?.send(JSON.stringify({ id, method, params }));
	});
}
async function evaluate<T>(expression: string): Promise<T> {
	const result = await send<{
		result: { value: T };
		exceptionDetails?: unknown;
	}>("Runtime.evaluate", {
		expression,
		returnByValue: true,
		awaitPromise: true,
	});
	if (result.exceptionDetails)
		throw new Error(JSON.stringify(result.exceptionDetails));
	return result.result.value;
}
async function until<T>(
	fn: () => Promise<T>,
	ready: (value: T) => boolean,
	label: string,
	timeout = 30000,
) {
	const deadline = Date.now() + timeout;
	let last: T;
	for (;;) {
		last = await fn();
		if (ready(last)) return last;
		if (Date.now() > deadline)
			throw new Error(`${label}: ${JSON.stringify(last)}`);
		await sleep(100);
	}
}
const visibleElements = (selector: string) =>
	`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0})`;
async function clickText(text: string, selector = "button") {
	const point = await until(
		() =>
			evaluate<{ x: number; y: number } | null>(
				`(()=>{const e=${visibleElements(selector)}.find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
			),
		(v) => Boolean(v),
		`Missing ${text}`,
	);
	if (!point) throw new Error(text);
	await send("Input.dispatchMouseEvent", {
		type: "mousePressed",
		button: "left",
		clickCount: 1,
		...point,
	});
	await send("Input.dispatchMouseEvent", {
		type: "mouseReleased",
		button: "left",
		clickCount: 1,
		...point,
	});
}
async function fill(selector: string, text: string) {
	const point = await evaluate<{ x: number; y: number }>(
		`(()=>{const e=${visibleElements(selector)}[0];if(!e)throw new Error('Missing field');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`,
	);
	await send("Input.dispatchMouseEvent", {
		type: "mousePressed",
		button: "left",
		clickCount: 1,
		...point,
	});
	await send("Input.dispatchMouseEvent", {
		type: "mouseReleased",
		button: "left",
		clickCount: 1,
		...point,
	});
	await send("Input.dispatchKeyEvent", {
		type: "keyDown",
		key: "a",
		code: "KeyA",
		modifiers: 4,
		windowsVirtualKeyCode: 65,
		commands: ["selectAll"],
	});
	await send("Input.dispatchKeyEvent", {
		type: "keyUp",
		key: "a",
		code: "KeyA",
		modifiers: 4,
	});
	await send("Input.insertText", { text });
}
async function screenshot(name: string) {
	if (chatSmoke) await send("Page.bringToFront");
	const { data } = await send<{ data: string }>("Page.captureScreenshot", {
		format: "png",
		captureBeyondViewport: false,
		...(chatSmoke ? { fromSurface: false } : {}),
	});
	writeFileSync(join(runDir, name), Buffer.from(data, "base64"));
}
try {
	writeFileSync(
		join(fixture.cwd, "package.json"),
		JSON.stringify({
			name: "isolated-task-ui",
			scripts: { test: 'test "$(cat value.txt)" = right' },
		}),
	);
	if (deliverySmoke) {
		const git = (...args: string[]) =>
			execFileSync("git", args, { cwd: fixture.cwd, encoding: "utf8" }).trim();
		git("config", "user.name", "Isolated Task UI");
		git("config", "user.email", "task-ui@example.invalid");
		git("config", "commit.gpgsign", "false");
		git("add", "package.json");
		git("commit", "-qm", "test: seed project scripts");
		const remote = join(fixture.directory, "ui-remote.git"),
			branch = git("branch", "--show-current");
		git("init", "--bare", "-q", remote);
		git("remote", "add", "delivery", remote);
		git("push", "-q", "delivery", `HEAD:refs/heads/${branch}`);
	}
	// Seed project defaults through the real API, then exercise their actual editor.
	await fixture.api.tasks.saveProfile.mutate({
		projectId: fixture.projectId,
		expectedRevision: 0,
		config: {
			instructions: "Keep unrelated files unchanged",
			completion: "checks",
			checks: [
				{
					id: "value",
					name: "Value acceptance",
					command: 'test "$(cat value.txt)" = right',
					paths: ["value.txt"],
					timeoutMs: 120000,
				},
			],
		},
	});
	if (chatSmoke) {
		await fixture.api.acpSessions.create.mutate({
			sessionId: chatSessionId,
			workspaceId: fixture.workspaceId,
			harness: "pi-acp",
			model: "task-local/task-model",
		});
	}
	if (skillsSmoke) {
		const dest = join(fixture.cwd, ".agents/skills/verify-behavior-change");
		mkdirSync(join(fixture.cwd, ".agents/skills"), { recursive: true });
		cpSync(join(repo, ".agents/skills/verify-behavior-change"), dest, {
			recursive: true,
		});
	}
	writeFileSync(
		join(runDir, "platform.ts"),
		`import {useQuery} from '@tanstack/react-query';import {getHostServiceClientByUrl} from 'renderer/lib/host-service-client';export function useHostUrl(){return ${JSON.stringify(fixture.hostUrl)}};export function useLocalHostService(){return {activeHostUrl:${JSON.stringify(fixture.hostUrl)}}};export function useCatalogProjects(){return {projects:[${JSON.stringify({ id: fixture.projectId, name: "Isolated Task Verification", repoPath: fixture.cwd, kind: "normal" })}],isReady:true}};export function useCatalogWorkspaces(){return {workspaces:[${JSON.stringify({ id: fixture.workspaceId, projectId: fixture.projectId, branch: "main", name: "Current directory", type: "main", worktreePath: fixture.cwd })}],isReady:true}};`,
	);
	writeFileSync(
		join(runDir, "index.html"),
		'<html><head><title>Isolated Task Runtime Verification</title><script>window.__smokeErrors=[];window.addEventListener("error",e=>window.__smokeErrors.push(String(e.message)));window.addEventListener("unhandledrejection",e=>window.__smokeErrors.push(String(e.reason)));</script></head><body><div id="root" style="height:100vh"></div><script type="module" src="/main.tsx"></script></body></html>',
	);
	writeFileSync(
		join(runDir, "main.tsx"),
		`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {TooltipProvider} from '@superset/ui/tooltip';import {I18nProvider} from 'renderer/providers/I18nProvider';import {LOCALE_STORAGE_KEY} from 'renderer/providers/I18nProvider/messages';import {setHostServiceSecret} from 'renderer/lib/host-service-auth';import {AgentTasksPage} from 'renderer/routes/_local/_dashboard/agent-tasks/components/AgentTasksPage/AgentTasksPage';import 'renderer/globals.css';localStorage.setItem(LOCALE_STORAGE_KEY,'en-US');setHostServiceSecret(${JSON.stringify(fixture.hostUrl)},${JSON.stringify(fixture.psk)});const query=new QueryClient({defaultOptions:{queries:{retry:false}}});function App(){const [selected,setSelected]=useState<string>();return <QueryClientProvider client={query}><I18nProvider><TooltipProvider><div data-testid="dashboard-outlet-fixture" className="flex h-screen min-w-0 w-full"><AgentTasksPage selectedId={selected} onSelect={setSelected}/></div></TooltipProvider></I18nProvider></QueryClientProvider>}createRoot(document.getElementById('root')!).render(<App/>);`,
	);
	if (skillsSmoke)
		writeFileSync(
			join(runDir, "main.tsx"),
			`
import React from 'react';import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {createRootRoute,createRoute,createRouter,createHashHistory,RouterProvider,Outlet} from '@tanstack/react-router';
import {TooltipProvider} from '@superset/ui/tooltip';import {I18nProvider} from 'renderer/providers/I18nProvider';
import {LOCALE_STORAGE_KEY} from 'renderer/providers/I18nProvider/messages';
import {setHostServiceSecret} from 'renderer/lib/host-service-auth';
import {AgentContextTabs} from 'renderer/routes/_local/_dashboard/components/AgentContextTabs';
import {GlobalSkillsPage} from 'renderer/routes/_local/_dashboard/skills/components/GlobalSkillsPage';
import 'renderer/globals.css';localStorage.setItem(LOCALE_STORAGE_KEY,'en-US');
setHostServiceSecret(${JSON.stringify(fixture.hostUrl)},${JSON.stringify(fixture.psk)});
if(!location.hash)location.hash='/skills';
const root=createRootRoute({component:()=> <div className="flex h-screen flex-col"><AgentContextTabs/><div className="min-h-0 flex-1"><Outlet/></div></div>});
const routes=[createRoute({getParentRoute:()=>root,path:'/skills',component:GlobalSkillsPage}),
createRoute({getParentRoute:()=>root,path:'/memories',component:()=> <div>Memory navigation target — isolated fixture</div>}),
createRoute({getParentRoute:()=>root,path:'/mcp',component:()=> <div>MCP navigation target — isolated fixture</div>})];
const router=createRouter({routeTree:root.addChildren(routes),history:createHashHistory()});
const query=new QueryClient({defaultOptions:{queries:{retry:false}}});
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={query}><I18nProvider><TooltipProvider><RouterProvider router={router}/></TooltipProvider></I18nProvider></QueryClientProvider>);
`,
		);
	if (chatSmoke) {
		writeFileSync(
			join(runDir, "chat-platform.ts"),
			`
export function useProjectDefaultApp(){return {app:undefined,setApp:()=>{}};}
export function useCatalogWorkspace(){return {workspace:${JSON.stringify({ id: fixture.workspaceId, projectId: fixture.projectId, branch: "main", name: "Current directory", type: "main", worktreePath: fixture.cwd })},isReady:true};}
const method=new Proxy(function(){},{get:(_t,name)=>name==='then'?undefined:name==='query'||name==='mutate'?async()=>null:name==='subscribe'?()=>({unsubscribe(){}}):method});
export const electronTrpcClient=method;export const electronReactClient=method;
`,
		);
		writeFileSync(
			join(runDir, "main.tsx"),
			`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {TooltipProvider} from '@superset/ui/tooltip';import {I18nProvider} from 'renderer/providers/I18nProvider';import {LOCALE_STORAGE_KEY} from 'renderer/providers/I18nProvider/messages';
import {setHostServiceSecret} from 'renderer/lib/host-service-auth';
import {AcpSessionPane} from 'renderer/screens/main/components/WorkspaceView/ContentView/components/AcpSessionPane/AcpSessionPane';
import 'renderer/globals.css';
localStorage.setItem(LOCALE_STORAGE_KEY,'en-US');setHostServiceSecret(${JSON.stringify(fixture.hostUrl)},${JSON.stringify(fixture.psk)});
location.hash='/workspace/${fixture.workspaceId}';
const query=new QueryClient({defaultOptions:{queries:{retry:false}}});
function App(){const [visible,setVisible]=useState(true);return <QueryClientProvider client={query}><I18nProvider><TooltipProvider><div className="flex h-screen flex-col"><header className="shrink-0 border-b p-2"><button onClick={()=>setVisible(!visible)}>{visible?'Hide conversation':'Show conversation'}</button></header><main className="min-h-0 flex-1">{visible?<AcpSessionPane paneId="isolated-chat-pane" sessionId=${JSON.stringify(chatSessionId)} hostUrl=${JSON.stringify(fixture.hostUrl)} workspaceId=${JSON.stringify(fixture.workspaceId)} rendererWorkspaceId=${JSON.stringify(fixture.workspaceId)} cwd=${JSON.stringify(fixture.cwd)} agentLabel="Pi" isFocused={true} isVisible={true} onSessionMetadataChange={()=>{}}/>:<p>Conversation view detached; the task is not stopped.</p>}</main></div></TooltipProvider></I18nProvider></QueryClientProvider>}
createRoot(document.getElementById('root')!).render(<App/>);
`,
		);
	}
	vite = await createViteServer({
		configFile: false,
		root: runDir,
		envFile: false,
		plugins: [
			react(),
			tsconfigPaths({ projects: [join(desktop, "tsconfig.json")] }),
			tailwindcss(),
		],
		resolve: {
			alias: [
				...(chatSmoke
					? [
							{
								find: "renderer/lib/trpc-client",
								replacement: join(runDir, "chat-platform.ts"),
							},
							{
								find: "renderer/routes/_local/hooks/useProjectDefaultApp",
								replacement: join(runDir, "chat-platform.ts"),
							},
							{
								find: "renderer/routes/_local/providers/WorkspaceCatalogProvider/selectors",
								replacement: join(runDir, "chat-platform.ts"),
							},
						]
					: []),
				{
					find: "renderer/routes/_local/providers/LocalHostServiceProvider",
					replacement: join(runDir, "platform.ts"),
				},
				{
					find: "renderer/hooks/host-service/useHostTargetUrl",
					replacement: join(runDir, "platform.ts"),
				},
				{
					find: "renderer/routes/_local/providers/WorkspaceCatalogProvider/selectors",
					replacement: join(runDir, "platform.ts"),
				},
				{ find: "renderer", replacement: join(desktop, "src/renderer") },
				{ find: "shared", replacement: join(desktop, "src/shared") },
			],
			dedupe: ["react", "react-dom"],
		},
		server: {
			host: "127.0.0.1",
			port: rendererPort,
			strictPort: true,
			fs: { allow: [repo] },
			hmr: false,
		},
		logLevel: "warn",
	});
	await vite.listen();
	// Electron's package resolution inside an Electron main process is the built-in module.
	writeFileSync(
		join(runDir, "electron.cjs"),
		`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(runDir, "electron-data"))});app.commandLine.appendSwitch('remote-debugging-address','127.0.0.1');app.commandLine.appendSwitch('remote-debugging-port',${JSON.stringify(String(cdpPort))});app.whenReady().then(()=>{const win=new BrowserWindow({width:1320,height:980,show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});if(${JSON.stringify(chatSmoke)}){win.setTitle('Isolated Task Chat Verification');win.once('ready-to-show',()=>win.showInactive());}win.loadURL(${JSON.stringify(rendererUrl)});});app.on('window-all-closed',()=>app.quit());process.on('SIGTERM',()=>app.exit(0));`,
	);
	const electronExecutable = createRequire(import.meta.url)(
		"electron",
	) as string;
	const childEnv = { ...process.env };
	delete childEnv.ELECTRON_RUN_AS_NODE;
	child = spawn(electronExecutable, [join(runDir, "electron.cjs")], {
		cwd: runDir,
		env: childEnv,
		stdio: ["ignore", "pipe", "pipe"],
	});
	let electronLogs = "";
	child.stderr?.on("data", (data) => {
		electronLogs = (electronLogs + String(data)).slice(-16000);
	});
	const target = await until(
		async () => {
			try {
				return (await (
					await fetch(`http://127.0.0.1:${cdpPort}/json/list`)
				).json()) as Array<{
					id: string;
					type: string;
					url: string;
					webSocketDebuggerUrl: string;
				}>;
			} catch {
				return [];
			}
		},
		(targets) =>
			targets.some(
				(target) =>
					target.type === "page" && target.url.startsWith(rendererUrl),
			),
		"Isolated renderer did not start",
		60000,
	);
	const page = target.find(
		(target) => target.type === "page" && target.url.startsWith(rendererUrl),
	);
	if (!page) throw new Error("Wrong CDP target");
	socket = new WebSocket(page.webSocketDebuggerUrl);
	await new Promise<void>((done, reject) => {
		socket?.addEventListener("open", () => done(), { once: true });
		socket?.addEventListener(
			"error",
			() => reject(new Error("CDP connection failed")),
			{ once: true },
		);
	});
	socket.addEventListener("message", (event) => {
		const packet = JSON.parse(String(event.data));
		if (packet.id) {
			const item = pending.get(packet.id);
			if (item) {
				clearTimeout(item.timer);
				pending.delete(packet.id);
				packet.error
					? item.reject(new Error(JSON.stringify(packet.error)))
					: item.resolve(packet.result);
			}
		} else if (packet.method === "Runtime.exceptionThrown")
			errors.push(JSON.stringify(packet.params));
		else if (
			packet.method === "Network.loadingFailed" &&
			!packet.params.canceled
		)
			networkFailures.push(JSON.stringify(packet.params));
	});
	await send("Runtime.enable");
	await send("Page.enable");
	await send("Network.enable");
	if (chatSmoke) await send("Page.reload", { ignoreCache: true });
	if (chatSmoke) {
		await runChatTaskSmoke({
			fixture,
			runDir,
			sessionId: chatSessionId,
			send,
			evaluate,
			until,
			clickText,
			fill,
			screenshot,
			errors,
			networkFailures,
		});
	} else if (skillsSmoke) {
		await runSkillsSmoke({
			fixture,
			runDir,
			send,
			evaluate,
			until,
			clickText,
			fill,
			screenshot,
			errors,
			networkFailures,
		});
	} else {
		await until(
			() => evaluate<string>("document.body?.innerText ?? ''"),
			(text) => text.includes("New task"),
			"Task page failed to render",
			60000,
		);
		const emptyLayout = await verifyTaskEmptyLayout({
			send,
			evaluate,
			until,
			clickText,
			fill,
			screenshot,
		});
		await clickText("New task");
		await until(
			() => evaluate<string>("document.body?.innerText ?? ''"),
			(text) => text.includes("Project rules v1"),
			"Profile preview missing",
		);
		await clickText("Project verification settings");
		await until(
			() => evaluate<string>("document.body?.innerText ?? ''"),
			(text) => text.includes("Discover package scripts"),
			"Profile editor missing",
		);
		await clickText("Discover package scripts");
		await until(
			() => evaluate<string>("document.body?.innerText ?? ''"),
			(text) => text.includes("Add suggestion"),
			"Script discovery did not return",
		);
		await screenshot("01-project-profile.png");
		await clickText("Save project settings");
		await until(
			() => evaluate<string>("document.body?.innerText ?? ''"),
			(text) => text.includes("Project rules v2"),
			"Saved profile not reflected in task preview",
		);
		await fill(
			'textarea[id$="-goal"]',
			"Write right into value.txt using the project verification rules",
		);
		await clickText("Strategy and acceptance", "summary");
		const listedAgents = await evaluate<string[]>(
			`Array.from(document.querySelector('select[id$="-agent"]').options).map(o=>o.value)`,
		);
		if (
			![
				"claude-agent-acp",
				"codex-app-server",
				"pi-acp",
				"myflicker-acp",
				"deepseek-acp",
			].every((h) => listedAgents.includes(h))
		)
			throw new Error("Task selector omitted a registered ACP agent");
		await fill('input[id$="-model"]', "task-local/task-model");
		if (deliverySmoke) {
			// Use actual pointer interaction with the product's explicit delivery choice.
			await until(
				() =>
					evaluate<boolean>(
						"!document.querySelector('[data-testid=task-delivery-push]')?.disabled",
					),
				Boolean,
				"Push target not ready",
				10000,
			);
			await clickText(
				"Commit and push to the explicitly selected branch",
				"label",
			);
			await until(
				() =>
					evaluate<string | null>(
						"document.querySelector('[data-testid=task-delivery-push]')?.getAttribute('aria-checked')",
					),
				(value) => value === "true",
				"Push delivery was not selected through the UI",
				5000,
			);
			await fill(
				'[data-testid="task-commit-message"]',
				"fix(task-ui): verified delivery",
			);
			await screenshot("00-delivery-authorization.png");
		}
		await clickText("Start task");
		const created = await until(
			() => fixture.api.tasks.list.query(),
			(rows) => rows.length > 0,
			"UI did not create task",
		);
		const taskId = created[0]?.task.id;
		if (!taskId) throw new Error("Created task is missing");
		await until(
			() => fixture.api.tasks.get.query({ id: taskId }),
			() => fixture.modelRequests > 0,
			"Task did not start Pi",
			30000,
		);
		await fill(
			'textarea[id$="-text"]',
			"Keep unrelated files unchanged; continue without pausing",
		);
		await clickText("Send guidance");
		await clickText("Execution");
		await until(
			() => evaluate<string>("document.body?.innerText ?? ''"),
			(text) =>
				text.includes("Accepted by execution interface") ||
				text.includes("Candidate") ||
				text.includes("running"),
			"Execution timeline missing",
			15000,
		).catch(() => undefined);
		await screenshot("02-live-execution.png");
		await clickText("Candidate result");
		const completed = await until(
			() => fixture.api.tasks.get.query({ id: taskId }),
			(data) =>
				["succeeded", "failed", "blocked"].includes(data.run?.status ?? ""),
			"Task did not complete",
			40000,
		);
		if (completed.run?.status !== "succeeded")
			throw new Error(JSON.stringify(completed));
		if (deliverySmoke) {
			if (
				completed.operations.length !== 2 ||
				completed.operations.some((op) => op.status !== "confirmed")
			)
				throw new Error("UI-authorized Git delivery not fully confirmed");
			const commit = completed.operations[0]?.commitOid;
			const tip = execFileSync(
				"git",
				[
					"ls-remote",
					"delivery",
					`refs/heads/${completed.run.contract.delivery?.mode === "push" ? completed.run.contract.delivery.remoteBranch : "invalid"}`,
				],
				{ cwd: fixture.cwd, encoding: "utf8" },
			);
			if (!commit || !tip.includes(commit))
				throw new Error("Local remote tip did not match confirmed commit");
			await until(
				() => evaluate<string>("document.body?.innerText ?? ''"),
				(text) => text.includes("Git delivery records"),
				"Delivery records not rendered",
			);
		}
		await until(
			() => evaluate<string>("document.body?.innerText ?? ''"),
			(text) => text.includes("Accepted by explicit checks"),
			"UI did not display completion",
		);
		await screenshot("03-verified-result.png");
		const populatedLayout = await verifyTaskPopulatedLayout({
			send,
			evaluate,
			until,
			clickText,
			fill,
			screenshot,
		});
		await send("Page.reload", { ignoreCache: true });
		await until(
			() => evaluate<string>("document.body?.innerText ?? ''"),
			(text) => text.includes("Accepted by explicit checks"),
			"Reload did not restore task result",
			30000,
		);
		const same = await fixture.api.tasks.get.query({ id: taskId });
		if (same.run?.id !== completed.run.id)
			throw new Error("Reload started a duplicate run");
		if (errors.length)
			throw new Error(`Renderer exceptions: ${errors.join("\n")}`);
		const report = {
			passed: true,
			mode: "isolated Electron Task UI + real Host/daemon/SDK + deterministic loopback model",
			layout: { empty: emptyLayout, ...populatedLayout },
			listedAgents,
			target: { id: page.id, url: page.url },
			taskId,
			runId: completed.run.id,
			revision: completed.run.revision,
			profileRevision: completed.run.profile?.revision,
			guidance: completed.guidance.map(({ status, deliveryMode }) => ({
				status,
				deliveryMode,
			})),
			checks: completed.checks.map(({ name, status, exitCode }) => ({
				name,
				status,
				exitCode,
			})),
			delivery: completed.run.contract.delivery?.mode ?? "none",
			operations: completed.operations.map(({ kind, status, commitOid }) => ({
				kind,
				status,
				commitOid,
			})),
			modelRequests: fixture.modelRequests,
			rendererErrors: errors,
			networkFailures,
			screenshots: [
				...(deliverySmoke ? ["00-delivery-authorization.png"] : []),
				"01-project-profile.png",
				"02-live-execution.png",
				"03-verified-result.png",
			],
		};
		writeFileSync(join(runDir, "report.json"), JSON.stringify(report, null, 2));
		console.log(JSON.stringify({ ...report, artifacts: runDir }, null, 2));
	}
} catch (error) {
	if (socket)
		try {
			await screenshot("failure.png");
			const bootstrapErrors = await evaluate<unknown>(
				"window.__smokeErrors??[]",
			);
			writeFileSync(
				join(runDir, "renderer-errors.json"),
				JSON.stringify({ errors, networkFailures, bootstrapErrors }, null, 2),
			);
			const text = await evaluate<string>("document.body?.innerText ?? ''");
			writeFileSync(
				join(runDir, "failure.txt"),
				`${String(error)}\n${text}\n${errors.join("\n")}\n${fixture.logs()}`,
			);
		} catch {}
	throw error;
} finally {
	// Close the isolated browser first, so its live queries/WebSockets cannot
	// keep Vite or the test Host alive. Never address any installed-app window.
	if (socket?.readyState === WebSocket.OPEN) {
		try {
			await Promise.race([send("Browser.close"), sleep(2000)]);
		} catch {}
	}
	socket?.close();
	for (const item of pending.values()) {
		clearTimeout(item.timer);
		item.reject(new Error("Smoke test closing"));
	}
	pending.clear();
	if (child && child.exitCode === null && child.signalCode === null) {
		child.kill("SIGTERM");
		await Promise.race([
			new Promise<void>((done) => child?.once("exit", () => done())),
			sleep(2000),
		]);
		if (child.exitCode === null && child.signalCode === null) {
			child.kill("SIGKILL");
			await new Promise<void>((done) => child?.once("exit", () => done()));
		}
	}
	console.log("[task-smoke] isolated Electron closed; cleaning test servers");
	try {
		await fixture.close();
	} finally {
		await vite?.close();
	}
	console.log("[task-smoke] isolated Host, daemon and Vite closed");
	if (skillsSmoke) {
		if (previousGlobalSkillsDir === undefined)
			delete process.env.SUPERSET_GLOBAL_SKILLS_DIR;
		else process.env.SUPERSET_GLOBAL_SKILLS_DIR = previousGlobalSkillsDir;
	}
}
