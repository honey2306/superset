import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { ensureHappyDom } from "test-utils/happy-dom-env";
import type { OpenAIUsageBadge as OpenAIUsageBadgeComponent } from "./OpenAIUsageBadge";

const useCodexUsageQuery = mock();

mock.module("renderer/lib/host-service-trpc", () => ({
	hostServiceTrpc: {
		usage: {
			getCodex: {
				useQuery: useCodexUsageQuery,
			},
		},
	},
}));

mock.module("renderer/providers/I18nProvider", () => ({
	useTranslation: () => ({
		t: (key: string, values?: Record<string, unknown>) =>
			values ? `${key}(${JSON.stringify(values)})` : key,
	}),
}));

let OpenAIUsageBadge: typeof OpenAIUsageBadgeComponent;
let cleanup: typeof import("@testing-library/react/pure").cleanup;
let render: typeof import("@testing-library/react/pure").render;
let screen: typeof import("@testing-library/react/pure").screen;

beforeAll(async () => {
	await ensureHappyDom();
	({ cleanup, render, screen } = await import("@testing-library/react/pure"));
	({ OpenAIUsageBadge } = await import("./OpenAIUsageBadge"));
});

afterEach(() => {
	cleanup();
	useCodexUsageQuery.mockReset();
});

describe("OpenAIUsageBadge", () => {
	test("renders nothing while data is loading", () => {
		useCodexUsageQuery.mockReturnValue({ data: undefined });
		const { container } = render(createElement(OpenAIUsageBadge));
		expect(container.firstChild).toBeNull();
	});

	test("renders nothing when usage is unavailable", () => {
		useCodexUsageQuery.mockReturnValue({
			data: { available: false, reason: "no-rollouts" },
		});
		const { container } = render(createElement(OpenAIUsageBadge));
		expect(container.firstChild).toBeNull();
	});

	test("renders the rounded remaining percent when usage is available", () => {
		useCodexUsageQuery.mockReturnValue({
			data: {
				available: true,
				primary: {
					usedPercent: 42.6,
					windowMinutes: 10080,
					resetsAt: 1786504313,
				},
				secondary: null,
				credits: { hasCredits: false, unlimited: false, balance: "0" },
				planType: "pro",
				rateLimitReachedType: null,
				observedAt: 0,
				sourceFile: "/tmp/x.jsonl",
			},
		});
		render(createElement(OpenAIUsageBadge));
		expect(screen.getByText("57%")).toBeTruthy();
	});

	test("applies the crit color level when remaining is at or below 10%", () => {
		useCodexUsageQuery.mockReturnValue({
			data: {
				available: true,
				primary: {
					usedPercent: 95,
					windowMinutes: 10080,
					resetsAt: 1786504313,
				},
				secondary: null,
				credits: { hasCredits: false, unlimited: false, balance: "0" },
				planType: "pro",
				rateLimitReachedType: null,
				observedAt: 0,
				sourceFile: "/tmp/x.jsonl",
			},
		});
		const { container } = render(createElement(OpenAIUsageBadge));
		const badge = container.querySelector("[data-level]");
		expect(badge?.getAttribute("data-level")).toBe("crit");
	});
});
