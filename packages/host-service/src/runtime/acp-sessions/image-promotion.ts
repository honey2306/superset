import { createHash } from "node:crypto";
import type { ContentBlock } from "@superset/session-protocol";

type ImageContentBlock = Extract<ContentBlock, { type: "image" }>;
type JsonRecord = Record<string, unknown>;

const DATA_URL_PATTERN =
	/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i;
const MAX_JSON_STRING_DEPTH = 8;

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedBase64(value: string): string {
	return value.replace(/\s+/g, "");
}

function imageFromDataUrl(value: string): ImageContentBlock | undefined {
	const match = DATA_URL_PATTERN.exec(value.trim());
	if (!match) return undefined;
	return {
		type: "image",
		mimeType: match[1] ?? "image/*",
		data: normalizedBase64(match[2] ?? ""),
	};
}

function imageFromRecord(value: JsonRecord): ImageContentBlock | undefined {
	if (
		value.type === "image" &&
		typeof value.data === "string" &&
		typeof value.mimeType === "string"
	) {
		const dataUrl = imageFromDataUrl(value.data);
		return {
			type: "image",
			mimeType: dataUrl?.mimeType ?? value.mimeType,
			data: dataUrl?.data ?? normalizedBase64(value.data),
		};
	}

	// Some MCP/LLM bridges wrap images using the OpenAI-style image_url shape
	// instead of an ACP `image` block. Normalize those data URLs to ACP too.
	if (value.type === "image_url" || value.type === "imageUrl") {
		const imageUrl = value.image_url ?? value.imageUrl ?? value.url;
		if (typeof imageUrl === "string") return imageFromDataUrl(imageUrl);
		if (isRecord(imageUrl) && typeof imageUrl.url === "string") {
			return imageFromDataUrl(imageUrl.url);
		}
	}

	// An embedded resource with an image MIME type is displayable image content
	// even though ACP transports it through the resource wrapper.
	if (value.type === "resource" && isRecord(value.resource)) {
		const resource = value.resource;
		if (
			typeof resource.blob === "string" &&
			typeof resource.mimeType === "string" &&
			resource.mimeType.toLowerCase().startsWith("image/")
		) {
			return {
				type: "image",
				mimeType: resource.mimeType,
				data: normalizedBase64(resource.blob),
			};
		}
	}

	return undefined;
}

/**
 * Extract image payloads from arbitrary ACP tool content/rawOutput.
 *
 * ACP's `ToolCallContent` wraps standard blocks in `{type:"content", content}`
 * while Pi and MCP implementations commonly put those blocks inside several
 * `content`/`details`/`mcpResult` object layers. We intentionally recurse over
 * JSON values and parse JSON-looking strings because the Pi SDK can serialize
 * an MCP result before placing it in `rawOutput`.
 */
export function extractAcpImageBlocks(value: unknown): ImageContentBlock[] {
	const images: ImageContentBlock[] = [];
	const visited = new WeakSet<object>();

	const visit = (current: unknown, depth: number): void => {
		if (typeof current === "string") {
			const dataUrl = imageFromDataUrl(current);
			if (dataUrl) {
				images.push(dataUrl);
				return;
			}
			if (
				depth < MAX_JSON_STRING_DEPTH &&
				(current.trimStart().startsWith("{") ||
					current.trimStart().startsWith("["))
			) {
				try {
					visit(JSON.parse(current), depth + 1);
				} catch {
					// Ordinary text that starts with `{`/`[` is not an image payload.
				}
			}
			return;
		}
		if (current === null || typeof current !== "object") return;
		if (visited.has(current)) return;
		visited.add(current);

		if (Array.isArray(current)) {
			for (const item of current) visit(item, depth);
			return;
		}
		const record = current as JsonRecord;
		const image = imageFromRecord(record);
		if (image) {
			images.push(image);
			return;
		}
		for (const child of Object.values(record)) visit(child, depth);
	};

	visit(value, 0);
	return images;
}

/** Stable content identity used to deduplicate an image across tool updates. */
export function acpImageKey(image: ImageContentBlock): string {
	return createHash("sha256")
		.update(image.mimeType.toLowerCase())
		.update("\0")
		.update(image.data)
		.digest("hex");
}

export type { ImageContentBlock };
