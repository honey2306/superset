import { expect, test } from "bun:test";
import { HostOperationError } from "../application/errors";
import type { HostServiceContext } from "../types";
import { publicProcedure, router } from "./index";

test("transport translates application failure codes and preserves structured causes", async () => {
	const cause = { kind: "PROJECT_NOT_SETUP", projectId: "p" };
	const operations = router({
		fail: publicProcedure.query(() => {
			throw new HostOperationError({
				code: "PRECONDITION_FAILED",
				message: "Setup first",
				cause,
			});
		}),
	});
	const caller = operations.createCaller({} as HostServiceContext);
	await expect(caller.fail()).rejects.toMatchObject({
		code: "PRECONDITION_FAILED",
		message: "Setup first",
		cause,
	});
});
test("unexpected exceptions still produce an internal transport error", async () => {
	const operations = router({
		fail: publicProcedure.query(() => {
			throw new Error("Unexpected failure");
		}),
	});
	await expect(
		operations.createCaller({} as HostServiceContext).fail(),
	).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
});
