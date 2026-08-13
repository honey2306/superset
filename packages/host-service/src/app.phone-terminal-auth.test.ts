import { describe, expect, test } from "bun:test";
import { isPhoneWorkspaceTerminalWebSocketRequest } from "./app";

describe("isPhoneWorkspaceTerminalWebSocketRequest", () => {
	const workspaceRequest = {
		method: "GET",
		path: "/terminal/terminal-1",
		upgrade: "websocket",
		workspaceId: "workspace-1",
	};

	test("allows a workspace terminal WebSocket", () => {
		expect(isPhoneWorkspaceTerminalWebSocketRequest(workspaceRequest)).toBe(
			true,
		);
	});

	test("rejects terminal REST requests", () => {
		expect(
			isPhoneWorkspaceTerminalWebSocketRequest({
				...workspaceRequest,
				upgrade: undefined,
			}),
		).toBe(false);
	});

	test("rejects transient terminals", () => {
		expect(
			isPhoneWorkspaceTerminalWebSocketRequest({
				...workspaceRequest,
				path: "/terminal/transient",
			}),
		).toBe(false);
	});
});
