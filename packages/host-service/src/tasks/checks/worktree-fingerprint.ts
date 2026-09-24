import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readlink, realpath } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
async function git(cwd: string, args: string[]): Promise<string> {
	const { stdout } = await exec("git", ["--no-optional-locks", ...args], {
		cwd,
		encoding: "utf8",
		timeout: 15_000,
		maxBuffer: 16 * 1024 * 1024,
	});
	return stdout;
}

/** Boundary snapshot, not a file-system sandbox. Ignored outputs are not inputs.
 * Fail closed on oversized/unsupported trees instead of certifying partial hashes. */
export async function fingerprintWorktree(cwd: string): Promise<{
	ref: string;
	fingerprint: string;
	changes?: Record<string, string>;
}> {
	const root = (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
	const canonicalRoot = await realpath(root);
	const head = (await git(root, ["rev-parse", "--verify", "HEAD"])).trim();
	const branch = (
		await git(root, ["rev-parse", "--abbrev-ref", "HEAD"])
	).trim();
	const [workingDiff, stagedDiff, untracked, changedNames, stagedNames] =
		await Promise.all([
			git(root, [
				"diff",
				"--no-ext-diff",
				"--no-textconv",
				"--binary",
				"HEAD",
				"--",
			]),
			git(root, [
				"diff",
				"--cached",
				"--no-ext-diff",
				"--no-textconv",
				"--binary",
				"HEAD",
				"--",
			]),
			git(root, ["ls-files", "--others", "--exclude-standard", "-z"]),
			git(root, ["diff", "--name-only", "--no-renames", "-z", "HEAD", "--"]),
			git(root, [
				"diff",
				"--cached",
				"--name-only",
				"--no-renames",
				"-z",
				"HEAD",
				"--",
			]),
		]);
	const files = [
		...new Set(
			[untracked, changedNames, stagedNames].flatMap((value) =>
				value.split("\0").filter(Boolean),
			),
		),
	].sort();
	if (files.length > 2_000)
		throw new Error(
			"Too many changed/untracked files to establish verification inputs; isolate this task",
		);
	const hash = createHash("sha256");
	const ref = JSON.stringify({ root: canonicalRoot, head, branch });
	hash.update(
		JSON.stringify([
			ref,
			await realpath(cwd),
			process.version,
			process.platform,
			process.arch,
			workingDiff,
			stagedDiff,
		]),
	);
	const changes: Record<string, string> = {};
	let bytes = Buffer.byteLength(workingDiff) + Buffer.byteLength(stagedDiff);
	for (const file of files) {
		const path = join(root, file);
		const fileHash = createHash("sha256");
		try {
			const info = await lstat(path);
			bytes += info.size;
			if (bytes > 64 * 1024 * 1024)
				throw new Error(
					"Verification input snapshot exceeds 64 MiB; isolate the task",
				);
			fileHash.update(JSON.stringify([info.mode]));
			if (info.isSymbolicLink()) fileHash.update(await readlink(path));
			else if (info.isFile()) fileHash.update(await readFile(path));
			else throw new Error(`Unsupported verification input: ${file}`);
			const after = await lstat(path);
			if (
				info.mtimeMs !== after.mtimeMs ||
				info.size !== after.size ||
				info.ino !== after.ino
			)
				throw new Error(`Verification input changed during capture: ${file}`);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			fileHash.update("<deleted>");
		}
		Object.defineProperty(changes, file, {
			value: fileHash.digest("hex"),
			enumerable: true,
			configurable: true,
			writable: true,
		});
		hash.update(JSON.stringify([file, changes[file]]));
	}
	// Ref changes during capture must not produce a usable snapshot.
	if (
		(await git(root, ["rev-parse", "--verify", "HEAD"])).trim() !== head ||
		(await git(root, ["rev-parse", "--abbrev-ref", "HEAD"])).trim() !== branch
	) {
		throw new Error(
			"Repository reference changed while capturing verification inputs",
		);
	}
	return { ref, fingerprint: hash.digest("hex"), changes };
}
