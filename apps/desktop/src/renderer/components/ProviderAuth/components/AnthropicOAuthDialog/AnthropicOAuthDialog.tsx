import { useTranslation } from "renderer/providers/I18nProvider";
import { OAuthDialog, type OAuthDialogProps } from "../OAuthDialog";

type AnthropicOAuthDialogProps = Omit<OAuthDialogProps, "provider">;

export function AnthropicOAuthDialog(props: AnthropicOAuthDialogProps) {
	const { t } = useTranslation();

	const ANTHROPIC_PROVIDER: OAuthDialogProps["provider"] = {
		title: t("oauthDialog.connectAnthropic"),
		description: t("oauthDialog.approveAccessAnthropic"),
		codeLabel: t("oauthDialog.codeLabelAnthropic"),
		codePlaceholder: t("oauthDialog.codePlaceholderAnthropic"),
		codeHint: t("oauthDialog.codeHintAnthropic"),
		preparingLabel: t("oauthDialog.preparingAnthropic"),
	};

	return (
		<OAuthDialog
			{...props}
			provider={ANTHROPIC_PROVIDER}
			requireCodeForSubmit
		/>
	);
}
