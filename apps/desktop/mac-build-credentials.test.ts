import { describe, expect, test } from "bun:test";
import { shouldNotarizeMacBuild } from "./mac-build-credentials";

describe("shouldNotarizeMacBuild", () => {
	test("disables notarization when release credentials are absent", () => {
		expect(shouldNotarizeMacBuild({})).toBe(false);
	});

	test("disables notarization when a credential set is incomplete", () => {
		expect(
			shouldNotarizeMacBuild({
				CSC_LINK: "certificate",
				CSC_KEY_PASSWORD: "password",
				APPLE_ID: "apple@example.com",
				APPLE_APP_SPECIFIC_PASSWORD: "app-password",
			}),
		).toBe(false);
	});

	test("enables notarization when signing and Apple credentials are complete", () => {
		expect(
			shouldNotarizeMacBuild({
				CSC_LINK: "certificate",
				CSC_KEY_PASSWORD: "password",
				APPLE_ID: "apple@example.com",
				APPLE_APP_SPECIFIC_PASSWORD: "app-password",
				APPLE_TEAM_ID: "team-id",
			}),
		).toBe(true);
	});
});
