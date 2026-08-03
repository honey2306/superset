import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { generateFriendlyBranchName } from "@superset/shared/workspace-launch";
import { TRPCError } from "@trpc/server";
import {
	asRemoteRef,
	type ResolvedRef,
	resolveDefaultBranchName,
	resolveRef,
	resolveUpstream,
} from "../../runtime/git";
import { ensureMainWorkspaceStrict } from "../../trpc/router/project/utils/ensure-main-workspace";
import { getHostWorktreeBaseDir } from "../../trpc/router/settings/worktree-location";
import { adoptExistingWorktree } from "../../trpc/router/workspace-creation/shared/adopt-existing-worktree";
import {
	getWorktreeBranchAtPath,
	listWorktreeBranches,
} from "../../trpc/router/workspace-creation/shared/branch-search";
import { enablePushAutoSetupRemote } from "../../trpc/router/workspace-creation/shared/git-config";
import { requireLocalProject } from "../../trpc/router/workspace-creation/shared/local-project";
import type { GitClient } from "../../trpc/router/workspace-creation/shared/types";
import { safeResolveWorktreePath } from "../../trpc/router/workspace-creation/shared/worktree-paths";
import { generateBranchNameFromPrompt } from "../../trpc/router/workspace-creation/utils/ai-branch-name";
import { resolveProjectBranchPrefix } from "../../trpc/router/workspace-creation/utils/branch-prefix";
import {
	type MaterializePrBranchResult,
	materializePrBranch,
	normalizePrBranchTracking,
	PrBranchConflictError,
} from "../../trpc/router/workspace-creation/utils/pr-branch-materialize";
import { derivePrLocalBranchName } from "../../trpc/router/workspace-creation/utils/pr-branch-name";
import { resolveStartPoint } from "../../trpc/router/workspace-creation/utils/resolve-start-point";
import { deduplicateBranchName } from "../../trpc/router/workspace-creation/utils/sanitize-branch";
import type { HostServiceContext } from "../../types";
import { canonicalizeHostPath } from "../../workspace-catalog/canonical-path";
import type { RunnerArtifact } from "../workspace-provisioning";
import {
	runReconciledSourceStep,
	runSourceStep,
	type SourceHandlerContext,
} from "./types";

export interface GitMaterializationResult {
	workspaceId: string;
	disposition: "created" | "adopted" | "reused" | "repaired";
	artifacts: RunnerArtifact[];
}

interface BranchSourcePlan {
	branch: string;
	startPoint: ResolvedRef;
	usedExistingBranch: boolean;
	baseBranch: string | undefined;
}

interface WorktreeReceipt {
	worktreePath: string;
	ownership: "created" | "adopted";
}

interface PrMetadata {
	number: number;
	url: string;
	title: string;
	headRefName: string;
	headRefOid: string;
	baseRefName: string;
	headRepositoryOwner: string;
	headRepositoryName: string;
	isCrossRepository: boolean;
	state: "open" | "closed" | "merged";
}

/**
 * Direct host-side Git materialization for an existing Project. This is the
 * provisioning implementation. Retries reconcile durable receipts instead of
 * re-running Git materialization blindly.
 */
export async function materializeExistingProjectSource(
	context: SourceHandlerContext,
): Promise<GitMaterializationResult> {
	const { request } = context;
	if (request.project.kind !== "existing") {
		throw new Error(
			"materializeExistingProjectSource requires an existing project",
		);
	}

	const project = requireLocalProject(context.ctx, request.project.projectId);
	const git = await context.ctx.git(project.repoPath);
	await ensureMainAndPrune(context, project.id, project.repoPath, git);

	switch (request.source.kind) {
		case "branch":
			return materializeBranch(context, {
				projectId: project.id,
				project,
				git,
				branchSource: request.source,
			});
		case "worktree":
			return materializeAdoptedWorktree(context, {
				projectId: project.id,
				git,
				path: request.source.path,
				expectedBranch: request.source.expectedBranch,
			});
		case "pull-request":
			return materializePullRequest(context, {
				projectId: project.id,
				project,
				git,
				number: request.source.number,
			});
		case "main":
			throw new Error("main source is handled by existingProjectHandler");
	}
}

async function ensureMainAndPrune(
	context: SourceHandlerContext,
	projectId: string,
	repoPath: string,
	git: GitClient,
): Promise<void> {
	await runSourceStep(context, "ensure-main", { projectId }, async () => {
		const main = await ensureMainWorkspaceStrict(
			context.ctx,
			projectId,
			repoPath,
		);
		return { workspaceId: main.id };
	});
	await runSourceStep(context, "prune", { projectId }, async () => {
		await git.raw(["worktree", "prune"]);
		return { pruned: true };
	});
}

