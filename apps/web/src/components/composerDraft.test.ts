import { expect, test } from "bun:test";
import { draftToRestore } from "./composerDraft";

test("restores a submitted draft when the composer was not edited in flight", () => {
	expect(
		draftToRestore({
			currentVersion: 3,
			submissionVersion: 3,
			submittedText: "run the tests",
		}),
	).toBe("run the tests");
});

test("does not overwrite a new draft typed while submission is pending", () => {
	expect(
		draftToRestore({
			currentVersion: 4,
			submissionVersion: 3,
			submittedText: "old request",
		}),
	).toBeNull();
});
