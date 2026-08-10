import { chatServiceTrpc } from "@superset/chat/client";
import {
	ModelSelector,
	ModelSelectorContent,
	ModelSelectorEmpty,
	ModelSelectorInput,
	ModelSelectorList,
	ModelSelectorLogo,
	ModelSelectorTrigger,
} from "@superset/ui/ai-elements/model-selector";
import { PromptInputButton } from "@superset/ui/ai-elements/prompt-input";
import { claudeIcon } from "@superset/ui/icons/preset-icons";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useTranslation } from "renderer/providers/I18nProvider";
import { PILL_BUTTON_CLASS } from "../../styles";
import type { ModelOption } from "../../types";
import { ModelProviderGroup } from "./components/ModelProviderGroup";
import { groupModelsByProvider } from "./utils/groupModelsByProvider";
import {
	ANTHROPIC_LOGO_PROVIDER,
	providerToLogo,
} from "./utils/providerToLogo";

interface ModelPickerProps {
	models: ModelOption[];
	selectedModel: ModelOption | null;
	onSelectModel: (model: ModelOption) => void;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function ModelPicker({
	models,
	selectedModel,
	onSelectModel,
	open,
	onOpenChange,
}: ModelPickerProps) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const groupedModels = useMemo(() => groupModelsByProvider(models), [models]);
	const selectedLogo = selectedModel
		? providerToLogo(selectedModel.provider)
		: null;
	const { data: anthropicStatus, refetch: refetchAnthropicStatus } =
		chatServiceTrpc.auth.getAnthropicStatus.useQuery();
	const { data: openAIStatus, refetch: refetchOpenAIStatus } =
		chatServiceTrpc.auth.getOpenAIStatus.useQuery();

	useEffect(() => {
		if (!open) return;
		void Promise.all([refetchAnthropicStatus(), refetchOpenAIStatus()]);
	}, [open, refetchAnthropicStatus, refetchOpenAIStatus]);

	const openModelsSettings = () => {
		onOpenChange(false);
		void navigate({ to: "/settings/models" });
	};

	return (
		<ModelSelector open={open} onOpenChange={onOpenChange}>
			<ModelSelectorTrigger asChild>
				<PromptInputButton
					className={`${PILL_BUTTON_CLASS} px-2 gap-1.5 text-xs text-fg`}
				>
					{selectedLogo === ANTHROPIC_LOGO_PROVIDER ? (
						<img alt="Claude" className="size-3" src={claudeIcon} />
					) : selectedLogo ? (
						<ModelSelectorLogo provider={selectedLogo} />
					) : null}
					<span>{selectedModel?.name ?? t("modelPicker.fallback")}</span>
					<ChevronDownIcon className="size-2.5 opacity-50" />
				</PromptInputButton>
			</ModelSelectorTrigger>
			<ModelSelectorContent title={t("modelPicker.selectModel")}>
				<ModelSelectorInput placeholder={t("modelPicker.searchModels")} />
				<ModelSelectorList>
					<ModelSelectorEmpty>
						{t("modelPicker.noModelsFound")}
					</ModelSelectorEmpty>
					{groupedModels.map(([provider, providerModels]) => (
						<ModelProviderGroup
							key={provider}
							provider={provider}
							models={providerModels}
							isAnthropicAuthenticated={anthropicStatus?.authenticated ?? false}
							isAnthropicOAuthPending={false}
							isAnthropicApiKeyPending={false}
							onOpenAnthropicAuthModal={openModelsSettings}
							isOpenAIAuthenticated={openAIStatus?.authenticated ?? false}
							isOpenAIOAuthPending={false}
							isOpenAIApiKeyPending={false}
							onOpenOpenAIAuthModal={openModelsSettings}
							onSelectModel={onSelectModel}
							onCloseModelSelector={() => {
								onOpenChange(false);
							}}
						/>
					))}
				</ModelSelectorList>
			</ModelSelectorContent>
		</ModelSelector>
	);
}
