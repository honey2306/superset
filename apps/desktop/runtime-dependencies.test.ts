import { describe, expect, it } from "bun:test";
import { packagedNodeModuleCopies } from "./runtime-dependencies";

describe("packaged runtime dependencies", () => {
	it("copies only the target platform binary for explicit native module scopes", () => {
		const duckdb = packagedNodeModuleCopies.find(
			(copy) => copy.from === "node_modules/@duckdb",
		);
		const astGrep = packagedNodeModuleCopies.find(
			(copy) => copy.from === "node_modules/@ast-grep",
		);
		const targetSuffix = `${process.platform}-${process.arch}`;
		const targetGnuSuffix =
			process.platform === "linux" ? `linux-${process.arch}-gnu` : targetSuffix;
		expect(duckdb?.filter).toContain(`node-bindings-${targetSuffix}/**/*`);
		expect(astGrep?.filter).toContain(`napi-${targetGnuSuffix}/**/*`);
	});

	it("does not stage bundled JavaScript runtimes as node modules", () => {
		expect(packagedNodeModuleCopies.map((copy) => copy.from)).not.toContain(
			"node_modules/mastracode",
		);
		expect(packagedNodeModuleCopies.map((copy) => copy.from)).not.toContain(
			"node_modules/@agentclientprotocol/claude-agent-acp",
		);
	});

	it("keeps rebuilt native modules without their build inputs or foreign prebuilds", () => {
		const betterSqlite = packagedNodeModuleCopies.find(
			(copy) => copy.from === "node_modules/better-sqlite3",
		);
		const nodePty = packagedNodeModuleCopies.find(
			(copy) => copy.from === "node_modules/node-pty",
		);
		const parcelWatcher = packagedNodeModuleCopies.find(
			(copy) => copy.from === "node_modules/@parcel",
		);

		expect(betterSqlite?.filter).toContain("build/Release/better_sqlite3.node");
		expect(betterSqlite?.filter).not.toContain("deps/**/*");
		expect(nodePty?.filter).toContain("build/Release/pty.node");
		expect(nodePty?.filter).not.toContain("prebuilds/**/*");
		expect(parcelWatcher?.filter).not.toContain("watcher/build/**/*");
	});
});
