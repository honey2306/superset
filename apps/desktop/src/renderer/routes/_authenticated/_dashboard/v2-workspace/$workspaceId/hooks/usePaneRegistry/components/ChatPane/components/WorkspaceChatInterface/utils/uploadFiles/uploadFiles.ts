import type { FileUIPart } from "ai";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { isDesktopChatDevMode } from "renderer/lib/dev-chat";
import type { useTranslation } from "renderer/providers/I18nProvider";

type TranslationFunction = ReturnType<typeof useTranslation>["t"];

async function getHttpErrorDetail(response: Response): Promise<string> {
	const errorBody = await response
		.text()
		.then((text) => text.trim())
		.catch(() => "");
	const statusText = response.statusText ? ` ${response.statusText}` : "";
	const detail = errorBody ? ` - ${errorBody.slice(0, 500)}` : "";
	return `${response.status}${statusText}${detail}`;
}

function blobToDataUrl(blob: Blob, t: TranslationFunction): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => {
			reject(reader.error ?? new Error(t("chat.upload.readFailed")));
		};
		reader.onload = () => {
			if (typeof reader.result !== "string") {
				reject(new Error(t("chat.upload.dataUrlFailed")));
				return;
			}

			resolve(reader.result);
		};
		reader.readAsDataURL(blob);
	});
}

async function uploadFile(
	sessionId: string,
	file: FileUIPart,
	t: TranslationFunction,
	signal?: AbortSignal,
): Promise<FileUIPart> {
	const response = await fetch(file.url, { signal });
	if (!response.ok) {
		const detail = await getHttpErrorDetail(response);
		throw new Error(t("chat.upload.fetchFailed", { url: file.url, detail }));
	}

	const blob = await response.blob();
	const filename = file.filename || "attachment";
	if (signal?.aborted) {
		throw new DOMException("The operation was aborted", "AbortError");
	}
	const fileData = await blobToDataUrl(blob, t);

	if (isDesktopChatDevMode()) {
		return {
			type: "file",
			url: fileData,
			mediaType: file.mediaType,
			filename,
		};
	}

	const result = await apiTrpcClient.chat.uploadAttachment.mutate({
		sessionId,
		filename,
		mediaType: file.mediaType,
		fileData,
	});
	return {
		type: "file",
		url: fileData,
		mediaType: result.mediaType,
		filename: result.filename,
	};
}

export async function uploadFiles(
	sessionId: string,
	files: FileUIPart[],
	t: TranslationFunction,
	signal?: AbortSignal,
): Promise<FileUIPart[]> {
	if (files.length === 0) return [];
	return Promise.all(
		files.map((file) => uploadFile(sessionId, file, t, signal)),
	);
}