async function materializeBranch(
	context: SourceHandlerContext,
	args: {
		projectId: string;
		project: ReturnType<typeof requireLocalProject>;
		git: GitClient;
		branchSource: Extract<
			SourceHandlerContext["request"]["source"],
			{ kind: "branch" }
		>;
	},
): Promise<GitMaterializationResult> {
	const { request } = context;
	const plan = await runSourceStep(
		context,
		"resolve",
		{
			projectId: args.projectId,
			branchKind: args.branchSource.name.kind,
			from:
				args.branchSource.from.kind === "ref"
					? args.branchSource.from.value
					: "default",
		},
		async () =>
			planBranchSource(args.git, args.branchSource, context.ctx, args.project),
	);

	const existing = findWorkspaceByBranch(
		context.ctx,
		args.projectId,
		plan.branch,
	);
	if (existing) {
		return finishCatalogStep({
			workspaceId: existing.id,
			disposition: "reused",
			artifacts: [],
		});
	}

	const worktreePath = safeResolveWorktreePath(
		args.project.id,
		plan.branch,
		args.project.worktreeBaseDir ?? getHostWorktreeBaseDir(context.ctx),
	);
	mkdirSync(dirname(worktreePath), { recursive: true });

	const worktree = await runReconciledSourceStep<WorktreeReceipt>(
		context,
		"worktree-add",
		{ branch: plan.branch, worktreePath },
		async (receipt) =>
			(await getWorktreeBranchAtPath(args.git, receipt.worktreePath)) ===
			plan.branch,
		async () => {
			const existingPath = (
				await listWorktreeBranches(args.git)
			).worktreeMap.get(plan.branch);
			if (existingPath) {
				return { worktreePath: existingPath, ownership: "adopted" };
			}
			await addBranchWorktree(args.git, plan, worktreePath);
			return { worktreePath, ownership: "created" };
		},
	);
	const worktreeArtifact: RunnerArtifact = {
		kind: "worktree",
		identity: worktree.worktreePath,
		ownership: worktree.ownership,
	};
	if (worktree.ownership === "created") {
		context.journal.recordArtifacts(context.operationId, [worktreeArtifact]);
	}

	await runSourceStep(
		context,
		"configure",
		{
			branch: plan.branch,
			baseBranch: plan.baseBranch ?? null,
			worktreePath: worktree.worktreePath,
		},
		async () => {
			await enablePushAutoSetupRemote(
				args.git,
				worktree.worktreePath,
				"[workspace-provisioning]",
			);
			if (plan.baseBranch) {
				await args.git
					.raw([
						"-C",
						worktree.worktreePath,
						"config",
						`branch.${plan.branch}.base`,
						plan.baseBranch,
					])
					.catch((err) =>
						console.warn(
							`[workspace-provisioning] failed to record base branch ${plan.baseBranch}`,
							err,
						),
					);
			}
			return { configured: true };
		},
	);

	const catalog = await catalogWorkspace(context, {
		projectId: args.projectId,
		branch: plan.branch,
		worktreePath: worktree.worktreePath,
		name: request.display?.name ?? plan.branch,
		baseBranch: plan.baseBranch,
	});
	return finishCatalogStep({
		workspaceId: catalog.workspaceId,
		disposition: catalog.disposition,
		artifacts: [worktreeArtifact],
	});
}

async function materializeAdoptedWorktree(
	context: SourceHandlerContext,
	args: {
		projectId: string;
		git: GitClient;
		path: string;
		expectedBranch: string | undefined;
	},
): Promise<GitMaterializationResult> {
	const resolved = await runReconciledSourceStep<{
		branch: string;
		worktreePath: string;
	}>(
		context,
		"resolve-worktree",
		{ projectId: args.projectId, worktreePath: args.path },
		async (receipt) =>
			(await getWorktreeBranchAtPath(args.git, receipt.worktreePath)) ===
			receipt.branch,
		async () => {
			const branch = await getWorktreeBranchAtPath(args.git, args.path);
			if (!branch) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `No branch-checked git worktree registered at "${args.path}"`,
				});
			}
			if (args.expectedBranch && args.expectedBranch !== branch) {
				throw new TRPCError({
					code: "CONFLICT",
					message: `Worktree at "${args.path}" is on ${branch}, not ${args.expectedBranch}`,
				});
			}
			return { branch, worktreePath: args.path };
		},
	);

	await runSourceStep(
		context,
		"configure",
		{ branch: resolved.branch, worktreePath: resolved.worktreePath },
		async () => {
			await enablePushAutoSetupRemote(
				args.git,
				resolved.worktreePath,
				"[workspace-provisioning]",
			);
			return { configured: true };
		},
	);
	const catalog = await catalogWorkspace(context, {
		projectId: args.projectId,
		branch: resolved.branch,
		worktreePath: resolved.worktreePath,
		name: context.request.display?.name ?? resolved.branch,
	});
	return finishCatalogStep({
		workspaceId: catalog.workspaceId,
		disposition:
			catalog.disposition === "created" ? "adopted" : catalog.disposition,
		artifacts: [
			{
				kind: "worktree",
				identity: resolved.worktreePath,
				ownership: "adopted",
			},
		],
	});
}

