/**
 * Electron Builder Configuration
 * @see https://www.electron.build/configuration/configuration
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Configuration } from "electron-builder";
import { shouldNotarizeMacBuild } from "./mac-build-credentials";
import pkg from "./package.json";
import {
	packagedAsarUnpackGlobs,
	packagedNodeModuleCopies,
} from "./runtime-dependencies";
import { resolveUpdateRepository } from "./src/main/lib/update-repository";

const currentYear = new Date().getFullYear();
const author = pkg.author?.name ?? pkg.author;
const productName = pkg.productName;
const macIconPath = join(pkg.resources, "build/icons/icon.icns");
const linuxIconPath = join(pkg.resources, "build/icons");
const winIconPath = join(pkg.resources, "build/icons/icon.ico");
const dmgBackgroundPath = join(
	pkg.resources,
	"build/installer/background.tiff",
);
const shouldNotarize = shouldNotarizeMacBuild();
const targetPlatform = process.env.TARGET_PLATFORM ?? process.platform;
const targetArch = process.env.TARGET_ARCH ?? process.arch;
const targetSuffix = `${targetPlatform}-${targetArch}`;
const updateRepository = resolveUpdateRepository(
	process.env.SUPERSET_UPDATE_REPOSITORY,
);
function excludeNonTargetPlatformModules(
	moduleName: string,
	platformSuffixes: string[],
	targetModuleSuffix = targetSuffix,
): string[] {
	return platformSuffixes
		.filter((suffix) => suffix !== targetModuleSuffix)
		.map((suffix) => `!**/node_modules/${moduleName}-${suffix}/**/*`);
}

const anthropicPlatformSuffixes = [
	"darwin-x64",
	"darwin-arm64",
	"linux-x64",
	"linux-arm64",
	"linux-x64-musl",
	"linux-arm64-musl",
	"win32-x64",
	"win32-arm64",
];
const platformSpecificModuleExcludes = [
	// The Claude ACP bridge keeps the SDK's JavaScript API only. The optional
	// platform packages contain Anthropic's fallback Claude CLI, which is not a
	// Superset runtime dependency.
	...anthropicPlatformSuffixes.map(
		(suffix) =>
			`!**/node_modules/@anthropic-ai/claude-agent-sdk-${suffix}/**/*`,
	),
	...excludeNonTargetPlatformModules("@duckdb/node-bindings", [
		"darwin-x64",
		"darwin-arm64",
		"linux-x64",
		"linux-arm64",
		"win32-x64",
		"win32-arm64",
	]),
	...excludeNonTargetPlatformModules(
		"@ast-grep/napi",
		[
			"darwin-x64",
			"darwin-arm64",
			"linux-x64-gnu",
			"linux-x64-musl",
			"linux-arm64-gnu",
			"linux-arm64-musl",
			"win32-x64-msvc",
			"win32-arm64-msvc",
			"win32-ia32-msvc",
		],
		targetPlatform === "linux"
			? `linux-${targetArch}-gnu`
			: targetPlatform === "win32"
				? `win32-${targetArch}-msvc`
				: targetSuffix,
	),
	...excludeNonTargetPlatformModules(
		"@parcel/watcher",
		[
			"darwin-x64",
			"darwin-arm64",
			"linux-x64-glibc",
			"linux-x64-musl",
			"linux-arm64-glibc",
			"linux-arm64-musl",
			"win32-x64",
			"win32-arm64",
			"win32-ia32",
		],
		targetPlatform === "linux" ? `linux-${targetArch}-glibc` : targetSuffix,
	),
	...excludeNonTargetPlatformModules(
		"@libsql",
		[
			"darwin-x64",
			"darwin-arm64",
			"linux-arm-gnueabihf",
			"linux-arm-musleabihf",
			"linux-arm64-gnu",
			"linux-arm64-musl",
			"linux-x64-gnu",
			"linux-x64-musl",
			"win32-x64-msvc",
		],
		targetPlatform === "linux"
			? `linux-${targetArch}-gnu`
			: targetPlatform === "win32"
				? `win32-${targetArch}-msvc`
				: targetSuffix,
	),
	...(["darwin", "linux", "win32"] as const).flatMap((platform) =>
		(["x64", "arm64"] as const)
			.filter((arch) => `${platform}-${arch}` !== targetSuffix)
			.map(
				(arch) =>
					`!**/node_modules/onnxruntime-node/bin/napi-v3/${platform}/${arch}/**/*`,
			),
	),
];

const config: Configuration = {
	appId: "com.superset.desktop",
	productName,
	copyright: `Copyright © ${currentYear} — ${author}`,
	electronVersion: pkg.devDependencies.electron.replace(/^\^/, ""),
	// electron-builder removes unwanted Electron framework locale bundles before
	// signing. Keep English plus Simplified Chinese only.
	electronLanguages: ["en", "zh_CN"],
	// Runtime modules are copied through the explicit `files` FileSets below.
	// Returning false during packaging prevents electron-builder from additionally
	// traversing and copying every production dependency after those filters run.
	// `rebuild:native` opts into the same hook for its dedicated rebuild pass.
	beforeBuild: () => process.env.SUPERSET_REBUILD_NATIVE === "1",

	// Generate update manifests for all channels (latest.yml, canary.yml, etc.)
	// This enables proper channel-based auto-updates following electron-builder conventions
	generateUpdatesFilesForAllChannels: true,

	// Generate latest-mac.yml for auto-update (workflow handles actual upload)
	publish: {
		provider: "github",
		owner: updateRepository.owner,
		repo: updateRepository.repo,
	},

	// Directories
	directories: {
		output: "release",
		buildResources: join(pkg.resources, "build"),
	},

	// ASAR configuration for native modules and external resources
	asar: true,
	asarUnpack: [
		...packagedAsarUnpackGlobs,
		// Tray icon must be unpacked so Electron Tray can load it
		"**/resources/tray/**/*",
	],

	// Extra resources placed outside asar archive (accessible via process.resourcesPath)
	extraResources: [
		// Database migrations - must be outside asar for drizzle-orm to read
		{
			from: "dist/resources/migrations",
			to: "resources/migrations",
			filter: ["**/*"],
		},
		{
			from: "dist/resources/host-migrations",
			to: "resources/host-migrations",
			filter: ["**/*"],
		},
		{
			from: "dist/resources/web",
			to: "resources/web",
			filter: ["**/*"],
		},
		{
			from: "dist/resources/sounds",
			to: "resources/sounds",
			filter: ["**/*"],
		},
		// Pi runs as an external Node process and cannot load extensions from
		// app.asar, so materialize the bundled ACP MCP bridge beside resources.
		{
			from: "dist/main/pi-acp-mcp-extension.js",
			to: "pi-extensions/pi-acp-mcp-extension.js",
		},
	],

	files: [
		"dist/**/*",
		"!dist/**/*.map",
		"!**/node_modules/**/*.map",
		"!dist/resources/sounds/**/*",
		"package.json",
		{
			from: pkg.resources,
			to: "resources",
			filter: ["**/*", "!build/**/*", "build/icons/*.png", "!sounds/**/*"],
		},
		// Runtime modules that stay external to the main bundle.
		// bun creates symlinks for direct deps in workspace node_modules.
		// The copy:native-modules script replaces symlinks with real files
		// before building (required for Bun 1.3+ isolated installs).
		...packagedNodeModuleCopies,
		// electron-builder applies these exclusions to its separately collected
		// production dependency set too. Keep only the binary matching the target.
		...platformSpecificModuleExcludes,
		"!**/.DS_Store",
	],

	// Native modules are rebuilt by `rebuild:native` before their FileSets are
	// copied. Packaging itself deliberately disables builder's dependency
	// collector/rebuilder via `beforeBuild`.
	npmRebuild: true,

	// macOS DMG installer
	dmg: {
		...(existsSync(dmgBackgroundPath) ? { background: dmgBackgroundPath } : {}),
		// Explicit size — dmgbuild's auto-calc under-allocates and silently truncates
		// large app bundles. Leave enough staging headroom for the current unpacked
		// native/agent runtime; `shrink: true` (default) keeps the final artifact compact.
		size: "6g",
	},

	// macOS
	mac: {
		...(existsSync(macIconPath) ? { icon: macIconPath } : {}),
		category: "public.app-category.utilities",
		// ZIP is the installer used by electron-updater on macOS; keep the DMG
		// for manual installation. The workflow publishes both with latest-mac.yml.
		target: ["dmg", "zip"],
		hardenedRuntime: true,
		gatekeeperAssess: false,
		// Credential-free CI builds intentionally produce an unsigned DMG.
		// electron-builder otherwise attempts notarization with empty secret values.
		notarize: shouldNotarize,
		entitlements: join(pkg.resources, "build/entitlements.mac.plist"),
		entitlementsInherit: join(
			pkg.resources,
			"build/entitlements.mac.inherit.plist",
		),
		extendInfo: {
			CFBundleName: productName,
			CFBundleDisplayName: productName,
			// Required for macOS microphone permission prompt
			NSMicrophoneUsageDescription:
				"Superset needs microphone access so voice-enabled tools like Codex transcription can capture audio input.",
			// Required for macOS local network permission prompt
			NSLocalNetworkUsageDescription:
				"Superset needs access to your local network to discover and connect to development servers running on your network.",
			// Bonjour service types to browse for (triggers the permission prompt)
			NSBonjourServices: ["_http._tcp", "_https._tcp"],
			// Required for Apple Events / Automation permission prompt
			NSAppleEventsUsageDescription:
				"Superset needs to interact with other applications to run terminal commands and development tools.",
		},
	},

	// Deep linking protocol
	protocols: {
		name: productName,
		schemes: ["superset"],
	},

	// Linux
	linux: {
		...(existsSync(linuxIconPath) ? { icon: linuxIconPath } : {}),
		category: "Utility",
		synopsis: pkg.description,
		target: ["AppImage"],
		artifactName: `superset-\${version}-\${arch}.\${ext}`,
	},

	// Windows
	win: {
		...(existsSync(winIconPath) ? { icon: winIconPath } : {}),
		target: [
			{
				target: "nsis",
				arch: ["x64"],
			},
		],
		artifactName: `${productName}-${pkg.version}-\${arch}.\${ext}`,
	},

	// NSIS installer (Windows)
	nsis: {
		oneClick: false,
		allowToChangeInstallationDirectory: true,
	},
};

export default config;
