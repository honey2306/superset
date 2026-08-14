import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import {
	access,
	constants,
	mkdtemp,
	readdir,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export interface MacUpdateAsset {
	version: string;
	url: string;
	sha512: string;
	size?: number;
}

/** Parse only the small, stable subset emitted by electron-builder's YAML. */
export function parseMacUpdateManifest(manifest: string): MacUpdateAsset {
	const version = /^version:\s*([^\s#]+)\s*$/m.exec(manifest)?.[1];
	const files = [
		...manifest.matchAll(
			/(?:^|\n)\s*-\s+url:\s*([^\s#]+)[\s\S]*?\n\s+sha512:\s*([^\s#]+)(?:\n\s+size:\s*(\d+))?/g,
		),
	];
	const match = files.find((file) => file[1].endsWith(".zip"));
	if (!version || !match)
		throw new Error("Invalid latest-mac.yml: missing ZIP asset");
	const url = match[1];
	if (basename(url) !== url || !/^[A-Za-z0-9._-]+\.zip$/.test(url)) {
		throw new Error("Invalid latest-mac.yml: unsafe ZIP filename");
	}
	return {
		version,
		url,
		sha512: match[2],
		size: match[3] ? Number(match[3]) : undefined,
	};
}

export async function downloadVerifiedMacUpdate(
	assetUrl: string,
	asset: MacUpdateAsset,
	onProgress: (transferred: number) => void,
): Promise<string> {
	const response = await fetch(assetUrl);
	if (!response.ok || !response.body)
		throw new Error(`Update download failed (${response.status})`);
	const contentLength = response.headers.get("content-length");
	if (asset.size && contentLength && Number(contentLength) !== asset.size) {
		throw new Error("Update download size does not match manifest");
	}
	const directory = await mkdtemp(join(tmpdir(), "superset-update-"));
	const archivePath = join(directory, asset.url);
	try {
		let transferred = 0;
		const hash = createHash("sha512");
		const source = Readable.fromWeb(response.body as never);
		source.on("data", (chunk: Buffer) => {
			transferred += chunk.length;
			hash.update(chunk);
			onProgress(transferred);
		});
		await pipeline(source, createWriteStream(archivePath));
		if (asset.size && transferred !== asset.size)
			throw new Error("Downloaded update size does not match manifest");
		if (hash.digest("base64") !== asset.sha512)
			throw new Error("Downloaded update checksum does not match manifest");
		return archivePath;
	} catch (error) {
		await cleanupUpdateDirectory(directory);
		throw error;
	}
}

/** Only removes a directory that this module created under the OS temp folder. */
export async function cleanupUpdateDirectory(directory: string): Promise<void> {
	if (
		dirname(directory) !== tmpdir() ||
		!basename(directory).startsWith("superset-update-")
	) {
		throw new Error("Refusing to clean an unexpected update directory");
	}
	await rm(directory, { recursive: true, force: true });
}

function run(command: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
		let output = "";
		child.stdout.on("data", (chunk) => {
			output += chunk;
		});
		child.once("error", reject);
		child.once("close", (code) =>
			code === 0
				? resolve(output.trim())
				: reject(new Error(`${command} failed`)),
		);
	});
}

export async function unpackAndValidateMacUpdate(
	archivePath: string,
	expectedVersion: string,
): Promise<string> {
	const directory = dirname(archivePath);
	const expanded = join(directory, "expanded");
	await run("/usr/bin/ditto", ["-x", "-k", archivePath, expanded]);
	const apps = (await readdir(expanded, { withFileTypes: true })).filter(
		(entry) => entry.isDirectory() && entry.name.endsWith(".app"),
	);
	if (apps.length !== 1)
		throw new Error("Update archive must contain exactly one app bundle");
	const appPath = join(expanded, apps[0].name);
	const plist = join(appPath, "Contents", "Info.plist");
	const [bundleId, version] = await Promise.all([
		run("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleIdentifier", plist]),
		run("/usr/libexec/PlistBuddy", [
			"-c",
			"Print :CFBundleShortVersionString",
			plist,
		]),
	]);
	if (bundleId !== "com.superset.desktop" || version !== expectedVersion)
		throw new Error("Update app bundle identity or version is invalid");
	return appPath;
}

export async function ensureWritableInstallLocation(
	appPath: string,
): Promise<void> {
	await access(dirname(appPath), constants.W_OK);
}

export function installerScript(): string {
	return `#!/bin/sh
set -eu
pid="$1"
source="$2"
target="$3"
backup="$4"
cleanup="$5"
case "$source" in /*.app) ;; *) exit 1 ;; esac
case "$target" in /*.app) ;; *) exit 1 ;; esac
case "$cleanup" in /*/superset-update-*) ;; *) exit 1 ;; esac
while kill -0 "$pid" 2>/dev/null; do sleep 1; done
/bin/rm -rf "$backup"
if ! /bin/mv "$target" "$backup"; then
  exit 1
fi
if /bin/mv "$source" "$target"; then
  /usr/bin/xattr -d com.apple.quarantine "$target" 2>/dev/null || true
  /usr/bin/open "$target"
  /bin/rm -rf "$backup" "$cleanup"
else
  /bin/rm -rf "$target"
  /bin/mv "$backup" "$target" || true
  exit 1
fi
`;
}

export async function launchMacInstaller(
	source: string,
	target: string,
): Promise<void> {
	if (
		!isAbsolute(source) ||
		!isAbsolute(target) ||
		!source.endsWith(".app") ||
		!target.endsWith(".app")
	) {
		throw new Error("Invalid macOS installer paths");
	}
	const scriptPath = join(dirname(source), "install.sh");
	const updateDirectory = dirname(dirname(source));
	if (
		dirname(updateDirectory) !== tmpdir() ||
		!basename(updateDirectory).startsWith("superset-update-")
	) {
		throw new Error("Invalid macOS update directory");
	}
	const backup = `${target}.superset-update-backup`;
	await writeFile(scriptPath, installerScript(), { mode: 0o700 });
	const child = spawn(
		"/bin/sh",
		[scriptPath, String(process.pid), source, target, backup, updateDirectory],
		{ detached: true, stdio: "ignore" },
	);
	child.unref();
}
