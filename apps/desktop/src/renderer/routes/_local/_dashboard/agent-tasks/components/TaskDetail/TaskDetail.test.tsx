import { describe, expect, test } from "bun:test";
import { taskContractSchema } from "@superset/shared/tasks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "renderer/providers/I18nProvider";
import { LOCALE_STORAGE_KEY } from "renderer/providers/I18nProvider/messages";
import { managedTaskKeys, type TaskDetailData } from "../../task-types";
import { TaskDetail } from "./TaskDetail";

// Real components + cached data; server rendering does not open Host or model connections.
const hostUrl = "http://127.0.0.1:1";
function renderDetail(
	status: NonNullable<TaskDetailData["run"]>["status"],
	completionSource: "user" | "checks" | null = null,
	deliveryStatus?: "failed" | "confirmed" | "unknown",
) {
	window.localStorage.setItem(LOCALE_STORAGE_KEY, "en-US");
	const id = crypto.randomUUID(),
		runId = crypto.randomUUID(),
		sessionId = crypto.randomUUID();
	const contract = taskContractSchema.parse({
		goal: "Fix a task UI",
		acceptance: "Original issue no longer reproduces",
	});
	const run: NonNullable<TaskDetailData["run"]> = {
		id: runId,
		taskId: id,
		contract,
		sessionId,
		fromConversation: false,
		sessionReleasedAt: null,
		initialAttachments: null,
		continuationCount: 0,
		reportRecoveryCount: 0,
		coverageRecoveryCount: 0,
		lastProgressKey: null,
		stalledContinuationCount: 0,
		cwd: "/test/repo",
		leasePath: null,
		status,
		phase: deliveryStatus
			? "delivering"
			: status === "succeeded"
				? "finished"
				: "review",
		desiredState: status === "paused" ? "paused" : "running",
		stopOutcome: null,
		acceptedRevision: null,
		deliveryRevoked: false,
		revision: 0,
		acceptanceMode: null,
		profile: null,
		effectiveStrategy: "direct",
		policyReason: null,
		baselineChanges: null,
		selectedChecks: null,
		lastFailureKey: null,
		noProgressCount: 0,
		metrics: null,
		phaseStartedAt: null,
		iteration: 0,
		repairCount: 0,
		candidateFingerprint: "fingerprint",
		commandId: `${runId}:0`,
		dispatchedAt: Date.now(),
		beforeSeq: 0,
		beforeEpoch: null,
		deadlineAt: null,
		candidate: {
			runId,
			iteration: 0,
			revision: 0,
			additionalCheckIds: [],
			outcome: "ready",
			summary: "<script>should remain plain text</script>",
			remaining: "",
		},
		instruction: null,
		reason: "Pending explicit acceptance",
		baselineRef: "ref",
		baselineFingerprint: "before",
		verifiedFingerprint: "fingerprint",
		completionSource,
		createdAt: 1,
		updatedAt: 2,
		endedAt: null,
	};
	const data: TaskDetailData = {
		task: {
			id,
			projectId: "project",
			workspaceId: "workspace",
			title: contract.goal,
			contract,
			requestHash: "hash",
			currentRunId: runId,
			createdAt: 1,
			updatedAt: 2,
		},
		run,
		runs: [run],
		checks: [],
		operations: deliveryStatus
			? [
					{
						id: crypto.randomUUID(),
						runId,
						revision: 0,
						kind: "commit",
						status: deliveryStatus,
						commitOid: deliveryStatus === "confirmed" ? "abc123" : null,
						pid: null,
						exitCode: null,
						leaseKey: null,
						error:
							deliveryStatus === "unknown"
								? "Needs actual Git reconciliation"
								: null,
						output: "<script>git-log</script>",
						createdAt: 1,
						updatedAt: 2,
						target: "refs/heads/main",
						paths: ["src/file.ts"],
						parentOid: "parent",
						treeOid: "tree",
					},
				]
			: [],
		guidance: [],
		events: [],
	};
	const query = new QueryClient({
		defaultOptions: { queries: { staleTime: Infinity, retry: false } },
	});
	query.setQueryData(managedTaskKeys.detail(hostUrl, id), data);
	try {
		return renderToStaticMarkup(
			<QueryClientProvider client={query}>
				<I18nProvider>
					<TaskDetail hostUrl={hostUrl} taskId={id} onRemoved={() => {}} />
				</I18nProvider>
			</QueryClientProvider>,
		);
	} finally {
		query.clear();
	}
}
describe("managed task result UI", () => {
	test("pending review is not presented as automatically verified", () => {
		const html = renderDetail("awaiting_review");
		expect(html).toContain("Awaiting review");
		expect(html).toContain("No automated checks recorded");
		expect(html).toContain("Reported by the agent");
		expect(html).toContain("I reviewed this result");
		expect(html).not.toContain("Accepted by explicit checks");
	});
	test("agent-authored results are escaped rather than interpreted as HTML", () => {
		const html = renderDetail("awaiting_review");
		expect(html).toContain("&lt;script&gt;");
		expect(html).not.toContain("<script>should");
	});
	test("machine and user acceptance are visibly distinct", () => {
		expect(renderDetail("succeeded", "checks")).toContain(
			"Accepted by explicit checks on unchanged inputs",
		);
		expect(renderDetail("succeeded", "user")).toContain("Accepted by the user");
	});
	test("paused task offers continuation but no acceptance or record removal", () => {
		const html = renderDetail("paused");
		expect(html).toContain("Continue task");
		expect(html).not.toContain("I reviewed this result");
		expect(html).not.toContain(">Remove task record</button>");
	});
	test("failed delivery offers Git-only retry, not an Agent continuation", () => {
		const html = renderDetail("blocked", "checks", "failed");
		expect(html).toContain("Git delivery records");
		expect(html).toContain("Retry delivery only");
		expect(html).not.toContain("Continue task");
		expect(html).not.toContain("Send guidance");
		expect(html).toContain("&lt;script&gt;git-log&lt;/script&gt;");
	});
	test("unknown Git status is explicit and not displayed as confirmed publication", () => {
		const html = renderDetail("blocked", "checks", "unknown");
		expect(html).toContain("Result unknown");
		expect(html).toContain("Reconcile Git result");
		expect(html).toContain("Needs actual Git reconciliation");
	});
});
