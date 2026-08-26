import { describe, expect, test } from "bun:test";
import { getRelayMailboxNamespace } from "./env.shared";

describe("getRelayMailboxNamespace", () => {
	test("leaves packaged stable builds on the legacy mailbox", () => {
		expect(
			getRelayMailboxNamespace({
				isPackaged: true,
				buildChannel: "stable",
				workspaceName: "ignored-workspace",
			}),
		).toBeUndefined();
	});

	test("gives each development workspace a stable namespace", () => {
		expect(
			getRelayMailboxNamespace({
				isPackaged: false,
				buildChannel: "stable",
				workspaceName: "Feature/One",
			}),
		).toBe("development:feature-one");
		expect(
			getRelayMailboxNamespace({
				isPackaged: false,
				buildChannel: "stable",
				workspaceName: "Feature/Two",
			}),
		).not.toBe("development:feature-one");
	});

	test("isolates packaged canary and personal channels", () => {
		expect(
			getRelayMailboxNamespace({
				isPackaged: true,
				buildChannel: "canary",
			}),
		).toBe("build:canary");
		expect(
			getRelayMailboxNamespace({
				isPackaged: true,
				buildChannel: "personal",
			}),
		).toBe("build:personal");
	});
});
