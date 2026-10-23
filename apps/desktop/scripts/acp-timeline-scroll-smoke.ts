/** Isolated Electron layout/input regression; no API, model or user database. */
import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer as createNetServer } from "node:net";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const desktop = resolve(import.meta.dir, "..");
const root = resolve(desktop, ".cache", `acp-scroll-smoke-${Date.now()}`);
mkdirSync(root, { recursive: true });
const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));
async function freePort() {
	const server = createNetServer();
	await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
	const address = server.address();
	assert(address && typeof address !== "string");
	const port = address.port;
	await new Promise<void>((done) => server.close(() => done()));
	return port;
}
const rendererPort = await freePort(),
	cdpPort = await freePort();
writeFileSync(
	`${root}/index.html`,
	'<html><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>',
);
writeFileSync(
	`${root}/main.tsx`,
	`import React,{useState,useEffect} from 'react';import {createRoot} from 'react-dom/client';import {AcpTimeline} from 'renderer/screens/main/components/WorkspaceView/ContentView/components/AcpSessionPane/components/AcpTimeline/AcpTimeline';import 'renderer/screens/main/components/WorkspaceView/ContentView/components/AcpSessionPane/acp-pane.css';import {TooltipProvider} from '@superset/ui/tooltip';import {I18nProvider} from 'renderer/providers/I18nProvider';
const msg=(n,role,text)=>({kind:'message',id:role+':'+n,role,blocks:[{type:'text',text}],failed:false,startSeq:n,endSeq:n});const base=Array.from({length:30},(_,i)=>[msg(i*2+1,'user','Question '+i),msg(i*2+2,'agent',('Paragraph '+i+' '+ 'text '.repeat(30)+'\\n\\n').repeat(12))]).flat();
function App(){const [tick,setTick]=useState(0);const [settled,setSettled]=useState(false);const [focused,setFocused]=useState(true);useEffect(()=>{const t=setInterval(()=>setTick(v=>v+1),100);return()=>clearInterval(t)},[]);return <TooltipProvider><I18nProvider><button onClick={()=>setFocused(true)}>Conversation A</button><button onClick={()=>setFocused(false)}>Conversation B</button><button onClick={()=>setSettled(true)}>Finish response</button><div className="acp-pane" style={{height:600,width:900,display:focused?'flex':'none'}}><AcpTimeline timeline={{items:[...base],meta:{title:null,usage:null,currentMode:null,configOptions:null,availableCommands:null},lastSeq:60,state:null,resetReason:null}} sessionId="scroll-smoke-a" isFocused={focused} status={settled?"idle":"running"} model={String(tick)} onRespond={async()=>{}}/></div><div className="acp-pane" style={{height:600,width:900,display:focused?"none":"flex"}}><AcpTimeline timeline={{items:base.slice(0,4),meta:{},lastSeq:4,state:null,resetReason:null}} sessionId="scroll-smoke-b" isFocused={!focused} status="idle" onRespond={async()=>{}}/></div></I18nProvider></TooltipProvider>};createRoot(document.getElementById('root')).render(<App/>);`,
);

const vite = await createServer({
	configFile: false,
	cacheDir: `${root}/vite-cache`,
	root,
	plugins: [react(), tsconfigPaths({ projects: [`${desktop}/tsconfig.json`] })],
	resolve: {
		alias: {
			renderer: `${desktop}/src/renderer`,
			shared: `${desktop}/src/shared`,
		},
		dedupe: ["react", "react-dom"],
	},
	server: {
		host: "127.0.0.1",
		port: rendererPort,
		strictPort: true,
		fs: { allow: [resolve(desktop, "../..")] },
	},
});
let child: ReturnType<typeof spawn> | undefined;
let socket: WebSocket | undefined;
let nextId = 0;
const pending = new Map<
	number,
	{ resolve: (value: unknown) => void; reject: (error: Error) => void }
