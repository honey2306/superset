import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { createTaskTransportFixture } from "../../../../packages/host-service/src/tasks/task-transport-fixture";

interface Context {
	fixture: Awaited<ReturnType<typeof createTaskTransportFixture>>;
	runDir: string;
	sessionId: string;
	send<T = unknown>(
		method: string,
		params?: Record<string, unknown>,
	): Promise<T>;
	evaluate<T>(expression: string): Promise<T>;
	until<T>(
		fn: () => Promise<T>,
		ready: (value: T) => boolean,
		label: string,
		timeout?: number,
	): Promise<T>;
	clickText(text: string, selector?: string): Promise<void>;
	fill(selector: string, text: string): Promise<void>;
	screenshot(name: string): Promise<void>;
	errors: string[];
	networkFailures: string[];
}
export async function runChatTaskSmoke(c: Context) {
	const {
		fixture: f,
		runDir,
		sessionId,
		send,
		evaluate,
		until,
		clickText,
		screenshot,
		errors,
		networkFailures,
	} = c;
	const body = () => evaluate<string>("document.body?.innerText ?? ''");
	const editorSelector = '.acp-pane__composer [contenteditable="true"]';
	const input = async (text: string) => {
		const point = await until(
			() =>
				evaluate<{ x: number; y: number } | null>(
					`(()=>{const e=document.querySelector(${JSON.stringify(editorSelector)});if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return r.width>0?{x:r.x+Math.min(50,r.width/2),y:r.y+r.height/2}:null;})()`,
				),
			Boolean,
			"Normal chat editor is missing",
			25000,
		);
		if (!point) throw new Error("Editor point missing");
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
			commands: ["selectAll"],
		});
		await send("Input.dispatchKeyEvent", {
			type: "keyUp",
			key: "a",
			code: "KeyA",
			modifiers: 4,
		});
		await send("Input.insertText", { text });
		await send("Input.dispatchKeyEvent", {
			type: "keyDown",
			key: "Enter",
			code: "Enter",
			windowsVirtualKeyCode: 13,
		});
		await send("Input.dispatchKeyEvent", {
			type: "keyUp",
			key: "Enter",
			code: "Enter",
			windowsVirtualKeyCode: 13,
		});
	};
	await until(
		body,
		(text) => text.includes("Chat"),
		"Conversation Task mode controls not mounted",
		60000,
	);
	await input(
		"Discuss the approach and remember CONTEXT_KEEP_42. Do not modify code yet.",
	);
	await until(
		() => f.api.acpSessions.get.query({ sessionId }),
		(state) => state.status === "idle" && Boolean(state.lastCompletedAt),
		"Ordinary chat did not complete",
		25000,
	);
	await until(
		body,
		(text) => text.includes("Prior discussion retained"),
		"Prior conversation not visible",
		15000,
	);
	if ((await f.api.tasks.list.query()).length !== 0)
		throw new Error("Ordinary chat unexpectedly created a Task");
	await screenshot("chat-01-ordinary-discussion.png");
	await clickText("Chat", ".acp-task-mode__trigger");
	await clickText("Task", '[role="menuitemradio"]');
	await until(
		() =>
			evaluate<string | null>(
				'document.querySelector(\'[aria-label="Conversation mode"][data-active="true"]\')?.textContent??null',
			),
		(text) => text?.trim() === "Task",
		"Task mode not selected",
	);
	// Finish Radix's close/focus restoration before clicking the editor.
	await until(
		() =>
			evaluate<boolean>(
				`!document.querySelector('[role="menu"]') && document.querySelector('.acp-task-mode__trigger')?.getAttribute('data-state') === 'closed'`,
			),
		Boolean,
		"Mode menu did not finish closing",
	);
	await new Promise((done) => setTimeout(done, 150));
	await input(
		"Implement our discussed approach: write right into value.txt, then verify the result.",
	);
	const created = await until(
		() => f.api.tasks.forSession.query({ sessionId }),
		(data) => Boolean(data?.owned),
		"Sending from chat did not start its Task",
		25000,
	);
	if (!created || created.run.sessionId !== sessionId)
		throw new Error("Task created a different conversation");
	await until(
		() =>
			evaluate<boolean>(
				'Boolean(document.querySelector("[data-testid=conversation-task-card]"))',
			),
		Boolean,
		"Inline Task card missing",
	);
	const footerLayout = () =>
		evaluate<{
			cardHeight: number;
			composerCount: number;
			modeCount: number;
			modeInsideComposer: boolean;
			modeInsideStatusBar: boolean;
			statusBarBelowComposer: boolean;
			statusBarHeight: number;
			footerOverflow: boolean;
			horizontalOverflow: boolean;
			modelEditable: boolean;
		}>(
			`(()=>{const card=document.querySelector('[data-testid="conversation-task-card"]');const mode=document.querySelector('[data-testid="conversation-task-mode"]');const composer=document.querySelector('.acp-pane__composer-box');const bar=document.querySelector('.acp-status-bar');return {cardHeight:card?.getBoundingClientRect().height??0,composerCount:document.querySelectorAll('.acp-pane__composer [contenteditable="true"]').length,modeCount:document.querySelectorAll('[data-testid="conversation-task-mode"]').length,modeInsideComposer:!!mode?.closest('.acp-pane__composer-box'),modeInsideStatusBar:!!mode?.closest('.acp-status-bar'),statusBarBelowComposer:!!bar&&!!composer&&bar.getBoundingClientRect().y>=composer.getBoundingClientRect().bottom,statusBarHeight:bar?.getBoundingClientRect().height??0,footerOverflow:!!bar&&bar.scrollWidth>bar.clientWidth+1,horizontalOverflow:document.documentElement.scrollWidth>innerWidth,modelEditable:!!bar?.querySelector('button.acp-status-bar__seg--model')};})()`,
		);
	const layout = await footerLayout();
	if (
		layout.cardHeight > 90 ||
		layout.composerCount !== 1 ||
		layout.modeCount !== 1 ||
		layout.modeInsideComposer ||
		!layout.modeInsideStatusBar ||
		!layout.statusBarBelowComposer ||
		layout.statusBarHeight > 32 ||
		layout.footerOverflow ||
		layout.horizontalOverflow ||
		layout.modelEditable
	)
		throw new Error(`Conversation footer regression ${JSON.stringify(layout)}`);

	await screenshot("chat-02-inline-task-running.png");
	// Remount the real conversation; no hidden separate execution UI should be necessary.
	await clickText("Hide conversation");
	await until(
		body,
		(text) => text.includes("view detached"),
		"Conversation did not detach",
	);
	await clickText("Show conversation");
	const done = await until(
		() => f.api.tasks.forSession.query({ sessionId }),
		(data) =>
			Boolean(
				data &&
					["succeeded", "failed", "blocked", "awaiting_review"].includes(
						data.run.status,
					),
			),
		"Conversation task did not finish",
		45000,
	);
	if (!done || done.run.status !== "succeeded")
		throw new Error(`Unexpected task result: ${JSON.stringify(done?.run)}`);
	if (done.run.continuationCount !== 1 || done.run.reportRecoveryCount !== 1)
		throw new Error(
			"Premature ending did not trigger one bounded continuation",
		);
	if (
		done.run.sessionId !== sessionId ||
		!f.modelInputs.every((item) => item.conversationContextSeen)
	)
		throw new Error("Original conversation context was not preserved");
	await until(
		body,
		(text) => text.includes("Succeeded"),
		"Completion not shown inline",
		15000,
	);
	const toggle = await evaluate<{ x: number; y: number }>(
		`(()=>{const e=document.querySelector('[aria-label="View task details"]');const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`,
	);
	await send("Input.dispatchMouseEvent", {
		type: "mousePressed",
		button: "left",
		clickCount: 1,
		...toggle,
	});
	await send("Input.dispatchMouseEvent", {
		type: "mouseReleased",
		button: "left",
		clickCount: 1,
		...toggle,
	});
	await until(
		body,
		(text) => text.includes("Requirement coverage"),
		"Coverage explanation absent",
	);
	await screenshot("chat-03-complete-with-coverage.png");
	await send("Emulation.setDeviceMetricsOverride", {
		width: 600,
		height: 800,
		deviceScaleFactor: 1,
		mobile: false,
	});
	const narrowLayout = await footerLayout();
	if (
		narrowLayout.modeInsideComposer ||
		!narrowLayout.modeInsideStatusBar ||
		narrowLayout.footerOverflow ||
		narrowLayout.horizontalOverflow
	)
		throw new Error(`Narrow footer regression ${JSON.stringify(narrowLayout)}`);
	await screenshot("chat-statusbar-narrow.png");
	await send("Emulation.clearDeviceMetricsOverride");

	await clickText("Return to chat");
	await until(
		() => f.api.tasks.forSession.query({ sessionId }),
		(data) => data?.owned === false,
		"Conversation control was not released",
	);
	await until(
		footerLayout,
		(value) =>
			value.modeInsideStatusBar &&
			!value.modeInsideComposer &&
			value.modelEditable,
		"Released conversation footer did not restore model controls",
	);
	await input(
		"Summarize our original CONTEXT_KEEP_42 discussion. This is normal chat again.",
	);
	await until(
		() => f.api.acpSessions.getTranscript.query({ sessionId }),
		(data) => data.totalTurns >= 4,
		"Ordinary message after task did not execute",
		20000,
	);
	await send("Page.reload", { ignoreCache: true });
	await until(
		body,
		(text) =>
			text.includes("Prior discussion retained") && text.includes("Succeeded"),
		"Reload lost conversation/task view",
		20000,
	);
	// Numeric/DOM lifecycle assertions remain mandatory. Electron CDP can stall
	// captureScreenshot after Page.reload even with a readable, painted page.
	// An explicitly requested no-reload-capture run reports that visual gap;
	// it must never be described as a full screenshot verification.
	const captureReload = process.env.SUPERSET_TASK_CHAT_CAPTURE_RELOAD !== "0";
	if (captureReload) await screenshot("chat-04-back-to-chat-reloaded.png");
	const history = await f.api.acpSessions.getTranscript.query({ sessionId });
	const tasks = await f.api.tasks.list.query();
	if (tasks.length !== 1 || history.totalTurns !== 4)
		throw new Error("Task or conversation duplicated on remount/reload");
	if (errors.length) throw new Error(`Renderer errors: ${errors.join("\n")}`);
	const report = {
		passed: true,
		functionalPassed: true,
		layout,
		narrowLayout,
		visualEvidenceComplete: captureReload,
		visualEvidenceLimit: captureReload
			? null
			: "Post-reload screenshot not captured; reload checked through actual DOM/history/session identity. Earlier three stages have screenshots.",
		scope:
			"Actual AcpSessionPane + normal composer + HTTP Host/ACP/Pi/MCP + real file/check; model is loopback deterministic",
		sameSessionId: sessionId,
		route: await evaluate<string>("location.hash"),
		taskId: done.task.id,
		taskCount: tasks.length,
		conversationTurns: history.totalTurns,
		goalContinuations: done.run.continuationCount,
		checkStatuses: done.checks.map((item) => item.status),
		contextRetained: true,
		returnedToOrdinaryChat: true,
		modelRequests: f.modelRequests,
		rendererErrors: errors,
		networkFailures,
	};
	writeFileSync(join(runDir, "report.json"), JSON.stringify(report, null, 2));
	console.log(JSON.stringify({ ...report, artifacts: runDir }, null, 2));
}
