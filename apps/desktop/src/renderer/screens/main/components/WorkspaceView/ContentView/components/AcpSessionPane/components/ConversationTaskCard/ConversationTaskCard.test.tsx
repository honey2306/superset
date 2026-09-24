import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "renderer/providers/I18nProvider";
import { LOCALE_STORAGE_KEY } from "renderer/providers/I18nProvider/messages";
import type { ConversationTaskController } from "../../hooks/useConversationTask";
import { ConversationTaskMode } from "../ConversationTaskMode";
import { ConversationTaskCard } from "./ConversationTaskCard";

// Rendering-only fixture: backend/admission/continuation are exercised by the
// real HTTP/daemon test, not mocked into claims about execution here.
function controller(
	status = "running",
	unverified = false,
): ConversationTaskController {
	const run = {
		id: "run",
		taskId: "task",
		sessionId: "same-session",
		status,
		phase: status === "succeeded" ? "finished" : "executing",
		continuationCount: 1,
		contract: {
			goal: "Implement the current discussion",
			acceptance: "Original behavior works",
		},
		candidate: {
			criteria: [
				{
					id: "acceptance",
					status: unverified ? "unverified" : "satisfied",
					evidence: unverified
						? "Browser scenario was not run"
						: "Actual observation available",
					checkIds: [],
				},
			],
		},
		reason: null,
	};
	return {
		run,
		owned: run,
		active: status === "succeeded" ? null : run,
		supported: true,
		taskMode: status !== "succeeded",
		canChooseMode: status === "succeeded",
		busy: false,
		blocked: false,
		error: null,
		query: { error: null, refetch: async () => {} },
		data: { task: { title: "Current conversation goal" }, checks: [] },
		kind: "guidance",
		setKind: () => {},
		chooseMode: () => {},
		control: async () => {},
	} as unknown as ConversationTaskController;
}
function render(node: React.ReactNode) {
	window.localStorage.setItem(LOCALE_STORAGE_KEY, "en-US");
	return renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);
}
describe("Task is an inline conversation mode", () => {
	test("mode selector does not require project/model/session creation forms", () => {
		const task = controller("succeeded");
		const html = render(<ConversationTaskMode task={task} />);
		expect(html).toContain("Chat");
		expect(html).toContain("Conversation mode");
		expect(html).toContain('aria-haspopup="menu"');
		expect(html).not.toContain("Select a project");
		expect(html).not.toContain("New Session");
	});
	test("running task uses an inline progress/control card, not a second composer", () => {
		const html = render(<ConversationTaskCard task={controller()} />);
		expect(html).toContain("Task progress");
		expect(html).toContain("Cancel task");
		expect(html).toContain("Goal, checks and coverage");
		expect(html).not.toContain("contenteditable");
	});
	test("unverified model rationale is visibly distinct from a real check result", () => {
		const html = render(
			<ConversationTaskCard task={controller("awaiting_review", true)} />,
		);
		expect(html).toContain("Unverified");
		expect(html).toContain("Browser scenario was not run");
		expect(html).toContain("reported by Agent");
		expect(html).not.toContain("Accepted by explicit checks");
	});
	test("terminal task provides return-to-chat rather than forcing a new window", () => {
		const html = render(
			<ConversationTaskCard task={controller("succeeded")} />,
		);
		expect(html).toContain("Return to chat");
		expect(html).not.toContain("Cancel task");
		expect(html).toContain("Task overview");
	});
});
