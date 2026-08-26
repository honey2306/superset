import { describe, expect, test } from "bun:test";
import { mailboxId } from "./relay";

const organizationId = "1887f807-99db-49c0-9568-fc085a2fd36a";
const hostId = "host-1";

describe("mailboxId", () => {
	test("preserves the legacy id when no environment namespace is provided", () => {
		expect(mailboxId(organizationId, hostId)).toBe(
			`superset:${organizationId}:${hostId}`,
		);
	});

	test("isolates development workspaces while remaining stable per workspace", () => {
		const first = mailboxId(organizationId, hostId, "development:feature-a");
		const same = mailboxId(organizationId, hostId, "development:feature-a");
		const second = mailboxId(organizationId, hostId, "development:feature-b");

		expect(first).toBe(same);
		expect(first).not.toBe(second);
	});

	test("keeps non-stable build channels separate from stable and each other", () => {
		const stable = mailboxId(organizationId, hostId);
		const canary = mailboxId(organizationId, hostId, "build:canary");
		const personal = mailboxId(organizationId, hostId, "build:personal");

		expect(canary).not.toBe(stable);
		expect(personal).not.toBe(stable);
		expect(canary).not.toBe(personal);
	});

	test("does not expose the namespace text in the mailbox id", () => {
		const namespace = "development:/Users/alice/private-worktree";
		const result = mailboxId(organizationId, hostId, namespace);

		expect(result).not.toContain(namespace);
		expect(result).not.toContain("private-worktree");
		expect(result).toMatch(
			new RegExp(`^superset:${organizationId}:${hostId}:n[0-9a-f]{16}$`),
		);
	});
});
