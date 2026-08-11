import { describe, expect, it } from "bun:test";
import { ELECTRIC_RESPONSE_HEADERS } from "./protocol-headers";

describe("ELECTRIC_RESPONSE_HEADERS", () => {
	it("exposes every shape header required by the renderer", () => {
		expect(ELECTRIC_RESPONSE_HEADERS).toEqual([
			"electric-handle",
			"electric-offset",
			"electric-schema",
			"electric-up-to-date",
			"electric-cursor",
		]);
	});
});
