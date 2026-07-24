import { useTranslation } from "renderer/providers/I18nProvider";
import { OAuthDialog, type OAuthDialogProps } from "../OAuthDialog";

type OpenAIOAuthDialogProps = Omit<OAuthDialogProps, "provider">;

export function OpenAIOAuthDialog(props: OpenAIOAuthDialogProps) {
	const { t } = useTranslation();

	const OPENAI_PROVIDER: OAuthDialogProps["provider"] = {
		title: t("oauthDialog.connectOpenAI"),
		description: t("oauthDialog.approveAccessOpenAI"),
		codeLabel: t("oauthDialog.codeLabelOpenAI"),
		codePlaceholder: t("oauthDialog.codePlaceholderOpenAI"),
		codeHint: t("oauthDialog.codeHintOpenAI"),
		preparingLabel: t("oauthDialog.preparingOpenAI"),
	};

	return <OAuthDialog {...props} provider={OPENAI_PROVIDER} />;
}
