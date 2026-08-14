type PackagedNodeModuleCopy = {
	filter: string[];
	from: string;
	to: string;
};

type ExternalizedRuntimeModule = {
	asarUnpackGlobs: string[];
	materialize: string[];
	packagedCopies: PackagedNodeModuleCopy[];
	specifier: string;
};

const targetPlatform = process.env.TARGET_PLATFORM ?? process.platform;
const targetArch = process.env.TARGET_ARCH ?? process.arch;
const targetSuffix = `${targetPlatform}-${targetArch}`;
const targetGnuSuffix =
	targetPlatform === "linux" ? `linux-${targetArch}-gnu` : targetSuffix;
const targetGlibcSuffix =
	targetPlatform === "linux" ? `linux-${targetArch}-glibc` : targetSuffix;
const targetMsvcSuffix =
	targetPlatform === "win32" ? `win32-${targetArch}-msvc` : targetSuffix;

function copyWholeModule(moduleName: string): PackagedNodeModuleCopy {
	return {
		from: `node_modules/${moduleName}`,
		to: `node_modules/${moduleName}`,
		filter: ["**/*"],
	};
}

function copyModuleSubtree(
	moduleName: string,
	filter: string[],
): PackagedNodeModuleCopy {
	return {
		from: `node_modules/${moduleName}`,
		to: `node_modules/${moduleName}`,
		filter,
	};
}

const externalizedRuntimeModules: ExternalizedRuntimeModule[] = [
	{
		specifier: "better-sqlite3",
		materialize: ["better-sqlite3"],
		packagedCopies: [
			copyModuleSubtree("better-sqlite3", [
				"lib/**/*",
				"build/Release/better_sqlite3.node",
				"package.json",
				"LICENSE",
			]),
		],
		asarUnpackGlobs: ["**/node_modules/better-sqlite3/**/*"],
	},
	{
		specifier: "node-pty",
		materialize: ["node-pty"],
		packagedCopies: [
			copyModuleSubtree("node-pty", [
				"lib/**/*",
				"build/Release/pty.node",
				"build/Release/spawn-helper",
				"package.json",
				"LICENSE",
			]),
		],
		asarUnpackGlobs: ["**/node_modules/node-pty/**/*"],
	},
	{
		specifier: "native-keymap",
		materialize: ["native-keymap"],
		packagedCopies: [copyWholeModule("native-keymap")],
		asarUnpackGlobs: ["**/node_modules/native-keymap/**/*"],
	},
	{
		specifier: "@superset/macos-process-metrics",
		materialize: ["@superset/macos-process-metrics"],
		packagedCopies: [copyWholeModule("@superset/macos-process-metrics")],
		asarUnpackGlobs: ["**/node_modules/@superset/macos-process-metrics/**/*"],
	},
	{
		specifier: "@ast-grep/napi",
		materialize: ["@ast-grep/napi"],
		packagedCopies: [
			copyModuleSubtree("@ast-grep", [
				"napi/**/*",
				`napi-${targetGnuSuffix}/**/*`,
				`napi-${targetMsvcSuffix}/**/*`,
			]),
		],
		asarUnpackGlobs: ["**/node_modules/@ast-grep/napi*/**/*"],
	},
	{
		specifier: "@parcel/watcher",
		materialize: ["@parcel/watcher"],
		packagedCopies: [
			copyModuleSubtree("@parcel", [
				"watcher/index.js",
				"watcher/wrapper.js",
				"watcher/package.json",
				"watcher/LICENSE",
				`watcher-${targetGlibcSuffix}/**/*`,
			]),
		],
		asarUnpackGlobs: ["**/node_modules/@parcel/watcher*/**/*"],
	},
	{
		specifier: "libsql",
		materialize: ["libsql"],
		packagedCopies: [
			copyWholeModule("libsql"),
			copyModuleSubtree("@libsql", [`${targetGnuSuffix}/**/*`]),
			copyWholeModule("@neon-rs"),
		],
		asarUnpackGlobs: ["**/node_modules/@libsql/**/*"],
	},
	{
		specifier: "@duckdb/node-api",
		materialize: ["@duckdb/node-api", "@duckdb/node-bindings"],
		packagedCopies: [
			copyModuleSubtree("@duckdb", [
				"node-api/**/*",
				"node-bindings/**/*",
				`node-bindings-${targetSuffix}/**/*`,
			]),
		],
		asarUnpackGlobs: ["**/node_modules/@duckdb/**/*"],
	},
	{
		specifier: "@anush008/tokenizers",
		materialize: ["@anush008/tokenizers"],
		packagedCopies: [
			copyModuleSubtree("@anush008", [
				"tokenizers/**/*",
				"tokenizers-darwin-universal/**/*",
			]),
		],
		asarUnpackGlobs: ["**/node_modules/@anush008/tokenizers*/**/*"],
	},
	{
		specifier: "onnxruntime-node",
		materialize: ["onnxruntime-node", "onnxruntime-common"],
		packagedCopies: [
			copyModuleSubtree("onnxruntime-node", [
				"dist/**/*",
				"package.json",
				"LICENSE",
				`bin/napi-v3/darwin/${targetArch}/**/*`,
			]),
			copyWholeModule("onnxruntime-common"),
		],
		asarUnpackGlobs: ["**/node_modules/onnxruntime-node/bin/**/*"],
	},
];

const packagedSupportModules = [
	copyWholeModule("bindings"),
	copyWholeModule("file-uri-to-path"),
	copyWholeModule("detect-libc"),
	copyWholeModule("is-glob"),
	copyWholeModule("is-extglob"),
	copyWholeModule("picomatch"),
	copyWholeModule("node-addon-api"),
	copyWholeModule("@xterm/headless"),
];

export const mainExternalizedDependencies = [
	...externalizedRuntimeModules.map((module) => module.specifier),
	"pg-native",
	// mastracode is bundled into the host-service entry. Its transitive native
	// packages remain externalized individually through their runtime imports.
];

export const packagedNodeModuleCopies = [
	...externalizedRuntimeModules.flatMap((module) => module.packagedCopies),
	...packagedSupportModules,
];

export const packagedAsarUnpackGlobs = [
	...externalizedRuntimeModules.flatMap((module) => module.asarUnpackGlobs),
	"**/node_modules/bindings/**/*",
	"**/node_modules/file-uri-to-path/**/*",
];

export const requiredMaterializedNodeModules = [
	...externalizedRuntimeModules.flatMap((module) => module.materialize),
	"bindings",
	"file-uri-to-path",
	"detect-libc",
	"is-glob",
	"is-extglob",
	"picomatch",
	"node-addon-api",
	"@xterm/headless",
];
