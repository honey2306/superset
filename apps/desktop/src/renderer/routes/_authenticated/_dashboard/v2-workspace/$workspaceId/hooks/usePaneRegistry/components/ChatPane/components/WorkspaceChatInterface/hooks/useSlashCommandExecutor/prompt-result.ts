import type { useTranslation } from "renderer/providers/I18nProvider";

interface PromptResolutionInput {
	handled: boolean;
	prompt?: string;
	commandName?: string;
	invokedAs?: string;
}

interface PromptResolution {
	handled: boolean;
	nextText: string;
	errorMessage?: string;
}

type TranslationFunction = ReturnType<typeof useTranslation>["t"];

function getSlashCommandLabel(input: PromptResolutionInput): string {
	const rawLabel = input.invokedAs?.trim() || input.commandName?.trim() || "";
	const normalized = rawLabel.replace(/^\//, "");
	return normalized || "command";
}

export function resolveSlashPromptResult(
	input: PromptResolutionInput,
	t: TranslationFunction,
): PromptResolution {
	if (!input.handled) {
		return { handled: false, nextText: "" };
	}

	const nextText = (input.prompt ?? "").trim();
	if (nextText.length > 0) {
		return { handled: false, nextText };
	}

	return {
		handled: true,
		nextText: "",
		errorMessage: t("chat.slash.emptyPrompt", {
			label: getSlashCommandLabel(input),
		}),
	};
}
