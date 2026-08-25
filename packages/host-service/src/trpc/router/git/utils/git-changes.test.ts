import { describe, expect, test } from "bun:test";
import { parseGitLog } from "./git-changes";

describe("parseGitLog", () => {
	test("parses topology, decorations, and branch metadata", () => {
		const [merge] = parseGitLog(
			"0123456789012345678901234567890123456789\x1f0123456\x1f1111111111111111111111111111111111111111 2222222222222222222222222222222222222222\x1fHEAD -> main, origin/main, tag: v2.0\x1frefs/heads/main\x1fmerge feature\x1fAda Lovelace\x1f1700000000\x1e\n",
		);

		expect(merge).toMatchObject({
			hash: "0123456789012345678901234567890123456789",
			shortHash: "0123456",
			parents: [
				"1111111111111111111111111111111111111111",
				"2222222222222222222222222222222222222222",
			],
			refs: ["HEAD -> main", "origin/main", "tag: v2.0"],
			branch: "main",
			message: "merge feature",
			author: "Ada Lovelace",
			date: 1700000000000,
		});
	});

	test("keeps parsing the legacy five-field format", () => {
		expect(
			parseGitLog(
				"abc123\x1fabc123\x1flegacy commit\x1fAuthor\x1f1700000000\n",
			),
		).toEqual([
			{
				hash: "abc123",
				shortHash: "abc123",
				message: "legacy commit",
				author: "Author",
				date: 1700000000000,
				parents: [],
				refs: [],
			},
		]);
	});

	test("keeps parsing the previous topology seven-field format", () => {
		const [entry] = parseGitLog(
			"abc123\x1fabc123\x1fparent\x1fHEAD -> main\x1ftopology commit\x1fAuthor\x1f1700000000\x1e",
		);

		expect(entry).toMatchObject({
			message: "topology commit",
			author: "Author",
			parents: ["parent"],
			refs: ["HEAD -> main"],
			branch: "main",
		});
	});
});
