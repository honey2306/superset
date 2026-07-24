import { describe, expect, it } from "bun:test";
import {
	inferSubagentStatus,
	isSubagentRunning,
	toSubagentViewModels,
} from "./toSubagentViewModels";

const stubT = (key: string) => {
	if (key === "chat.subagent.defaultTask") return "Working on task...";
	if (key === "chat.subagent.defaultAgentType") return "subagent";
	return key;
};

describe("toSubagentViewModels", () => {
	it("infers completed status when status is missing but result exists", () => {
		const [viewModel] = toSubagentViewModels(
			[
				[
					"tool-1",
					{
						task: "Run subagent",
						result: "Done",
					},
				],
			] as never,
			stubT,
		);

		expect(viewModel.status).toBe("completed");
	});

	it("infers error status when error signal exists", () => {
		const [viewModel] = toSubagentViewModels(
			[
				[
					"tool-2",
					{
						task: "Run subagent",
						error: "Failed",
					},
				],
			] as never,
			stubT,
		);

		expect(viewModel.status).toBe("error");
	});

	it("returns running when no completion or error signal exists", () => {
		expect(
			inferSubagentStatus({
				task: "Run subagent",
				textDelta: "Still working",
			}),
		).toBe("running");
	});

	it("identifies running state from inferred status", () => {
		expect(
			isSubagentRunning({
				task: "Run subagent",
				textDelta: "Still working",
			}),
		).toBe(true);
		expect(
			isSubagentRunning({
				task: "Run subagent",
				result: "Done",
			}),
		).toBe(false);
	});
});
