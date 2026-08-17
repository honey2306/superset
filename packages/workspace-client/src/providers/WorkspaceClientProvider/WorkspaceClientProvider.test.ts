import { describe, expect, test } from "bun:test";
import { TRPCUntypedClient } from "@trpc/client";
import { getWorkspaceClients } from "./WorkspaceClientProvider";

describe("getWorkspaceClients", () => {
	test("creates an untyped tRPC client safe to replace in a React provider", () => {
		const clients = getWorkspaceClients(
			"test-host-switch",
			"http://127.0.0.1:57775",
		);

		expect(clients.trpcClient).toBeInstanceOf(TRPCUntypedClient);
	});
});
