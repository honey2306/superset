import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { ensureHappyDom } from "test-utils/happy-dom-env";
import type { PhoneAccessSettings as PhoneAccessSettingsComponent } from "./PhoneAccessSettings";
import { buildAutoMatePairingUrl } from "./pairing-url";

let relayMailboxId: string | undefined;
let pairingCode: string | undefined;
let hostQueryOptions: {
	refetchInterval?: (query: {
		state: { data: { relayMailboxId?: string } | undefined };
	}) => number | false | undefined;
};

mock.module("@tanstack/react-query", () => ({
	useQuery: (options: {
		queryKey: string[];
		refetchInterval?: (query: {
			state: { data: { relayMailboxId?: string } | undefined };
		}) => number | false | undefined;
	}) => {
		if (options.queryKey[0] === "host") {
			hostQueryOptions = options;
			return { data: { relayMailboxId }, isLoading: false };
		}
		return { data: [], isLoading: false, refetch: () => {} };
	},
	useMutation: () => ({
		isPending: false,
		mutate: () => {},
		error: null,
		data: pairingCode ? { code: pairingCode } : null,
	}),
}));

mock.module("renderer/lib/host-service-client", () => ({
	getHostServiceClientByUrl: () => ({}),
}));

mock.module(
	"renderer/routes/_local/providers/LocalHostServiceProvider",
	() => ({
		useLocalHostService: () => ({ activeHostUrl: "http://127.0.0.1:48000" }),
	}),
);

let PhoneAccessSettings: typeof PhoneAccessSettingsComponent;
let cleanup: typeof import("@testing-library/react/pure").cleanup;
let render: typeof import("@testing-library/react/pure").render;
let screen: typeof import("@testing-library/react/pure").screen;

beforeAll(async () => {
	await ensureHappyDom();
	({ cleanup, render, screen } = await import("@testing-library/react/pure"));
	({ PhoneAccessSettings } = await import("./PhoneAccessSettings"));
});

afterEach(() => {
	cleanup();
	relayMailboxId = undefined;
	pairingCode = undefined;
	hostQueryOptions = {};
});

describe("PhoneAccessSettings", () => {
	test("does not offer or mint a direct URL when the AutoMate relay is unavailable", () => {
		render(createElement(PhoneAccessSettings));

		expect(screen.getByText(/AutoMate relay is unavailable/i)).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Generate pairing code" }),
		).toHaveProperty("disabled", true);
		expect(
			screen.queryByText(/Direct LAN|Tailscale|Manual hostname|\.local/i),
		).toBeNull();
	});

	test("renders a minted code exclusively as an AutoMate pairing URL", () => {
		relayMailboxId = "mailbox-1";
		pairingCode = "AB/CD?EF";
		render(createElement(PhoneAccessSettings));

		expect(screen.queryByText(/AutoMate relay is unavailable/i)).toBeNull();
		expect(
			screen.getByRole("button", { name: "Generate pairing code" }),
		).toHaveProperty("disabled", false);
		const generateButton = screen.getByRole("button", {
			name: "Generate pairing code",
		});
		expect(generateButton.className).toContain("bg-accent");
		expect(generateButton.className).not.toContain("bg-accent-solid");
		expect(
			screen.getByText(buildAutoMatePairingUrl(pairingCode, relayMailboxId)),
		).toBeTruthy();
		expect(screen.queryByText(/127\.0\.0\.1|\.local/i)).toBeNull();
	});

	test("polls for relay configuration until it becomes available", () => {
		render(createElement(PhoneAccessSettings));

		expect(hostQueryOptions.refetchInterval?.({ state: { data: {} } })).toBe(
			2_000,
		);
		expect(
			hostQueryOptions.refetchInterval?.({ state: { data: undefined } }),
		).toBe(2_000);
		expect(
			hostQueryOptions.refetchInterval?.({
				state: { data: { relayMailboxId: "mailbox-1" } },
			}),
		).toBe(false);
	});
});
