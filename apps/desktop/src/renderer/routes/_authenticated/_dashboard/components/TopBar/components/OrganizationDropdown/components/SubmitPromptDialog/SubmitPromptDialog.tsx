import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { useTranslation } from "renderer/providers/I18nProvider";

interface SubmitPromptDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function SubmitPromptDialog({
	open,
	onOpenChange,
}: SubmitPromptDialogProps) {
	const { t } = useTranslation();
	const [promptText, setPromptText] = useState("");
	const [submitterName, setSubmitterName] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const reset = () => {
		setPromptText("");
		setSubmitterName("");
		setIsSubmitting(false);
	};

	const handleOpenChange = (next: boolean) => {
		if (!next) reset();
		onOpenChange(next);
	};

	const canSubmit = promptText.trim().length > 0 && !isSubmitting;

	const handleSubmit = async () => {
		if (!canSubmit) return;
		setIsSubmitting(true);
		try {
			await apiTrpcClient.support.submitPrompt.mutate({
				promptText: promptText.trim(),
				submitterName: submitterName.trim() || undefined,
			});
			toast.success(t("dashboard.promptSubmitted"));
			handleOpenChange(false);
		} catch (error) {
			console.error("[submit-prompt] failed", error);
			toast.error(t("dashboard.promptSubmitFailed"));
			setIsSubmitting(false);
		}
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
			event.preventDefault();
			void handleSubmit();
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{t("dashboard.submitPrompt")}</DialogTitle>
					<DialogDescription>
						{t("dashboard.submitPromptDescription")}
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-4 py-2">
					<div className="flex flex-col gap-2">
						<Label htmlFor="submit-prompt-text">{t("dashboard.prompt")}</Label>
						<Textarea
							id="submit-prompt-text"
							value={promptText}
							onChange={(e) => setPromptText(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder={t("dashboard.promptPlaceholder")}
							rows={6}
							autoFocus
							disabled={isSubmitting}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="submit-prompt-name">
							{t("dashboard.yourName")}{" "}
							<span className="font-normal text-muted-foreground">
								{t("dashboard.promptCreditHint")}
							</span>
						</Label>
						<Input
							id="submit-prompt-name"
							value={submitterName}
							onChange={(e) => setSubmitterName(e.target.value)}
							placeholder={t("dashboard.submitterNamePlaceholder")}
							disabled={isSubmitting}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
						{isSubmitting
							? t("dashboard.submitting")
							: t("dashboard.submitPromptAction")}
						<span className="ml-2 inline-flex items-center gap-1 text-base font-mono tabular-nums opacity-80">
							<span>⌘</span>
							<span>↵</span>
						</span>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
