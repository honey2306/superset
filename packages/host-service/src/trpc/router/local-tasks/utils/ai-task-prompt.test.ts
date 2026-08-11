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

	test("keeps the cleaned user-language request unchanged when no model is available", async () => {
		getSmallModelMock.mockResolvedValueOnce(null as never);
		const request = "  每天9点帮我查一下北京的天气  ";
		const result = await optimizeTaskPrompt(request);

		// Without a model, retaining the cleaned request is the safe tradeoff:
		// it does not mix languages, repeat the request, or discard its meaning.
		expect(result).toEqual({
			prompt: "每天9点帮我查一下北京的天气",
			optimized: false,
		});
		expect(result.prompt).not.toContain("Original request");
		expect(result.prompt).not.toMatch(/[A-Za-z]/);
		expect(generateMock).not.toHaveBeenCalled();
	});

	test("uses the same cleaned fallback when generation fails", async () => {
		generateMock.mockRejectedValueOnce(new Error("model unavailable"));
		await expect(optimizeTaskPrompt("明天提醒我查看报告")).resolves.toEqual({
			prompt: "明天提醒我查看报告",
			optimized: false,
		});
	});
});

afterAll(() => mock.restore());
