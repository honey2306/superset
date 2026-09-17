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

export const MAX_INLINE_IMAGE_BYTES = 128 * 1024;

/**
 * User prompt images stay inline (the renderer displays them from journal
 * frames), but a single journal envelope must never approach the daemon's
 * 16 MiB socket frame limit or the 8 MiB message-page budget. Typical
 * screenshots are well under this; only pathological pastes are externalized.
 */
export const MAX_INLINE_PROMPT_IMAGE_BYTES = 6 * 1024 * 1024;

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

	/** Returns the same references as boundRawOutput without writing files. */
	previewBoundRawOutput(sessionId: string, value: unknown): unknown {
		if (typeof value === "string") return this.previewDataUrl(sessionId, value);
		if (Array.isArray(value))
			return value.map((item) => this.previewBoundRawOutput(sessionId, item));
		if (!value || typeof value !== "object") return value;
		const record = value as Record<string, unknown>;
		if (
			record.type === "image" &&
			typeof record.data === "string" &&
			typeof record.mimeType === "string" &&
			record.data.length > MAX_INLINE_IMAGE_BYTES
		) {
			return this.referenceForBase64(sessionId, record.data, record.mimeType);
		}
		return Object.fromEntries(
			Object.entries(record).map(([key, item]) => [
				key,
				this.previewBoundRawOutput(sessionId, item),
			]),
		);
	}

	/**
	 * Bounds a single prompt content block: an inline image above the prompt
	 * budget becomes an artifact reference; everything else is returned as-is
	 * (same object identity, so callers can cheaply detect a rewrite).
	 */
	boundPromptBlock(sessionId: string, block: unknown): unknown {
		const image = oversizedPromptImage(block);
		if (!image) return block;
		return this.storeBase64(sessionId, image.data, image.mimeType);
	}

	/** Returns the same reference as boundPromptBlock without writing files. */
	previewBoundPromptBlock(sessionId: string, block: unknown): unknown {
		const image = oversizedPromptImage(block);
		if (!image) return block;
		return this.referenceForBase64(sessionId, image.data, image.mimeType);
	}

	get rootPath(): string {
		return this.rootDirectory;
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

	private previewDataUrl(
		sessionId: string,
		value: string,
	): string | AcpArtifactReference {
		const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i.exec(
			value,
		);
		if (!match || value.length <= MAX_INLINE_IMAGE_BYTES) return value;
		const [, mimeType, data] = match;
		return this.referenceForBase64(
			sessionId,
			data ?? "",
			mimeType ?? "image/*",
		);
	}

	private storeBase64(
		sessionId: string,
		data: string,
		mimeType: string,
	): AcpArtifactReference {
		const reference = this.referenceForBase64(sessionId, data, mimeType);
		const bytes = Buffer.from(data, "base64");
		const directory = this.sessionDirectory(sessionId);
		const artifactPath = reference.locator.path;
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
		return reference;
	}

	private referenceForBase64(
		sessionId: string,
		data: string,
		mimeType: string,
	): AcpArtifactReference {
		const bytes = Buffer.from(data, "base64");
		const sha256 = createHash("sha256").update(bytes).digest("hex");
		const extension = mimeType === "image/png" ? "png" : "img";
		const artifactPath = path.join(
			this.sessionDirectory(sessionId),
			`${sha256}.${extension}`,
		);
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

function oversizedPromptImage(
	block: unknown,
): { data: string; mimeType: string } | null {
	if (!block || typeof block !== "object") return null;
	const record = block as Record<string, unknown>;
	if (
		record.type !== "image" ||
		typeof record.data !== "string" ||
		typeof record.mimeType !== "string" ||
		record.data.length <= MAX_INLINE_PROMPT_IMAGE_BYTES
	) {
		return null;
	}
	return { data: record.data, mimeType: record.mimeType };
}