async function materializePullRequest(
	context: SourceHandlerContext,
	args: {
		projectId: string;
		project: ReturnType<typeof requireLocalProject>;
		git: GitClient;
		number: number;
	},
): Promise<GitMaterializationResult> {
	const { request } = context;
	const metadata = await runSourceStep(
		context,
		"resolve-pr",
		{ projectId: args.projectId, number: args.number },
		() =>
			fetchPrMetadata({
				cwd: args.project.repoPath,
				prNumber: args.number,
				ctx: context.ctx,
			}),
	);
	const branch = derivePrLocalBranchName(metadata);
	const existing = findWorkspaceByBranch(context.ctx, args.projectId, branch);
	if (existing) {
		return finishCatalogStep({
			workspaceId: existing.id,
			disposition: "reused",
			artifacts: [],
		});
	}

	const prepared = await runReconciledSourceStep<{
		branch: string;
		materialized: MaterializePrBranchResult;
	}>(
		context,
		"prepare-branch",
		{ projectId: args.projectId, branch, number: args.number },
		async (receipt) =>
			(await getLocalBranchHead(args.git, receipt.branch)) ===
			metadata.headRefOid,
		async () => {
			const localOid = await getLocalBranchHead(args.git, branch);
			try {
				const materialized =
					localOid !== null &&
					localOid.toLowerCase() === metadata.headRefOid.toLowerCase()
						? await normalizePrBranchTracking({
								git: args.git,
								branch,
								remoteName: args.project.remoteName ?? "origin",
								pr: metadata,
							})
						: await materializePrBranch({
								git: args.git,
								branch,
								remoteName: args.project.remoteName ?? "origin",
								pr: metadata,
							});
				return { branch, materialized };
			} catch (err) {
				throw new TRPCError({
					code:
						err instanceof PrBranchConflictError
							? "CONFLICT"
							: "INTERNAL_SERVER_ERROR",
					message:
						err instanceof Error ? err.message : "Failed to prepare PR branch",
				});
			}
		},
	);
	const branchArtifact: RunnerArtifact = {
		kind: "branch",
		identity: branch,
		ownership: prepared.materialized.createdBranch ? "created" : "adopted",
		expectedHeadSha: metadata.headRefOid,
	};
	if (prepared.materialized.createdBranch) {
		context.journal.recordArtifacts(context.operationId, [branchArtifact]);
	}

	const worktreePath = safeResolveWorktreePath(
		args.project.id,
		branch,
		args.project.worktreeBaseDir ?? getHostWorktreeBaseDir(context.ctx),
	);
	mkdirSync(dirname(worktreePath), { recursive: true });
	const worktree = await runReconciledSourceStep<WorktreeReceipt>(
		context,
		"worktree-add",
		{ branch, worktreePath },
		async (receipt) =>
			(await getWorktreeBranchAtPath(args.git, receipt.worktreePath)) ===
			branch,
		async () => {
			const existingPath = (
				await listWorktreeBranches(args.git)
			).worktreeMap.get(branch);
			if (existingPath)
				return { worktreePath: existingPath, ownership: "adopted" };
			await args.git.raw(["worktree", "add", worktreePath, branch]);
			return { worktreePath, ownership: "created" };
		},
	);
	const worktreeArtifact: RunnerArtifact = {
		kind: "worktree",
		identity: worktree.worktreePath,
		ownership: worktree.ownership,
	};
	if (worktree.ownership === "created") {
		context.journal.recordArtifacts(context.operationId, [worktreeArtifact]);
	}

	await runSourceStep(
		context,
		"configure",
		{
			branch,
			worktreePath: worktree.worktreePath,
			baseBranch: metadata.baseRefName,
		},
		async () => {
			await enablePushAutoSetupRemote(
				args.git,
				worktree.worktreePath,
				"[workspace-provisioning]",
			);
			if (metadata.baseRefName) {
				await args.git.raw([
					"-C",
					worktree.worktreePath,
					"config",
					`branch.${branch}.base`,
					metadata.baseRefName,
				]);
			}
			return { configured: true };
		},
	);

	const catalog = await catalogWorkspace(context, {
		projectId: args.projectId,
		branch,
		worktreePath: worktree.worktreePath,
		name: request.display?.name ?? metadata.title ?? branch,
		baseBranch: metadata.baseRefName,
	});
	return finishCatalogStep({
		workspaceId: catalog.workspaceId,
		disposition: catalog.disposition,
		artifacts: [branchArtifact, worktreeArtifact],
	});
}

