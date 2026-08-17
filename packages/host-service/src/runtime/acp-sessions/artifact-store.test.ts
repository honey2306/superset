import { afterEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { AcpArtifactStore } from "./artifact-store";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function fixture() {
	const root = mkdtempSync(path.join(os.tmpdir(), "acp-artifacts-"));
	roots.push(root);
	return { root, store: new AcpArtifactStore(root) };
}

describe("AcpArtifactStore", () => {
	test("stores, deduplicates, and replaces repeated inline images", () => {
		const { store } = fixture();
		const data = Buffer.alloc(200_000, 7).toString("base64");
		const result = store.boundRawOutput("session/a", {
			content: [{ type: "image", data, mimeType: "image/png" }],
			details: {
				mcpResult: {
					content: [{ type: "image", data, mimeType: "image/png" }],
				},
			},
		}) as {
			content: Array<{ locator: { path: string }; sha256: string }>;
			details: {
				mcpResult: {
					content: Array<{ locator: { path: string }; sha256: string }>;
				};
			};
		};
		const first = result.content[0];
		const duplicate = result.details.mcpResult.content[0];
		if (!first || !duplicate) throw new Error("artifact references missing");
		expect(first.sha256).toBe(duplicate.sha256);
		expect(first.locator.path).toBe(duplicate.locator.path);
		expect(readFileSync(first.locator.path)).toEqual(
			Buffer.from(data, "base64"),
		);
		expect(statSync(first.locator.path).mode & 0o777).toBe(0o600);
	});

	test("keeps artifacts across store instances and removes only the closed session", () => {
		const { root, store } = fixture();
		const data = "a".repeat(200_000);
		const reference = store.boundRawOutput("one", {
			type: "image",
			data,
			mimeType: "image/png",
		}) as { locator: { path: string } };
		expect(existsSync(reference.locator.path)).toBe(true);
		const restarted = new AcpArtifactStore(root);
		const reused = restarted.boundRawOutput("one", {
			type: "image",
			data,
			mimeType: "image/png",
		}) as { locator: { path: string } };
		expect(reused.locator.path).toBe(reference.locator.path);
		restarted.removeSession("one");
		expect(existsSync(reference.locator.path)).toBe(false);
	});
});
