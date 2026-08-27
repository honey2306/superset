import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import type {
	RequestPermissionOutcome,
	RespondToPermissionResult,
} from "@superset/session-protocol";
import { createElement } from "react";
import { ensureHappyDom } from "test-utils/happy-dom-env";
import type { AcpPermissionCard as AcpPermissionCardComponent } from "./AcpPermissionCard";

let AcpPermissionCard: typeof AcpPermissionCardComponent;
let act: typeof import("@testing-library/react/pure").act;
let cleanup: typeof import("@testing-library/react/pure").cleanup;
let fireEvent: typeof import("@testing-library/react/pure").fireEvent;
let render: typeof import("@testing-library/react/pure").render;
let screen: typeof import("@testing-library/react/pure").screen;

beforeAll(async () => {
	await ensureHappyDom();
	({ act, cleanup, fireEvent, render, screen } = await import(
		"@testing-library/react/pure"
	));
	({ AcpPermissionCard } = await import("./AcpPermissionCard"));
});

afterEach(() => {
	cleanup();
});

function renderCard(
	onRespond: (
		requestId: string,
		outcome: RequestPermissionOutcome,
	) => Promise<RespondToPermissionResult> | Promise<void>,
	variant: "permission" | "askuser",
) {
	return render(
		createElement(AcpPermissionCard, {
			permission: {
				requestId: "ask-color",
				options: [{ optionId: "blue", name: "Blue", kind: "allow_once" }],
				requestedAt: 0,
				resolution: null,
			},
			variant,
			onRespond,
		}),
	);
}

function renderAskUser(
	onRespond: (
		requestId: string,
		outcome: RequestPermissionOutcome,
	) => Promise<RespondToPermissionResult> | Promise<void>,
) {
	return renderCard(onRespond, "askuser");
}

describe("AcpPermissionCard submission", () => {
	test.each([
		"resolved",
		"already_resolved",
	] as const)("renders a terminal AskUser card as soon as the RPC returns %s", async (status) => {
		let resolveResponse:
			| ((result: RespondToPermissionResult) => void)
			| undefined;
		const onRespond = () =>
			new Promise<RespondToPermissionResult>((resolve) => {
				resolveResponse = resolve;
			});

		renderAskUser(onRespond);
		fireEvent.click(screen.getByRole("button", { name: /Blue/ }));
		expect(screen.getByText("Submitting…")).toBeTruthy();

		await act(async () => {
			resolveResponse?.({ status });
		});

		expect(screen.queryByText("Submitting…")).toBeNull();
		expect(
			screen.getByText(
				status === "already_resolved"
					? "Answer already submitted"
					: "Answered: Blue",
			),
		).toBeTruthy();
		expect(screen.queryByRole("button", { name: /Blue/ })).toBeNull();
	});

	test("restores the AskUser controls when the RPC fails", async () => {
		const onRespond = async () => {
			throw new Error("connection lost");
		};

		renderAskUser(onRespond);
		fireEvent.click(screen.getByRole("button", { name: /Blue/ }));
		expect(screen.getByText("Submitting…")).toBeTruthy();

		await act(async () => {
			await Promise.resolve();
		});

		expect(screen.queryByText("Submitting…")).toBeNull();
		expect(screen.getByRole("button", { name: /Blue/ })).toBeTruthy();
	});

	test("renders an ordinary permission as resolved after a successful RPC", async () => {
		let resolveResponse:
			| ((result: RespondToPermissionResult) => void)
			| undefined;
		const onRespond = () =>
			new Promise<RespondToPermissionResult>((resolve) => {
				resolveResponse = resolve;
			});

		renderCard(onRespond, "permission");
		fireEvent.click(screen.getByRole("button", { name: /Blue/ }));
		expect(screen.getByText("Submitting…")).toBeTruthy();

		await act(async () => {
			resolveResponse?.({ status: "resolved" });
		});

		expect(screen.queryByText("Submitting…")).toBeNull();
		expect(screen.getByText("Permission ·")).toBeTruthy();
		expect(screen.getByText("Blue")).toBeTruthy();
	});

	test("does not attribute an already-resolved permission to the local choice", async () => {
		renderCard(async () => ({ status: "already_resolved" }), "permission");
		fireEvent.click(screen.getByRole("button", { name: /Blue/ }));

		await act(async () => {
			await Promise.resolve();
		});

		expect(screen.getByText("Response already submitted")).toBeTruthy();
		expect(screen.queryByText("Blue")).toBeNull();
		expect(
			screen.getByText("Response already submitted").getAttribute("data-tone"),
		).toBeNull();
	});
});
