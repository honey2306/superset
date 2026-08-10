import { describe, expect, test } from "bun:test";
import type { AuthValidationResult, HostAuthProvider } from "../types";
import { CompositeHostAuthProvider } from "./CompositeHostAuthProvider";

function stub(result: AuthValidationResult): HostAuthProvider {
	return {
		validate: () => result,
		validateToken: () => result,
	};
}

const OK_PSK: AuthValidationResult = { ok: true, kind: "psk" };
const OK_PHONE: AuthValidationResult = { ok: true, kind: "phone" };
const NO: AuthValidationResult = { ok: false, kind: null };

describe("CompositeHostAuthProvider", () => {
	test("first ok wins", async () => {
		const composite = new CompositeHostAuthProvider([
			stub(OK_PSK),
			stub(OK_PHONE),
		]);
		expect(await composite.validate(new Request("http://x/"))).toEqual(OK_PSK);
	});

	test("falls through to next provider on negative", async () => {
		const composite = new CompositeHostAuthProvider([stub(NO), stub(OK_PHONE)]);
		expect(await composite.validate(new Request("http://x/"))).toEqual(
			OK_PHONE,
		);
		expect(await composite.validateToken("t")).toEqual(OK_PHONE);
	});

	test("returns negative when every provider rejects", async () => {
		const composite = new CompositeHostAuthProvider([stub(NO), stub(NO)]);
		expect(await composite.validate(new Request("http://x/"))).toEqual(NO);
	});
});
