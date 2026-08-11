import { describe, expect, test } from "bun:test";
import { buildKDevCreateMergeRequestUrl, getKDevRepositoryPath } from "./kdev";

describe("KDev merge request URL", () => {
	test("parses HTTPS and encodes only the current branch", () => {
		expect(
			buildKDevCreateMergeRequestUrl(
				"https://kdev.corp.kuaishou.com/git/group/repo.git",
				"feature/a b",
			),
		).toBe(
			"https://kdev.corp.kuaishou.com/git/group/repo/-/create_MR?branchName=feature%2Fa%20b",
		);
	});

	test("parses SSH remotes and rejects other hosts", () => {
		expect(
			getKDevRepositoryPath("git@kdev.corp.kuaishou.com:group/repo.git"),
		).toBe("group/repo");
		expect(
			getKDevRepositoryPath("git@git.corp.kuaishou.com:AgentX/agentx_web.git"),
		).toBe("AgentX/agentx_web");
		expect(
			getKDevRepositoryPath(
				"ssh://git@git.corp.kuaishou.com:2222/AgentX/agentx_web.git",
			),
		).toBe("AgentX/agentx_web");
		expect(
			getKDevRepositoryPath("https://github.com/group/repo.git"),
		).toBeNull();
	});
});
