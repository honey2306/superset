import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
	cleanupUpdateDirectory,
	downloadVerifiedMacUpdate,
	installerScript,
	parseMacUpdateManifest,
} from "./macos-updater";

describe("parseMacUpdateManifest", () => {
	test("selects the ZIP from an electron-builder manifest", () => {
		expect(
			parseMacUpdateManifest(
				`version: 2.0.0\nfiles:\n  - url: Superset-2.0.0.dmg\n    sha512: dmg\n  - url: Superset-2.0.0-mac.zip\n    sha512: ziphash\n    size: 42\npath: Superset-2.0.0-mac.zip\nsha512: ziphash\nreleaseDate: '2026-08-14T00:00:00.000Z'\n`,
			),
		).toEqual({
			version: "2.0.0",
			url: "Superset-2.0.0-mac.zip",
			sha512: "ziphash",
			size: 42,
		});
	});

	test("rejects a ZIP path that could escape the release asset directory", () => {
		expect(() =>
			parseMacUpdateManifest(
				`version: 2.0.0\nfiles:\n  - url: ../bad.zip\n    sha512: hash\n`,
			),
		).toThrow("unsafe ZIP filename");
	});
});

describe("downloadVerifiedMacUpdate", () => {
	test("writes a ZIP only when SHA-512 and size match", async () => {
		const body = "update bytes";
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (() =>
			Promise.resolve(
				new Response(body, {
					headers: { "content-length": String(body.length) },
				}),
			)) as unknown as typeof fetch;
		try {
			const archive = await downloadVerifiedMacUpdate(
				"https://example.test/update.zip",
				{
					version: "2.0.0",
					url: "update.zip",
					sha512: createHash("sha512").update(body).digest("base64"),
					size: body.length,
				},
				() => {},
			);
			expect(existsSync(archive)).toBe(true);
			await cleanupUpdateDirectory(archive.slice(0, archive.lastIndexOf("/")));
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("rejects a checksum mismatch", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (() =>
			Promise.resolve(new Response("bad"))) as unknown as typeof fetch;
		try {
			await expect(
				downloadVerifiedMacUpdate(
					"https://example.test/update.zip",
					{
						version: "2.0.0",
						url: "update.zip",
						sha512: "not-a-hash",
						size: 3,
					},
					() => {},
				),
			).rejects.toThrow("checksum");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("rejects a mismatched declared size", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (() =>
			Promise.resolve(
				new Response("bad", { headers: { "content-length": "3" } }),
			)) as unknown as typeof fetch;
		try {
			await expect(
				downloadVerifiedMacUpdate(
					"https://example.test/update.zip",
					{ version: "2.0.0", url: "update.zip", sha512: "unused", size: 4 },
					() => {},
				),
			).rejects.toThrow("size");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

describe("installerScript", () => {
	test("does not touch target when its backup move fails, and restores only after a failed replacement", () => {
		const script = installerScript();
		expect(script).toContain(
			'if ! /bin/mv "$target" "$backup"; then\n  exit 1\nfi',
		);
		expect(script).toContain(
			'/bin/rm -rf "$target"\n  /bin/mv "$backup" "$target"',
		);
		expect(script.indexOf('if ! /bin/mv "$target" "$backup"')).toBeLessThan(
			script.indexOf('/bin/rm -rf "$target"'),
		);
		expect(script).toContain('xattr -d com.apple.quarantine "$target"');
		expect(script).not.toContain("eval ");
	});
});
