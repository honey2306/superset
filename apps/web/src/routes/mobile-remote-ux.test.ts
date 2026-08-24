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

test("does not show a doomed AutoMate pairing form without relay context", () => {
	const pair = source("pair.tsx");
	expect(pair).toContain("const canRedeem = canRedeemPairing({");
	expect(pair).toContain("{canRedeem ? (");
	expect(pair).toContain("if (initialCode && canRedeem)");
	expect(pair).toContain("AUTOMATE_PAIRING_LINK_REQUIRED_MESSAGE");
});