>();
async function send<T>(method: string, params: object = {}): Promise<T> {
	return await new Promise<T>((done, reject) => {
		const id = ++nextId;
		const timer = setTimeout(() => {
			pending.delete(id);
			reject(new Error(`CDP timeout: ${method}`));
		}, 15000);
		pending.set(id, {
			resolve: (value) => {
				clearTimeout(timer);
				done(value as T);
			},
			reject: (error) => {
				clearTimeout(timer);
				reject(error);
			},
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
	assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
	return result.result.value;
}
interface Position {
	top: number;
	height: number;
	viewport: number;
	id: string;
	index: number;
	y: number;
}
async function position(): Promise<Position> {
	return await evaluate(
		`(()=>{const e=document.querySelector('.acp-pane__scroll');const p=[...e.querySelectorAll('[data-message-id] p')].find(p=>p.getBoundingClientRect().bottom>60);const m=p.closest('[data-message-id]');return {top:e.scrollTop,height:e.scrollHeight,viewport:e.clientHeight,id:m.dataset.messageId,index:[...m.querySelectorAll('p')].indexOf(p),y:p.getBoundingClientRect().top}})()`,
	);
}
async function anchorY(position: Position): Promise<number> {
	return await evaluate(
		`document.querySelector('[data-message-id="${position.id}"]')?.querySelectorAll('p')[${position.index}]?.getBoundingClientRect().top ?? null`,
	);
}
async function screenshot(name: string) {
	const result = await send<{ data: string }>("Page.captureScreenshot", {
		format: "png",
	});
	writeFileSync(`${root}/${name}.png`, Buffer.from(result.data, "base64"));
}
async function click(x: number, y: number) {
	await send("Input.dispatchMouseEvent", {
		type: "mousePressed",
		x,
		y,
		button: "left",
		clickCount: 1,
	});
	await send("Input.dispatchMouseEvent", {
		type: "mouseReleased",
		x,
		y,
		button: "left",
		clickCount: 1,
	});
}
async function clickButton(text: string) {
	const point = await evaluate<{ x: number; y: number }>(
		`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.innerText===${JSON.stringify(text)} || b.getAttribute('aria-label')===${JSON.stringify(text)});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
	);
	await click(point.x, point.y);
}
try {
	await vite.listen();
	writeFileSync(
		`${root}/electron.cjs`,
		`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(`${root}/electron-data`)});app.commandLine.appendSwitch('remote-debugging-port',${JSON.stringify(String(cdpPort))});app.whenReady().then(()=>{const w=new BrowserWindow({width:1000,height:760,show:false,webPreferences:{backgroundThrottling:false}});w.loadURL('http://127.0.0.1:${rendererPort}')});`,
	);
	child = spawn(
		createRequire(`${desktop}/package.json`)("electron"),
		[`${root}/electron.cjs`],
		{ stdio: "ignore" },
	);
	let target: { webSocketDebuggerUrl: string } | undefined;
	for (let attempt = 0; attempt < 100; attempt++) {
		try {
			const targets = (await fetch(
				`http://127.0.0.1:${cdpPort}/json/list`,
			).then((r) => r.json())) as Array<{
				type: string;
				url: string;
				webSocketDebuggerUrl: string;
			}>;
			target = targets.find(
				(t) =>
					t.type === "page" &&
					t.url.startsWith(`http://127.0.0.1:${rendererPort}`),
			);
		} catch {}
		if (target) break;
		await delay(100);
	}
	assert(target, "Isolated Electron did not start");
	socket = new WebSocket(target.webSocketDebuggerUrl);
	await new Promise<void>((done) =>
		socket?.addEventListener("open", () => done(), { once: true }),
	);
	socket.onmessage = (event) => {
		const message = JSON.parse(String(event.data));
		const request = pending.get(message.id);
		if (!request) return;
		pending.delete(message.id);
		if (message.error) request.reject(new Error(JSON.stringify(message.error)));
		else request.resolve(message.result);
	};
	for (let attempt = 0; attempt < 150; attempt++) {
		if (await evaluate("!!document.querySelector('.acp-pane__scroll')")) break;
		await delay(100);
	}
	await delay(1000);
	const initial = await position();
	await screenshot("before");

	const wheelChecks = [];
	for (let step = 0; step < 8; step++) {
		const before = await position();
		await send("Input.dispatchMouseEvent", {
			type: "mouseWheel",
			x: 800,
			y: 500,
			deltaX: 0,
			deltaY: -700,
		});
		await delay(700);
		const displacement = (await anchorY(before)) - before.y;
		wheelChecks.push({ step, displacement, before, after: await position() });
		assert(
			Math.abs(displacement - 700) < 2,
			`Wheel ${step}: content moved ${displacement}px instead of 700px`,
		);
	}
	await screenshot("after-wheel");
	const reading = await position();
	await clickButton("Conversation B");
	await delay(300);
	assert(
		await evaluate(
			"document.querySelector('.acp-pane__scroll').clientHeight === 0",
		),
	);
	await clickButton("Conversation A");
	await delay(700);
	const restoredY = await anchorY(reading);
	assert(
		Math.abs(restoredY - reading.y) < 2,
		"Hide/show lost the reading anchor",
	);
	const switches = [{ status: "running", y: restoredY }];
	for (const status of ["running", "idle"]) {
		if (status === "idle") {
			await clickButton("Finish response");
			await delay(300);
		}
		for (let cycle = 0; cycle < 5; cycle++) {
			await clickButton("Conversation B");
			await delay(300);
			await clickButton("Conversation A");
			await delay(700);
			const y = await anchorY(reading);
			switches.push({ status, y });
			assert(
				y !== null && Math.abs(y - reading.y) < 2,
				`Switch ${status}/${cycle} lost the reading anchor`,
			);
		}
	}
	await screenshot("after-restore");
	await clickButton("Jump to latest");
	await clickButton("Finish response");
	await delay(700);
	const bottomBefore = await position();
	for (let cycle = 0; cycle < 3; cycle++) {
		await clickButton("Conversation B");
		await delay(300);
		await clickButton("Conversation A");
		await delay(700);
	}
	const bottomAfter = await position();
	assert(
		Math.abs(bottomAfter.height - bottomAfter.viewport - bottomAfter.top) < 2,
		"Returning to a settled conversation jumped away from the bottom",
	);
	await screenshot("after-settled-switch");
	writeFileSync(
		`${root}/result.json`,
		JSON.stringify(
			{
				initial,
				wheelChecks,
				reading,
				restoredY,
				switches,
				bottomBefore,
				bottomAfter,
			},
			null,
			2,
		),
	);
	console.log(
		JSON.stringify({
			passed: true,
			evidence: root,
			rendererPort,
			cdpPort,
			wheelChecks: wheelChecks.map((r) => r.displacement),
		}),
	);
} catch (error) {
	if (socket?.readyState === WebSocket.OPEN) await screenshot("failure");
	console.error(error);
	throw error;
} finally {
	socket?.close();
	child?.kill();
	vite.httpServer?.closeAllConnections();
	await vite.close();
}
