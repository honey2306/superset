import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { KeyRoundIcon, Loader2Icon } from "lucide-react";
import { useTranslation } from "renderer/providers/I18nProvider";

interface OpenAIProviderHeadingProps {
	heading: string;
	isConnected: boolean;
	isPending: boolean;
	onOpenAuthModal: () => void;
}

export function OpenAIProviderHeading({
	heading,
	isConnected,
	isPending,
	onOpenAuthModal,
}: OpenAIProviderHeadingProps) {
	const { t } = useTranslation();
	const tooltipLabel = isConnected
		? t("modelPicker.manageInSettings", { provider: "OpenAI" })
		: t("modelPicker.connectInSettings", { provider: "OpenAI" });

	return (
		<div className="text-muted-foreground flex items-center justify-between px-2 py-1.5 text-xs font-medium">
			<span>{heading}</span>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label={tooltipLabel}
						className="text-muted-foreground hover:text-foreground size-6"
						disabled={isPending}
						onClick={(event) => {
							event.preventDefault();
							event.stopPropagation();
							onOpenAuthModal();
						}}
					>
						{isPending ? (
							<Loader2Icon className="size-4 animate-spin" />
						) : (
							<KeyRoundIcon className="size-4" />
						)}
					</Button>
				</TooltipTrigger>
				<TooltipContent side="top" sideOffset={6} showArrow={false}>
					{tooltipLabel}
				</TooltipContent>
			</Tooltip>
		</div>
	);
}