async function catalogWorkspace(
	context: SourceHandlerContext,
	args: {
		projectId: string;
		branch: string;
		worktreePath: string;
		name: string;
		baseBranch?: string;
	},
): Promise<{
	workspaceId: string;
	disposition: GitMaterializationResult["disposition"];
}> {
	return runReconciledSourceStep(
		context,
		"materialize",
		{
			projectId: args.projectId,
			branch: args.branch,
			worktreePath: args.worktreePath,
		},
		async (output: {
			workspaceId: string;
			disposition: GitMaterializationResult["disposition"];
		}) => {
			const row = context.ctx.db.query.workspaces
				.findFirst({
					where: (workspace, { eq }) => eq(workspace.id, output.workspaceId),
				})
				.sync();
			return (
				row?.projectId === args.projectId &&
				row.branch === args.branch &&
				canonicalizeHostPath(row.worktreePath) ===
					canonicalizeHostPath(args.worktreePath)
			);
		},
		async () => {
			const result = await adoptExistingWorktree({
				ctx: context.ctx,
				git: await context.ctx.git(
					context.ctx.db.query.projects
						.findFirst({
							where: (project, { eq }) => eq(project.id, args.projectId),
						})
						.sync()?.repoPath ?? args.worktreePath,
				),
				projectId: args.projectId,
				branch: args.branch,
				worktreePath: args.worktreePath,
				workspaceName: args.name,
				baseBranch: args.baseBranch,
			});
			return {
				workspaceId: result.workspace.id,
				disposition: result.alreadyExists ? "adopted" : "created",
			};
		},
	);
}

async function finishCatalogStep(args: {
	workspaceId: string;
	disposition: GitMaterializationResult["disposition"];
	artifacts: RunnerArtifact[];
}): Promise<GitMaterializationResult> {
	return {
		workspaceId: args.workspaceId,
		disposition: args.disposition,
		artifacts: args.artifacts,
	};
}

function findWorkspaceByBranch(
	ctx: HostServiceContext,
	projectId: string,
	branch: string,
): { id: string } | undefined {
	return ctx.db.query.workspaces
		.findFirst({
			where: (workspace, { and, eq }) =>
				and(eq(workspace.projectId, projectId), eq(workspace.branch, branch)),
		})
		.sync();
}

async function planBranchSource(
	git: GitClient,
	source: Extract<
		SourceHandlerContext["request"]["source"],
		{ kind: "branch" }
	>,
	ctx: HostServiceContext,
	project: ReturnType<typeof requireLocalProject>,
): Promise<BranchSourcePlan> {
	const existingBranches = await listBranchNamesForGit(git);
	const requestedBranch =
		source.name.kind === "explicit"
			? source.name.value
			: ((source.name.prompt
					? await generateBranchNameFromPrompt(
							source.name.prompt,
							existingBranches,
						)
					: null) ?? generateFriendlyBranchName());
	const resolved = await resolveRef(git, requestedBranch);
	if (resolved?.kind === "tag") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `"${requestedBranch}" is a tag, not a branch — cannot check out into a workspace`,
		});
	}
	if (
		resolved &&
		(resolved.kind === "local" || resolved.kind === "remote-tracking")
	) {
		return {
			branch: resolved.shortName,
			startPoint: resolved,
			usedExistingBranch: true,
			baseBranch: undefined,
		};
	}

	let startPoint = await resolveStartPoint(
		git,
		source.from.kind === "ref" ? source.from.value : undefined,
	);
	if (startPoint.kind === "local") {
		const defaultBranchName = await resolveDefaultBranchName(git);
		if (startPoint.shortName === defaultBranchName) {
			const upstream = await resolveUpstream(git, defaultBranchName);
			if (upstream) {
				const remoteRef = asRemoteRef(upstream.remote, upstream.remoteBranch);
				const remoteExists = await git
					.raw(["rev-parse", "--verify", `${remoteRef}^{commit}`])
					.then((output) => /^[0-9a-f]{40,}/.test(output.trim()))
					.catch(() => false);
				if (remoteExists) {
					startPoint = {
						kind: "remote-tracking",
						fullRef: remoteRef,
						shortName: upstream.remoteBranch,
						remote: upstream.remote,
						remoteShortName: `${upstream.remote}/${upstream.remoteBranch}`,
					};
				}
			}
		}
	}
	if (startPoint.kind === "remote-tracking") {
		await git
			.fetch([startPoint.remote, startPoint.shortName, "--quiet", "--no-tags"])
			.catch((err) =>
				console.warn(
					`[workspace-provisioning] fetch ${startPoint.remoteShortName} failed`,
					err,
				),
			);
	}

	const prefix = await resolveProjectBranchPrefix({
		ctx,
		project,
		git,
		existingBranches,
	});
	const branch = prefix
		? deduplicateBranchName(`${prefix}/${requestedBranch}`, existingBranches)
		: deduplicateBranchName(requestedBranch, existingBranches);
	return {
		branch,
		startPoint,
		usedExistingBranch: false,
		baseBranch: startPoint.kind === "head" ? undefined : startPoint.shortName,
	};
}

