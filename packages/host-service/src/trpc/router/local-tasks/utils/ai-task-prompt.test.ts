import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { z } from "zod";

const model = { id: "small-model" };
const generateMock = mock(async (_prompt: string, _options: unknown) => ({
	object: {
		prompt: "Inspect the reports, use available tools, and report the result.",
	},
}));
const agentConstructorMock = mock((_options: unknown) => ({
	generate: generateMock,
}));
const getSmallModelMock = mock(async () => model);

mock.module("@mastra/core/agent", () => ({ Agent: agentConstructorMock }));
mock.module("@superset/chat/server/shared", () => ({
	getSmallModel: getSmallModelMock,
}));

const { optimizeTaskPrompt } = await import("./ai-task-prompt");

describe("optimizeTaskPrompt", () => {
	beforeEach(() => {
		generateMock.mockClear();
		getSmallModelMock.mockClear();
		agentConstructorMock.mockClear();
	});

	test("uses structured output to turn scheduled intent into an executable prompt", async () => {
		await expect(
			optimizeTaskPrompt("Every morning review the reports"),
		).resolves.toEqual({
			prompt:
				"Inspect the reports, use available tools, and report the result.",
			optimized: true,
		});
		expect(generateMock).toHaveBeenCalledWith(
			"Every morning review the reports",
			expect.objectContaining({
				structuredOutput: expect.objectContaining({
					schema: expect.anything(),
				}),
			}),
		);
		const options = generateMock.mock.calls[0]?.[1] as {
			structuredOutput: { schema: z.ZodType };
		};
		expect(z.toJSONSchema(options.structuredOutput.schema)).toMatchObject({
			type: "object",
			properties: { prompt: { type: "string" } },
		});
	});

	test("wraps the original request as a one-shot execution when no model is available", async () => {
		getSmallModelMock.mockResolvedValueOnce(null as never);
		const result = await optimizeTaskPrompt("  Do the thing later  ");
		expect(result.optimized).toBe(false);
		expect(result.prompt).toContain(
			"Execute the scheduled task below once now.",
		);
		expect(result.prompt).toContain(
			"Do not create, modify, or cancel another schedule or reminder",
		);
		expect(result.prompt).toEndWith("Original request:\nDo the thing later");
		expect(generateMock).not.toHaveBeenCalled();
	});
});

afterAll(() => mock.restore());
