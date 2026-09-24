import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { createTaskTransportFixture } from "../../../../packages/host-service/src/tasks/task-transport-fixture";

interface SmokeContext {
	fixture: Awaited<ReturnType<typeof createTaskTransportFixture>>;
	runDir: string;
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
/** Real pointer/keyboard interactions against existing router + actual Skills UI.
 * Only platform discovery, disposable filesystem and unrelated pages are fixtures. */
export async function runSkillsSmoke(context: SmokeContext) {
	const {
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
	} = context;
	const projectScope = {
			kind: "project" as const,
			projectId: fixture.projectId,
		},
		globalScope = { kind: "global" as const };
	const body = () => evaluate<string>("document.body?.innerText ?? ''");
	const waitText = (text: string) =>
		until(
			body,
			(value) => value.includes(text),
			`Missing visible text: ${text}`,
			20_000,
		);
	const clickSelector = async (selector: string) => {
		const point = await until(
			() =>
				evaluate<{ x: number; y: number } | null>(
					`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return r.width&&r.height?{x:r.x+r.width/2,y:r.y+r.height/2}:null;})()`,
				),
			Boolean,
			`Missing visible ${selector}`,
		);
		if (!point) throw new Error(`No point for ${selector}`);
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
	};
	const setScope = async (kind: "global" | "project") => {
		await clickSelector('[aria-label="Skill scope"]');
		await clickText(
			kind === "global" ? "Global" : "Project · Isolated Task Verification",
			'[role="option"]',
		);
	};
	const waitName = (name: string) =>
		until(
			() =>
				evaluate<string>(
					`document.querySelector('input[aria-label="Skill name"]')?.value ?? ''`,
				),
			(value) => value === name,
			`Skill ${name} not selected`,
		);
	const save = async () => {
		await clickText("Save skill");
		await until(
			() =>
				evaluate<boolean>(
					"Array.from(document.querySelectorAll('button')).some(e=>e.textContent.trim()==='Save skill'&&e.disabled)",
				),
			Boolean,
			"Skill save did not settle",
		);
	};
	await waitText("Reusable methods");
	await waitText("No skills in this scope");
	await screenshot("skills-01-global-empty.png");
	await setScope("project");
	await waitName("verify-behavior-change");
	await clickText("references/superset.md", "span");
	await waitText("Choose the scope");
	await screenshot("skills-02-project-package.png");
	const source = await fixture.api.settings.skills.get.query({
		scope: projectScope,
		name: "verify-behavior-change",
	});
	if (source.files.length !== 2)
		throw new Error("Expected full project reference package");
	await clickText("Copy complete package");
	await waitText("Copy skill package");
	await clickText("Copy package");
	await until(
		() => fixture.api.settings.skills.list.query({ scope: globalScope }),
		(list) => list.skills.some((skill) => skill.name === source.name),
		"Global copy missing",
	);
	await until(
		() => evaluate<number>("document.querySelectorAll('[role=dialog]').length"),
		(count) => count === 0,
		"Copy dialog remained open",
	);
	const copied = await fixture.api.settings.skills.get.query({
		scope: globalScope,
		name: source.name,
	});
	if (
		!existsSync(
			join(runDir, "global-skills", source.name, "references/superset.md"),
		)
	)
		throw new Error("Copy lost companion file");
	await setScope("global");
	await waitName(source.name);
	await clickText("New skill");
	await fill('input[aria-label="Skill name"]', "ui-method");
	await fill(
		'textarea[aria-label="When to use"]',
		"Use for a small repeatable verification method.",
	);
	await fill(
		'textarea[aria-label="Instructions"]',
		"# Reusable method\n\nRead existing project rules. Do not add a mandatory Task phase.",
	);
	await clickSelector('input[type="checkbox"]');
	await clickText("Preview");
	await waitText("Reusable method");
	await save();
	let created = await fixture.api.settings.skills.get.query({
		scope: globalScope,
		name: "ui-method",
	});
	if (created.invocation !== "manual")
		throw new Error("Manual-only preference was not persisted");
	await fill('input[aria-label="Skill name"]', "ui-method-renamed");
	await save();
	await waitName("ui-method-renamed");
	created = await fixture.api.settings.skills.get.query({
		scope: globalScope,
		name: "ui-method-renamed",
	});
	await screenshot("skills-03-created-renamed.png");
	// Actual route blocker: cancel navigation preserves the unsaved draft.
	await clickText("Edit");
	await fill(
		'textarea[aria-label="Instructions"]',
		"UNSAVED_DRAFT_MUST_SURVIVE_CANCELLED_NAVIGATION",
	);
	await clickText("Memory", "a");
	await waitText("Discard unsaved changes?");
	await clickText("Keep editing");
	// Wait for the closing scrim to unmount before clicking the next link.
	// Otherwise the pointer can hit the old modal while its text is fading out.
	await until(
		() =>
			evaluate<number>(
				`document.querySelectorAll('[role="alertdialog"]').length`,
			),
		(count) => count === 0,
		"Cancelled dialog did not finish closing",
	);
	if (!(await evaluate<string>("location.hash")).includes("skills"))
		throw new Error("Cancelled navigation changed route");
	if (
		!(
			await evaluate<string>(
				"document.querySelector('textarea[aria-label=Instructions]')?.value??''",
			)
		).includes("UNSAVED_DRAFT")
	)
		throw new Error("Cancelled navigation discarded draft");
	await clickText("Memory", "a");
	await waitText("Discard unsaved changes?");
	await clickText("Discard changes");
	await waitText("Memory navigation target");
	await clickText("Skills", "a");
	await waitText("Reusable methods");
	// Select the copied reference skill and change a companion externally, only in the disposable fixture.
	await clickText("verify-behavior-change", "strong");
	await waitName("verify-behavior-change");
	await fill(
		'textarea[aria-label="Instructions"]',
		"# Updated method\n\nThe editor must protect externally modified companion files.",
	);
	const reference = join(
		runDir,
		"global-skills",
		"verify-behavior-change",
		"references/superset.md",
	);
	writeFileSync(
		reference,
		`${readFileSync(reference, "utf8")}\nEXTERNAL_REFERENCE_REVISION\n`,
	);
	await clickText("Save skill");
	await waitText("changed externally");
	await screenshot("skills-04-conflict-preserved.png");
	await clickText("Reload from disk");
	await waitText("Discard unsaved changes?");
	await clickText("Discard changes");
	await waitName("verify-behavior-change");
	await until(
		() => body(),
		(text) => !text.includes("Skill or companion files changed externally"),
		"Conflict not cleared after reload",
	);
	await until(
		() =>
			evaluate<boolean>(
				`document.querySelectorAll('[role="alertdialog"]').length===0 && Array.from(document.querySelectorAll('button')).some(e=>e.textContent.trim()==='Reload from disk'&&!e.disabled)`,
			),
		Boolean,
		"Reload and discard transition did not settle",
	);
	await clickText("references/superset.md", "span");
	await waitText("EXTERNAL_REFERENCE_REVISION");
	await clickText("Delete skill");
	await waitText("Delete the whole skill package?");
	await clickText("Delete skill", '[role="alertdialog"] button');
	await until(
		() => fixture.api.settings.skills.list.query({ scope: globalScope }),
		(list) => !list.skills.some((skill) => skill.name === source.name),
		"Confirmed deletion did not remove global copy",
	);
	if (
		!(
			await fixture.api.settings.skills.get.query({
				scope: projectScope,
				name: source.name,
			})
		).files.length
	)
		throw new Error("Deleting global copy damaged project source");
	await waitName("ui-method-renamed");
	await send("Page.reload", { ignoreCache: true });
	await waitText("Reusable methods");
	await waitName("ui-method-renamed");
	await screenshot("skills-05-persisted-after-reload.png");
	if (
		(await fixture.api.tasks.list.query()).length !== 0 ||
		fixture.modelRequests !== 0
	)
		throw new Error("Skill management unexpectedly created or ran a Task");
	if (errors.length)
		throw new Error(`Renderer exceptions: ${errors.join("\n")}`);
	const report = {
		passed: true,
		mode: "Isolated actual Electron Skills route + HTTP Host + real package files; no model calls",
		route: await evaluate<string>("location.hash"),
		sourceRevision: source.revision,
		copiedFiles: copied.files.map((file) => file.path),
		manualPreference: created.invocation,
		finalGlobalSkills: (
			await fixture.api.settings.skills.list.query({ scope: globalScope })
		).skills.map((skill) => skill.name),
		projectSourceRetained: true,
		conflictVerified: true,
		navigationGuardVerified: true,
		taskCount: 0,
		modelRequests: fixture.modelRequests,
		rendererErrors: errors,
		networkFailures,
		screenshots: [
			"skills-01-global-empty.png",
			"skills-02-project-package.png",
			"skills-03-created-renamed.png",
			"skills-04-conflict-preserved.png",
			"skills-05-persisted-after-reload.png",
		],
	};
	writeFileSync(join(runDir, "report.json"), JSON.stringify(report, null, 2));
	console.log(JSON.stringify({ ...report, artifacts: runDir }, null, 2));
}