async function listBranchNamesForGit(git: GitClient): Promise<string[]> {
	try {
		const raw = await git.raw([
			"for-each-ref",
			"--format=%(refname)",
			"refs/heads/",
			"refs/remotes/origin/",
		]);
		return raw
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((ref) =>
				ref.startsWith("refs/heads/")
					? ref.slice("refs/heads/".length)
					: ref.slice("refs/remotes/origin/".length),
			)
			.filter((branch) => branch !== "HEAD");
	} catch {
		return [];
	}
}

async function addBranchWorktree(
	git: GitClient,
	plan: BranchSourcePlan,
	worktreePath: string,
): Promise<void> {
	if (plan.usedExistingBranch) {
		await git.raw(
			plan.startPoint.kind === "remote-tracking"
				? [
						"worktree",
						"add",
						"--track",
						"-b",
						plan.branch,
						worktreePath,
						plan.startPoint.remoteShortName,
					]
				: [
						"worktree",
						"add",
						worktreePath,
						plan.startPoint.kind === "head"
							? "HEAD"
							: plan.startPoint.shortName,
					],
		);
		return;
	}
	const startPointArg =
		plan.startPoint.kind === "head"
			? "HEAD"
			: plan.startPoint.kind === "remote-tracking"
				? plan.startPoint.remoteShortName
				: plan.startPoint.shortName;
	await git.raw([
		"worktree",
		"add",
		"--no-track",
		"-b",
		plan.branch,
		worktreePath,
		startPointArg,
	]);
}

async function getLocalBranchHead(
	git: GitClient,
	branch: string,
): Promise<string | null> {
	try {
		const output = await git.raw([
			"rev-parse",
			"--verify",
			`refs/heads/${branch}^{commit}`,
		]);
		const sha = output.trim();
		return /^[0-9a-f]{40,}$/i.test(sha) ? sha : null;
	} catch {
		return null;
	}
}

async function fetchPrMetadata(args: {
	cwd: string;
	prNumber: number;
	ctx: HostServiceContext;
}): Promise<PrMetadata> {
	const parsed = (await args.ctx.execGh(
		[
			"pr",
			"view",
			String(args.prNumber),
			"--json",
			"number,url,title,headRefName,headRefOid,baseRefName,headRepositoryOwner,headRepository,isCrossRepository,state",
		],
		{ cwd: args.cwd, timeout: 30_000 },
	)) as {
		number: number;
		url: string;
		title: string;
		headRefName: string;
		headRefOid: string;
		baseRefName: string;
		headRepositoryOwner: { login: string } | null;
		headRepository: { name: string } | null;
		isCrossRepository: boolean;
		state: string;
	};
	const state = parsed.state.toLowerCase();
	return {
		number: parsed.number,
		url: parsed.url,
		title: parsed.title,
		headRefName: parsed.headRefName,
		headRefOid: parsed.headRefOid,
		baseRefName: parsed.baseRefName,
		headRepositoryOwner: parsed.headRepositoryOwner?.login ?? "",
		headRepositoryName: parsed.headRepository?.name ?? "",
		isCrossRepository: parsed.isCrossRepository,
		state: state === "open" ? "open" : state === "merged" ? "merged" : "closed",
	};
}
