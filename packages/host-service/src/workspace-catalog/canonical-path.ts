import { realpathSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";
import { normalizeCatalogPathString } from "./collision-report";

/**
 * Canonicalize a filesystem path for the Workspace Catalog identity key.
 *
 * The rule (execplan §Canonicalization): resolve to absolute; if the path
 * exists, use `realpathSync`; if it does not, realpath the nearest
 * existing ancestor and append normalized remaining segments; trim
 * trailing separators except at a filesystem root. No lowercasing.
 *
 * All I/O is synchronous — this is called inside SQLite write
 * transactions on rows the caller already asserts to be host-local. The
 * catch is intentional: on a filesystem denial we degrade to textual
 * normalization rather than throw, because the Catalog must still be
 * able to write an identity row and the caller's Provisioning saga
 * remains responsible for surfacing FS errors elsewhere.
 */
export function canonicalizeHostPath(rawPath: string): string {
	const trimmed = rawPath.trim();
	if (trimmed.length === 0) return trimmed;

	const absolute = isAbsolute(trimmed) ? trimmed : resolve(trimmed);
	const normalized = normalizeCatalogPathString(absolute);

	try {
		return normalizeCatalogPathString(realpathSync(normalized));
	} catch {
		return canonicalizeAgainstNearestAncestor(normalized);
	}
}

function canonicalizeAgainstNearestAncestor(absolutePath: string): string {
	const parts = absolutePath.split(sep);
	// parts[0] is "" for POSIX absolute; on Windows we degrade gracefully.
	for (let cut = parts.length; cut > 0; cut--) {
		const ancestor = parts.slice(0, cut).join(sep) || sep;
		try {
			const real = realpathSync(ancestor);
			const remainder = parts.slice(cut).join(sep);
			if (remainder.length === 0) {
				return normalizeCatalogPathString(real);
			}
			const joined = real.endsWith(sep)
				? `${real}${remainder}`
				: `${real}${sep}${remainder}`;
			return normalizeCatalogPathString(joined);
		} catch {
			// keep walking upwards
		}
	}
	return absolutePath;
}
