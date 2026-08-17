import { createHash, randomUUID } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";

const MAX_INLINE_IMAGE_BYTES = 128 * 1024;

export interface AcpArtifactReference {
	type: "acp-artifact";
	artifactId: string;
	sha256: string;
	mimeType: string;
	byteSize: number;
	locator: { kind: "file"; path: string };
}

/** Session-scoped content-addressed storage for oversized tool-result images. */
export class AcpArtifactStore {
	constructor(private readonly rootDirectory: string) {}

	boundRawOutput(sessionId: string, value: unknown): unknown {
		if (typeof value === "string") return this.boundDataUrl(sessionId, value);
		if (Array.isArray(value))
			return value.map((item) => this.boundRawOutput(sessionId, item));
		if (!value || typeof value !== "object") return value;
		const record = value as Record<string, unknown>;
		if (
			record.type === "image" &&
			typeof record.data === "string" &&
			typeof record.mimeType === "string" &&
			record.data.length > MAX_INLINE_IMAGE_BYTES
		) {
			return this.storeBase64(sessionId, record.data, record.mimeType);
		}
		return Object.fromEntries(
			Object.entries(record).map(([key, item]) => [
				key,
				this.boundRawOutput(sessionId, item),
			]),
		);
	}

	removeSession(sessionId: string): void {
		rmSync(this.sessionDirectory(sessionId), { recursive: true, force: true });
	}

	private boundDataUrl(
		sessionId: string,
		value: string,
	): string | AcpArtifactReference {
		const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i.exec(
			value,
		);
		if (!match || value.length <= MAX_INLINE_IMAGE_BYTES) return value;
		const [, mimeType, data] = match;
		return this.storeBase64(sessionId, data ?? "", mimeType ?? "image/*");
	}

	private storeBase64(
		sessionId: string,
		data: string,
		mimeType: string,
	): AcpArtifactReference {
		const bytes = Buffer.from(data, "base64");
		const sha256 = createHash("sha256").update(bytes).digest("hex");
		const extension = mimeType === "image/png" ? "png" : "img";
		const directory = this.sessionDirectory(sessionId);
		const artifactPath = path.join(directory, `${sha256}.${extension}`);
		if (!existsSync(artifactPath)) {
			mkdirSync(directory, { recursive: true, mode: 0o700 });
			const temporaryPath = path.join(directory, `.${randomUUID()}.tmp`);
			try {
				writeFileSync(temporaryPath, bytes, { flag: "wx", mode: 0o600 });
				renameSync(temporaryPath, artifactPath);
				chmodSync(artifactPath, 0o600);
			} catch (error) {
				rmSync(temporaryPath, { force: true });
				if (!existsSync(artifactPath)) throw error;
			}
		}
		return {
			type: "acp-artifact",
			artifactId: sha256,
			sha256,
			mimeType,
			byteSize: bytes.byteLength,
			locator: { kind: "file", path: artifactPath },
		};
	}

	private sessionDirectory(sessionId: string): string {
		const id = createHash("sha256").update(sessionId).digest("hex");
		return path.join(this.rootDirectory, id);
	}
}
