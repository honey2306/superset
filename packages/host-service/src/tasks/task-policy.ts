import type {
	EffectiveTaskStrategy,
	TaskContract,
	TaskProfileSnapshot,
	TaskRequirement,
	TaskStrategy,
} from "@superset/shared/tasks";

export function resolveTaskStrategy(
	contract: TaskContract,
): Exclude<TaskStrategy, "auto"> {
	if (contract.strategy !== "auto") return contract.strategy;
	// Rules select an initial budget, not a verdict about actual complexity.
	if (
		/(迁移|鉴权|生产|跨模块|重构|偶发|migration|auth(?:entication|orization)|production|intermittent)/i.test(
			`${contract.goal}\n${contract.acceptance}`,
		)
	)
		return "deep";
	return contract.checks.length > 1 ? "standard" : "direct";
}

export function taskPrompt(input: {
	runId: string;
	iteration: number;
	contract: TaskContract;
	instruction?: string | null;
	revision?: number;
	strategy?: EffectiveTaskStrategy;
	profile?: TaskProfileSnapshot | null;
	guidance?: string;
	requirements?: TaskRequirement[];
}): string {
	const strategy = input.strategy ?? resolveTaskStrategy(input.contract);
	const guidance =
		strategy === "direct"
			? "Start directly. Read only relevant context. Do not add a separate planning, delegation or review phase."
			: strategy === "standard"
				? "Use a brief plan only when useful; investigate, implement and verify in this session."
				: "Investigate uncertain/high-impact behavior carefully; use a concise plan and targeted reproduction. Stay in this session.";
	return [
		`You are executing a Superset managed task. Run ${input.runId}, iteration ${input.iteration}, requirements revision ${input.revision ?? 0}.`,
		guidance,
		"Execute autonomously within the goal. Preserve pre-existing edits. Do not commit, push, deploy, change branches, discard changes, launch other agents, or leave background processes. These delivery operations are NOT authorized to the Agent by this task runtime. This managed scope applies only while get_task reports an active Task; it is not a permanent restriction on future ordinary chat.",
		"Do not weaken tests or acceptance criteria to make checks pass. Never claim a command ran without actually running it.",
		input.contract.delivery?.mode && input.contract.delivery.mode !== "none"
			? "The Host will handle authorized Git delivery AFTER acceptance. Use native write/edit tools for all file changes so it can prove before/after ownership; Shell-only mutations cannot be automatically committed. Never perform Git publishing yourself."
			: "",
		"Before ending, call report_task_result with this runId, iteration and current revision. Use outcome continue with concrete remaining work for an unfinished stage, blocked for a genuine missing prerequisite, or ready only after addressing the goal. Include criteria for EACH requirement: id, status satisfied/unfinished/unverified, an honest evidence rationale, and checkIds (task:N or project:ID) ONLY when that approved check genuinely covers the requirement. Passing static checks does not prove unrelated runtime behavior. Criteria are claims; the Host runs the referenced checks and owns acceptance. Missing evidence must remain unverified, not guessed. Do not stop at a plan or ask the user to say continue.",
		`Requirement IDs (assess the entire description, not a convenient subset):\n${(input.requirements ?? [{ id: "goal", description: input.contract.goal }, ...(input.contract.acceptance ? [{ id: "acceptance", description: input.contract.acceptance }] : [])]).map((item) => `${item.id}: ${item.description}`).join("\n")}`,
		`Goal:\n${input.contract.goal}`,
		input.contract.acceptance
			? `Acceptance requirements:\n${input.contract.acceptance}`
			: "",
		input.contract.checks.length
			? `The Host will run these explicit acceptance checks after you finish; avoid duplicating them unless needed for diagnosis:\n${input.contract.checks.map((check, index) => `task:${index} — ${check.name}: ${check.command}`).join("\n")}`
			: input.profile?.config.checks.length
				? "The Host chooses approved project checks from actual input changes; do not run every project check automatically yourself."
				: "Use the smallest relevant validation. There are no explicit automated acceptance checks; the result will remain pending user review rather than being marked verified.",
		input.profile
			? `Project verification profile revision ${input.profile.revision}:
${input.profile.config.instructions}
Approved check index (the Host selects applicable checks automatically; call get_task only if their command/path details are needed for diagnosis or additionalCheckIds):
${input.profile.config.checks.map((check) => `project:${check.id}: ${check.name}`).join("\n")}`
			: "",
		input.guidance
			? `Persisted user guidance and added constraints (all original requirements still apply):
${input.guidance}`
			: "",
		input.instruction
			? `Continue from the current changes and context. Latest instruction / actual verification failure:\n${input.instruction}`
			: "",
	]
		.filter(Boolean)
		.join("\n\n");
}

export function adaptTaskStrategy(input: {
	contract: TaskContract;
	paths: string[] | null;
	repairCount: number;
}): { strategy: EffectiveTaskStrategy; reason: string } {
	if (input.contract.strategy !== "auto")
		return {
			strategy: input.contract.strategy,
			reason:
				"Explicit strategy preference; required acceptance checks are unchanged",
		};
	const initial = resolveTaskStrategy(input.contract);
	if (
		initial === "deep" ||
		input.repairCount >= 2 ||
		input.paths?.some((path) =>
			/(?:^|\/)(?:auth|migrations?|permissions?)(?:\/|\.)/i.test(path),
		)
	)
		return {
			strategy: "deep",
			reason:
				input.repairCount >= 2
					? "Repeated failures require deeper diagnosis and broader checks"
					: "High-impact requirements or changed paths",
		};
	if (
		input.paths === null ||
		input.repairCount > 0 ||
		input.paths.length > 6 ||
		new Set(input.paths.map((path) => path.split("/")[0])).size > 2
	)
		return {
			strategy: "standard",
			reason:
				input.repairCount > 0
					? "Actual verification failed; strengthen diagnosis in the same session"
					: "Broader or uncertain changed inputs",
		};
	return {
		strategy: initial,
		reason: "Localized changes; keep the smallest sufficient execution path",
	};
}
