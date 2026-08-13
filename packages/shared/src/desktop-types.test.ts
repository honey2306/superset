import { describe, expect, test } from "bun:test";
import { openInAppInputSchema } from "./desktop-types";

describe("openInAppInputSchema", () => {
	test("accepts an optional one-based file location", () => {
		expect(
			openInAppInputSchema.parse({
				path: "/workspace/src/index.ts",
				app: "cursor",
				line: 42,
				column: 7,
			}),
		).toEqual({
			path: "/workspace/src/index.ts",
			app: "cursor",
			line: 42,
			column: 7,
		});
	});

	test("rejects zero-based locations", () => {
		expect(() =>
			openInAppInputSchema.parse({
				path: "/workspace/src/index.ts",
				app: "cursor",
				line: 0,
			}),
		).toThrow();
	});
});
