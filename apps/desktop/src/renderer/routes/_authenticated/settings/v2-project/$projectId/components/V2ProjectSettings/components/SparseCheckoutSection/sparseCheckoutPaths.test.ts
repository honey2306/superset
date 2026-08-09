import { describe, expect, test } from "bun:test";
import {
	formatSparseCheckoutPaths,
	validateSparseCheckoutPaths,
} from "./sparseCheckoutPaths";

describe("sparse checkout paths", () => {
	test("normalizes, removes blank lines, and de-duplicates paths", () => {
		expect(
			validateSparseCheckoutPaths(" ./apps/\npackages\\ui\napps\n"),
		).toEqual({
			paths: ["apps", "packages/ui"],
			error: null,
		});
	});

	test("rejects traversal and option-like path segments", () => {
		expect(validateSparseCheckoutPaths("apps/../secrets").error).toBe(
			"Invalid sparse checkout path: apps/../secrets",
		);
		expect(validateSparseCheckoutPaths("-danger").error).toBe(
			"Invalid sparse checkout path: -danger",
		);
	});

	test("formats persisted paths for the textarea", () => {
		expect(formatSparseCheckoutPaths(["apps", "packages/ui"])).toBe(
			"apps\npackages/ui",
		);
	});
});
