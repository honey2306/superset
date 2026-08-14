import { describe, expect, it } from "bun:test";
import {
	DEFAULT_UPDATE_REPOSITORY,
	getUpdateFeedUrl,
	parseUpdateRepository,
	resolveUpdateRepository,
} from "./update-repository";

describe("update repository", () => {
	it("accepts the owner/repository form provided by GitHub Actions", () => {
		expect(parseUpdateRepository("honey2306/superset")).toEqual({
			owner: "honey2306",
			repo: "superset",
		});
	});

	it("rejects malformed repository values", () => {
		for (const value of [
			"",
			"owner",
			"/repo",
			"owner/",
			"a/b/c",
			"owner/repo?x=1",
		]) {
			expect(parseUpdateRepository(value)).toBeUndefined();
		}
	});

	it("falls back to the trusted source repository", () => {
		expect(resolveUpdateRepository("invalid value")).toEqual({
			owner: "superset-sh",
			repo: "superset",
		});
		expect(DEFAULT_UPDATE_REPOSITORY).toBe("superset-sh/superset");
	});

	it("builds stable and canary release feed URLs", () => {
		const repository = resolveUpdateRepository("honey2306/superset");
		expect(getUpdateFeedUrl(repository, false)).toBe(
			"https://github.com/honey2306/superset/releases/latest/download",
		);
		expect(getUpdateFeedUrl(repository, true)).toBe(
			"https://github.com/honey2306/superset/releases/download/desktop-canary",
		);
	});
});
