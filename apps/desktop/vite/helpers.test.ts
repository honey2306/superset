import { describe, expect, test } from "bun:test";
import { copyResourcesPlugin, defineEnv, RESOURCES_TO_COPY } from "./helpers";

describe("defineEnv", () => {
	test("uses the fallback when an environment variable is empty", () => {
		expect(defineEnv("", "https://example.com")).toBe(
			JSON.stringify("https://example.com"),
		);
	});
});

describe("packaged resources", () => {
	test("does not copy the retired browser extension", () => {
		expect(
			RESOURCES_TO_COPY.some(({ dest }) => dest.includes("browser-extension")),
		).toBeFalse();
	});

	test("materializes sidecars during watch build startup", () => {
		const sidecar = RESOURCES_TO_COPY.find(({ dest }) =>
			dest.endsWith("main/sidecar"),
		);
		expect(sidecar?.src.endsWith("acp-sessions/sidecar")).toBeTrue();
		expect(typeof copyResourcesPlugin().buildStart).toBe("function");
	});
});
