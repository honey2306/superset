import { beforeEach, describe, expect, it, mock } from "bun:test";

const remoteKillMock = mock(async () => ({ success: true }));

mock.module("renderer/lib/host-service-client", () => ({
	getHostServiceClientByUrl: () => ({
		ports: {
			kill: {
				mutate: remoteKillMock,
			},
		},
	}),
}));

const { killPortTarget } = await import("./killPortTarget");

const target = {
	workspaceId: "visible-workspace-1",
	killWorkspaceId: "host-workspace-1",
	terminalId: "terminal-1",
	port: 5173,
	hostUrl: "http://host-service",
};

describe("killPortTarget", () => {
	beforeEach(() => {
		remoteKillMock.mockClear();
		remoteKillMock.mockResolvedValue({ success: true });
	});

	it("routes ports through the owning host-service", async () => {
		const result = await killPortTarget(target);

		expect(result).toEqual({ success: true });
		expect(remoteKillMock).toHaveBeenCalledWith({
			workspaceId: "host-workspace-1",
			terminalId: "terminal-1",
			port: 5173,
		});
	});

	it("normalizes thrown kill errors into failed results", async () => {
		remoteKillMock.mockRejectedValueOnce(new Error("network down"));

		const result = await killPortTarget(target);

		expect(result).toEqual({ success: false, error: "network down" });
	});
});
