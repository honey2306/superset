import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function source(name: string): string {
	return readFileSync(
		fileURLToPath(new URL(`./${name}`, import.meta.url)),
		"utf8",
	);
}

test("session and workspace back links expose a full mobile touch target", () => {
	expect(source("session.tsx")).toContain('className="mobile-session-back"');
	expect(source("workspace.tsx")).toContain(
		'className="mobile-workspace-back"',
	);
	const styles = readFileSync(
		fileURLToPath(new URL("../styles.css", import.meta.url)),
		"utf8",
	);
	expect(styles).toContain(".mobile-session-back,");
	expect(styles).toContain("width: 44px;");
	expect(styles).toContain("height: 44px;");
});

test("session timeline is the bounded scroll region on small screens", () => {
	const session = source("session.tsx");
	expect(session).toContain("overflow-hidden px-3");
	expect(session).toContain(
		"mobile-session-scroll no-scrollbar min-h-0 flex-1 overflow-y-auto",
	);
	expect(session).not.toContain('style={{ scrollBehavior: "smooth" }}');
});

test("session progressively loads every retained conversation page", () => {
	const session = source("session.tsx");
	expect(session).toContain("session.hasOlder");
	expect(session).toContain("session.isLoadingOlder");
	expect(session).toContain("session.historyError");
	expect(session).toContain("void session.loadOlder()");
});

test("session collapses execution details and shows Working duration", () => {
	const timeline = source("../components/Timeline/TimelineView.tsx");
	const turn = source(
		"../components/Timeline/components/TimelineTurn/TimelineTurn.tsx",
	);
	const working = source("../components/Timeline/WorkingIndicator.tsx");
	expect(timeline).toContain("groupTimelineTurns(timeline.items)");
	expect(turn).toContain('item.kind === "tool_call" && !expanded');
	expect(turn).toContain("<ExecutionSummary");
	expect(working).toContain("getWorkingIndicatorDuration");
	expect(working).toContain("setInterval");
});

test("new conversation uses touch-friendly agent cards and one primary action", () => {
	const workspace = source("workspace.tsx");
	expect(workspace).toContain("Choose your agent");
	expect(workspace).toContain('type="radio"');
	expect(workspace).toContain("mobile-agent-option");
	expect(workspace).toContain("mobile-start-conversation");
	expect(workspace).toContain("Start with");
	expect(workspace).not.toContain("<select");
});

test("terminal back navigation returns to the current workspace", () => {
	const terminal = source("terminal.tsx");
	expect(terminal).toContain("workspaceId");
	expect(terminal).toContain(
		["/w/${", "encodeURIComponent(workspaceId)}"].join(""),
	);
	expect(terminal).not.toContain('to={getPhoneRoute("/")}');
});

test("phone forget action states that it only clears this phone", () => {
	const workspaces = source("workspaces.tsx");
	expect(workspaces).toContain("Forget on this phone");
	expect(workspaces).toContain("The desktop session stays active.");
});

test("phone home renders one chronological conversation list instead of a tree", () => {
	const workspaces = source("workspaces.tsx");
	expect(workspaces).toContain("buildConversationList(projects)");
	expect(workspaces).toContain("<ConversationList");
	expect(workspaces).toContain("<h1>Conversations</h1>");
	expect(workspaces).not.toContain("<ProjectTree");
});

test("phone home bounds the page so the conversation list owns scrolling", () => {
	const styles = readFileSync(
		fileURLToPath(new URL("../styles.css", import.meta.url)),
		"utf8",
	);
	expect(styles).toMatch(
		/\.mobile-projects-page\s*\{[^}]*?min-height:\s*100dvh;[^}]*?height:\s*100dvh;/,
	);
	expect(styles).toMatch(
		/\.mobile-projects-tree\s*\{[^}]*?min-height:\s*0;[^}]*?flex:\s*1;[^}]*?overflow-y:\s*auto;/,
	);
});

test("does not show a doomed AutoMate pairing form without relay context", () => {
	const pair = source("pair.tsx");
	expect(pair).toContain("const canRedeem = canRedeemPairing({");
	expect(pair).toContain("{canRedeem ? (");
	expect(pair).toContain("if (initialCode && canRedeem)");
	expect(pair).toContain("AUTOMATE_PAIRING_LINK_REQUIRED_MESSAGE");
});

test("phone app exposes ACP routes only and does not fetch terminal tabs", () => {
	const app = source("../app.tsx");
	const workspace = source("workspace.tsx");
	const workspaces = source("workspaces.tsx");
	expect(app).not.toContain("TerminalRoute");
	expect(app).not.toContain("w/:workspaceId/t/:terminalId");
	expect(workspace).not.toContain("terminalAgents");
	expect(workspace).not.toContain("terminalSessions");
	expect(workspaces).not.toContain("terminalAgents.listByWorkspace");
	expect(workspaces).not.toContain("terminal.listSessions");
});
