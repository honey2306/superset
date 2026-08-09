import { describe, expect, test } from "bun:test";
import {
	buildMfcliDataPayload,
	parseSummarizeOutput,
} from "./acp-title-generation";

describe("buildMfcliDataPayload", () => {
	test("pins the small model so mfcli respects the JSON schema", () => {
		const payload = JSON.parse(buildMfcliDataPayload("hi"));
		expect(payload).toEqual({ message: "hi", model: expect.any(String) });
		expect(payload.model).toContain("/");
	});

	test("round-trips the message verbatim", () => {
		const message = "帮我看一下 host 的实现";
		const payload = JSON.parse(buildMfcliDataPayload(message));
		expect(payload.message).toBe(message);
	});
});

describe("parseSummarizeOutput", () => {
	test("extracts title from fenced ```json block", () => {
		const raw = JSON.stringify({
			success: true,
			data: {
				text: '```json\n{"title": "检查主机配置"}\n```',
			},
		});
		expect(parseSummarizeOutput(raw)).toBe("检查主机配置");
	});

	test("extracts title from inline fenced block without newlines", () => {
		const raw = JSON.stringify({
			success: true,
			data: {
				text: '```json{"title":"Refactor tests"}```',
			},
		});
		expect(parseSummarizeOutput(raw)).toBe("Refactor tests");
	});

	test("extracts title from bare JSON object (no fence)", () => {
		const raw = JSON.stringify({
			success: true,
			data: { text: '{"title": "Investigate host"}' },
		});
		expect(parseSummarizeOutput(raw)).toBe("Investigate host");
	});

	test("returns null when the model replies with prose instead of a title JSON", () => {
		// Real-world regression: `wanqing/auto` sometimes ignores the JSON schema
		// and answers the user's prompt verbatim. Writing that reply into the tab
		// strip is worse than showing the agent label, so we return null.
		const raw = JSON.stringify({
			success: true,
			data: {
				text: "我目前无法直接访问您的项目文件。要分析您的项目，请提供以下信息：1. 项目概述...",
			},
		});
		expect(parseSummarizeOutput(raw)).toBeNull();
	});

	test("returns null when success is false", () => {
		const raw = JSON.stringify({
			success: false,
			data: { text: '{"title":"nope"}' },
		});
		expect(parseSummarizeOutput(raw)).toBeNull();
	});

	test("returns null when data.text is missing", () => {
		const raw = JSON.stringify({ success: true, data: {} });
		expect(parseSummarizeOutput(raw)).toBeNull();
	});

	test("returns null when text is empty after unfencing", () => {
		const raw = JSON.stringify({
			success: true,
			data: { text: "```json\n\n```" },
		});
		expect(parseSummarizeOutput(raw)).toBeNull();
	});

	test("returns null when title inside JSON is empty", () => {
		const raw = JSON.stringify({
			success: true,
			data: { text: '```json\n{"title":""}\n```' },
		});
		expect(parseSummarizeOutput(raw)).toBeNull();
	});

	test("returns null on invalid outer JSON", () => {
		expect(parseSummarizeOutput("not json at all")).toBeNull();
	});
});
