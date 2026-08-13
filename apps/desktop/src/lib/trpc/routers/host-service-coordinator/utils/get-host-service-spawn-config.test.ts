import { describe, expect, test } from "bun:test";
import { getHostServiceSpawnConfig } from "./get-host-service-spawn-config";

describe("getHostServiceSpawnConfig", () => {
	test("starts every desktop host locally without cloud credentials", () => {
		expect(getHostServiceSpawnConfig()).toEqual({});
	});
});
