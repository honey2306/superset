import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";

type NativeResolver =
	typeof import("@ubjs/node/typescript/dist/resolve-lib.js");

const require = createRequire(import.meta.url);
const resolverPath = join(
	dirname(require.resolve("@ubjs/node/package.json")),
	"typescript/dist/resolve-lib.js",
);
const upstream = require(resolverPath) as NativeResolver;

export function unpackAsarLibraryPath(libraryPath: string): string {
	const asarSegment = `${sep}app.asar${sep}`;
	if (!libraryPath.includes(asarSegment)) return libraryPath;
	const unpackedPath = libraryPath.replace(
		asarSegment,
		`${sep}app.asar.unpacked${sep}`,
	);
	return existsSync(unpackedPath) ? unpackedPath : libraryPath;
}

export function resolveLibPath(
	options: Parameters<NativeResolver["resolveLibPath"]>[0],
): string {
	return unpackAsarLibraryPath(upstream.resolveLibPath(options));
}
