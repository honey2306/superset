import { describe, expect, it } from "bun:test";
import {
	canSaveDelegatedExecutionDraft,
	type DelegatedExecutionDraft,
	shouldAdoptDelegatedExecutionQueryData,
	shouldApplyDelegatedExecutionSaveResult,
} from "./delegated-execution-form";

const initial: DelegatedExecutionDraft = {
	enabled: true,
	executorAgentConfigId: "codex-config",
	executorModelId: "gpt-5.6-sol",
};

describe("delegated execution form", () => {
	it("requires an Agent and model when delegation is enabled", () => {
		expect(canSaveDelegatedExecutionDraft(initial, true)).toBe(true);
		expect(
			canSaveDelegatedExecutionDraft(
				{
					enabled: true,
					executorAgentConfigId: null,
					executorModelId: null,
				},
				true,
			),
		).toBe(false);
		expect(
			canSaveDelegatedExecutionDraft(
				{
					enabled: false,
					executorAgentConfigId: null,
					executorModelId: null,
				},
				true,
			),
		).toBe(true);
		expect(
			canSaveDelegatedExecutionDraft(
				{
					enabled: true,
					executorAgentConfigId: "pi-config",
					executorModelId: null,
				},
				true,
			),
		).toBe(false);
	});

	it("does not adopt query refreshes over a dirty draft", () => {
		const baseline = { ...initial };
		expect(
			shouldAdoptDelegatedExecutionQueryData({ ...initial }, baseline),
		).toBe(true);
		expect(
			shouldAdoptDelegatedExecutionQueryData(
				{ ...initial, enabled: false },
				baseline,
			),
		).toBe(false);
	});

	it("applies a save result only to the submitting host and unchanged draft", () => {
		expect(
			shouldApplyDelegatedExecutionSaveResult({
				currentHostUrl: "http://host-a",
				requestHostUrl: "http://host-a",
				currentDraft: { ...initial },
				submittedDraft: { ...initial },
			}),
		).toBe(true);
		expect(
			shouldApplyDelegatedExecutionSaveResult({
				currentHostUrl: "http://host-b",
				requestHostUrl: "http://host-a",
				currentDraft: { ...initial },
				submittedDraft: { ...initial },
			}),
		).toBe(false);
		expect(
			shouldApplyDelegatedExecutionSaveResult({
				currentHostUrl: "http://host-a",
				requestHostUrl: "http://host-a",
				currentDraft: { ...initial, enabled: false },
				submittedDraft: { ...initial },
			}),
		).toBe(false);
	});
});
