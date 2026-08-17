import { describe, expect, test } from "bun:test";
import { TRPCUntypedClient } from "@trpc/client";
import { createHostServiceClient } from "./HostServiceTRPCProvider";

describe("createHostServiceClient", () => {
	test("creates an untyped tRPC client safe to replace in a React provider", () => {
		const client = createHostServiceClient("http://127.0.0.1:57775");

		expect(client).toBeInstanceOf(TRPCUntypedClient);
	});
});
