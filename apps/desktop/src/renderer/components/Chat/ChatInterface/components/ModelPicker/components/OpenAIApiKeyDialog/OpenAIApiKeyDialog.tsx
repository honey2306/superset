import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { InputGroup, InputGroupInput } from "@superset/ui/input-group";
import { Label } from "@superset/ui/label";
import { useTranslation } from "renderer/providers/I18nProvider";

interface OpenAIApiKeyDialogProps {
	open: boolean;
	apiKey: string;
	errorMessage: string | null;
	isPending: boolean;
	canClearApiKey: boolean;
	onOpenChange: (open: boolean) => void;
	onApiKeyChange: (value: string) => void;
	onSubmit: () => void;
	onClear: () => void;
}

export function OpenAIApiKeyDialog({
	open,
	apiKey,
	errorMessage,
	isPending,
	canClearApiKey,
	onOpenChange,
	onApiKeyChange,
	onSubmit,
	onClear,
}: OpenAIApiKeyDialogProps) {
	const { t } = useTranslation();
	const errorId = "openai-api-key-error";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-[calc(100vw-2rem)] overflow-hidden sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{t("apiKeyDialog.connectOpenAI")}</DialogTitle>
					<DialogDescription>
						{t("apiKeyDialog.pasteOpenAIKey")}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="rounded-ds-5 border border-line/70 bg-hover/15 px-4 py-3 text-sm text-fg-mute">
						{t("apiKeyDialog.modeHintOpenAI")}
					</div>

					<div className="space-y-2">
						<Label htmlFor="openai-api-key">
							{t("apiKeyDialog.apiKeyLabel")}
						</Label>
						<InputGroup className="h-11 border-line/70 bg-hover/10">
							<InputGroupInput
								id="openai-api-key"
								type="password"
								placeholder="sk-..."
								value={apiKey}
								onChange={(event) => onApiKeyChange(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter" && apiKey.trim()) {
										onSubmit();
									}
								}}
								disabled={isPending}
								aria-invalid={Boolean(errorMessage)}
								aria-describedby={errorMessage ? errorId : undefined}
								className="h-11 font-mono"
								autoFocus
							/>
						</InputGroup>
						<p className="text-fg-mute text-xs">
							{t("apiKeyDialog.useSameKeyOpenAI")}
						</p>
					</div>

					{errorMessage ? (
						<p id={errorId} role="alert" className="text-destructive text-sm">
							{errorMessage}
						</p>
					) : null}

					<div className="flex flex-col gap-2 pt-2">
						<Button
							type="button"
							onClick={onSubmit}
							disabled={isPending || apiKey.trim().length === 0}
						>
							{isPending ? t("common.saving") : t("apiKeyDialog.saveKey")}
						</Button>
						<div className="flex items-center justify-between gap-2">
							<Button
								type="button"
								variant="ghost"
								onClick={() => onOpenChange(false)}
								disabled={isPending}
							>
								{t("apiKeyDialog.back")}
							</Button>
							{canClearApiKey ? (
								<Button
									type="button"
									variant="ghost"
									onClick={onClear}
									disabled={isPending}
								>
									{t("apiKeyDialog.clearKey")}
								</Button>
							) : null}
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
