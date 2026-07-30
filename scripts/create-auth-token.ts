#!/usr/bin/env bun
import { execFileSync } from "node:child_process";
import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
import fs, { readFileSync } from "node:fs";
import { homedir, hostname, platform } from "node:os";
import { join } from "node:path";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

function getRawMachineId(): string {
	try {
		const os = platform();

		if (os === "darwin") {
			const output = execFileSync(
				"ioreg",
				["-rd1", "-c", "IOPlatformExpertDevice"],
				{ encoding: "utf8" },
			);
			const match = output.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
			if (match?.[1]) return match[1];
		} else if (os === "linux") {
			try {
				return readFileSync("/etc/machine-id", "utf8").trim();
			} catch {
				return readFileSync("/var/lib/dbus/machine-id", "utf8").trim();
			}
		} else if (os === "win32") {
			const output = execFileSync(
				"reg",
				[
					"query",
					"HKLM\\SOFTWARE\\Microsoft\\Cryptography",
					"/v",
					"MachineGuid",
				],
				{ encoding: "utf8" },
			);
			const match = output.match(/MachineGuid\s+REG_SZ\s+(\S+)/);
			if (match?.[1]) return match[1];
		}
	} catch {
		// Fallback if platform-specific method fails
	}

	return `${hostname()}-${homedir()}-superset-fallback`;
}

function deriveKey(salt: Buffer): Buffer {
	return scryptSync(getRawMachineId(), salt, KEY_LENGTH);
}

function encrypt(plaintext: string): Buffer {
	const salt = randomBytes(SALT_LENGTH);
	const key = deriveKey(salt);
	const iv = randomBytes(IV_LENGTH);

	const cipher = createCipheriv(ALGORITHM, key, iv);
	const encrypted = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	const authTag = cipher.getAuthTag();

	return Buffer.concat([salt, iv, authTag, encrypted]);
}

// Session token from database
const token = process.argv[2] || "dae26cfd-7b88-4778-bfa8-0348c5b6d9fb";
const expiresAt = process.argv[3] || "2026-08-28T07:03:39.084Z";

const data = JSON.stringify({ token, expiresAt });
const encrypted = encrypt(data);

const tokenFile = join(homedir(), "superset", "auth-token.enc");
fs.mkdirSync(join(homedir(), "superset"), { recursive: true });
fs.writeFileSync(tokenFile, encrypted);

console.log("✓ Token file created:", tokenFile);
console.log("  Token:", token);
console.log("  Expires:", expiresAt);
