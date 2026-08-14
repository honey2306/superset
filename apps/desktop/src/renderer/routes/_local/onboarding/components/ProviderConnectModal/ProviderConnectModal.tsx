import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { type FormEvent, useState } from "react";
import { LuKeyRound } from "react-icons/lu";
import { AnthropicOAuthDialog } from "renderer/components/ProviderAuth/components/AnthropicOAuthDialog";
import { OpenAIOAuthDialog } from "renderer/components/ProviderAuth/components/OpenAIOAuthDialog";
import { useAnthropicOAuth } from "renderer/components/ProviderAuth/hooks/useAnthropicOAuth";
import { useOpenAIOAuth } from "renderer/components/ProviderAuth/hooks/useOpenAIOAuth";
import { hostServiceTrpc } from "renderer/lib/host-service-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";

export type Provider = "anthropic" | "openai";

interface ProviderConnectModalProps {
	provider: Provider | null;
	onOpenChange: (open: boolean) => void;
}

export function ProviderConnectModal({
	provider,
	onOpenChange,
}: ProviderConnectModalProps) {
	if (provider === "anthropic") {
		return <AnthropicConnectDialog onOpenChange={onOpenChange} />;
	}
	if (provider === "openai") {
		return <OpenAIConnectDialog onOpenChange={onOpenChange} />;
	}
	return null;
}

function AnthropicConnectDialog({
	onOpenChange,
}: {
	onOpenChange: (open: boolean) => void;
}) {
	const { t } = useTranslation();
	const { refetch } = hostServiceTrpc.auth.getAnthropicStatus.useQuery();
	const setApiKey = hostServiceTrpc.auth.setAnthropicApiKey.useMutation();
	const { isStartingOAuth, startAnthropicOAuth, oauthDialog } =
		useAnthropicOAuth({
			isModelSelectorOpen: true,
			onModelSelectorOpenChange: () => {},
			onAuthStateChange: async () => {
				const result = await refetch();
				if (result.data?.authenticated && !result.data.issue) {
					onOpenChange(false);
				}
			},
		});

	const handleApiKeySubmit = async (rawKey: string) => {
		await setApiKey.mutateAsync({ apiKey: rawKey });
		await refetch();
		onOpenChange(false);
	};

	if (oauthDialog.open) {
		return (
			<AnthropicOAuthDialog
				{...oauthDialog}
				onOpenChange={(open) => {
					oauthDialog.onOpenChange(open);
					if (!open) onOpenChange(false);
				}}
			/>
		);
	}

	return (
		<ConnectDialogShell
			title={t("onboarding.connectClaude")}
			description={t("onboarding.connectClaudeDescription")}
			oauthLabel={t("onboarding.continueClaude")}
			oauthPreparing={isStartingOAuth || oauthDialog.isPreparing}
			onOAuth={startAnthropicOAuth}
			apiKeyPlaceholder="sk-ant-..."
			apiKeyHelpUrl="https://console.anthropic.com/settings/keys"
			apiKeyHelpLabel={t("onboarding.anthropicApiKey")}
			onApiKeySubmit={handleApiKeySubmit}
			onOpenChange={onOpenChange}
		/>
	);
}

function OpenAIConnectDialog({
	onOpenChange,
}: {
	onOpenChange: (open: boolean) => void;
}) {
	const { t } = useTranslation();
	const { refetch } = hostServiceTrpc.auth.getOpenAIStatus.useQuery();
	const setApiKey = hostServiceTrpc.auth.setOpenAIApiKey.useMutation();
	const { isStartingOAuth, startOpenAIOAuth, oauthDialog } = useOpenAIOAuth({
		isModelSelectorOpen: true,
		onModelSelectorOpenChange: () => {},
		onAuthStateChange: async () => {
			const result = await refetch();
			if (result.data?.authenticated && !result.data.issue) {
				onOpenChange(false);
			}
		},
	});

	const handleApiKeySubmit = async (rawKey: string) => {
		await setApiKey.mutateAsync({ apiKey: rawKey });
		await refetch();
		onOpenChange(false);
	};

	if (oauthDialog.open) {
		return (
			<OpenAIOAuthDialog
				{...oauthDialog}
				onOpenChange={(open) => {
					oauthDialog.onOpenChange(open);
					if (!open) onOpenChange(false);
				}}
			/>
		);
	}

	return (
		<ConnectDialogShell
			title={t("onboarding.connectCodex")}
			description={t("onboarding.connectCodexDescription")}
			oauthLabel={t("onboarding.signInChatGPT")}
			oauthPreparing={isStartingOAuth}
			onOAuth={startOpenAIOAuth}
			apiKeyPlaceholder="sk-..."
			apiKeyHelpUrl="https://platform.openai.com/api-keys"
			apiKeyHelpLabel={t("onboarding.openaiApiKey")}
			onApiKeySubmit={handleApiKeySubmit}
			onOpenChange={onOpenChange}
		/>
	);
}

interface ConnectDialogShellProps {
	title: string;
	description: string;
	oauthLabel: string;
	oauthPreparing: boolean;
	onOAuth: () => undefined | Promise<unknown>;
	apiKeyPlaceholder: string;
	apiKeyHelpUrl: string;
	apiKeyHelpLabel: string;
	onApiKeySubmit: (key: string) => Promise<void>;
	onOpenChange: (open: boolean) => void;
}

function ConnectDialogShell({
	title,
	description,
	oauthLabel,
	oauthPreparing,
	onOAuth,
	apiKeyPlaceholder,
	apiKeyHelpUrl,
	apiKeyHelpLabel,
	onApiKeySubmit,
	onOpenChange,
}: ConnectDialogShellProps) {
	const { t } = useTranslation();
	const [mode, setMode] = useState<"choose" | "api-key">("choose");
	const [apiKey, setApiKey] = useState("");
	const [submitting, setSubmitting] = useState(false);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		const trimmed = apiKey.trim();
		if (!trimmed) return;
		setSubmitting(true);
		try {
			await onApiKeySubmit(trimmed);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : t("onboarding.apiKeySaveFailed"),
			);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Dialog open onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[420px]">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>

				{mode === "choose" ? (
					<div className="flex flex-col gap-2">
						<Button
							size="sm"
							onClick={() => void onOAuth()}
							disabled={oauthPreparing}
						>
							{oauthPreparing ? t("onboarding.preparing") : oauthLabel}
						</Button>
						<Button
							size="sm"
							variant="outline"
							onClick={() => setMode("api-key")}
						>
							<LuKeyRound />
							{t("onboarding.useApiKey")}
						</Button>
					</div>
				) : (
					<form onSubmit={handleSubmit} className="flex flex-col gap-3">
						<Input
							type="password"
							autoComplete="off"
							placeholder={apiKeyPlaceholder}
							value={apiKey}
							onChange={(e) => setApiKey(e.target.value)}
							disabled={submitting}
							autoFocus
						/>
						<a
							href={apiKeyHelpUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="text-xs text-fg-mute underline-offset-4 hover:text-fg hover:underline"
						>
							{apiKeyHelpLabel}
						</a>
						<div className="flex items-center justify-end gap-2 pt-2">
							<Button
								type="button"
								size="sm"
								variant="ghost"
								onClick={() => setMode("choose")}
								disabled={submitting}
							>
								{t("onboarding.back")}
							</Button>
							<Button type="submit" size="sm" disabled={submitting}>
								{submitting
									? t("onboarding.saving")
									: t("onboarding.saveConnect")}
							</Button>
						</div>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}
