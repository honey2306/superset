import type { useTranslation } from "renderer/providers/I18nProvider";

type TranslationFunction = ReturnType<typeof useTranslation>["t"];

export function getErrorMessage(
	error: unknown,
	t: TranslationFunction,
): string | null {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	if (error) return t("chat.error.unexpected");
	return null;
}
