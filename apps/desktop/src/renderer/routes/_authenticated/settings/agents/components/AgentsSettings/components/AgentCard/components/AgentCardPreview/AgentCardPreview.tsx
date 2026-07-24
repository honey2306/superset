import type { ResolvedAgentConfig } from "@superset/shared/agent-settings";
import { Button } from "@superset/ui/button";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import { useTranslation } from "renderer/providers/I18nProvider";

interface AgentCardPreviewProps {
	preset: ResolvedAgentConfig;
	showPreview: boolean;
	previewPrompt: string;
	previewNoPromptCommand: string;
	previewTaskCommand: string;
	onToggle: () => void;
}

export function AgentCardPreview({
	preset,
	showPreview,
	previewPrompt,
	previewNoPromptCommand,
	previewTaskCommand,
	onToggle,
}: AgentCardPreviewProps) {
	const { t } = useTranslation();
	return (
		<>
			<div className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3">
				<div>
					<p className="text-sm font-medium">{t("agents.preview")}</p>
					<p className="text-xs text-muted-foreground">
						{t("agents.previewDescription")}
					</p>
				</div>
				<Button type="button" variant="outline" size="sm" onClick={onToggle}>
					{showPreview ? t("agents.hidePreview") : t("agents.showPreview")}
				</Button>
			</div>

			{showPreview && (
				<div className="space-y-3 rounded-lg border bg-muted/30 p-4">
					<div className="space-y-1">
						<p className="text-xs font-medium text-muted-foreground">
							{t("agents.renderedTaskPrompt")}
						</p>
						<MarkdownRenderer
							content={previewPrompt}
							className="h-64 rounded-md border bg-background text-sm"
						/>
					</div>
					{preset.kind === "terminal" && (
						<div className="space-y-1">
							<p className="text-xs font-medium text-muted-foreground">
								{t("agents.noPromptLaunch")}
							</p>
							<pre className="whitespace-pre-wrap rounded-md bg-background p-3 text-xs">
								{previewNoPromptCommand}
							</pre>
						</div>
					)}
					<div className="space-y-1">
						<p className="text-xs font-medium text-muted-foreground">
							{preset.kind === "terminal"
								? t("agents.taskLaunch")
								: t("agents.chatLaunch")}
						</p>
						<pre className="whitespace-pre-wrap rounded-md bg-background p-3 text-xs">
							{previewTaskCommand}
						</pre>
					</div>
				</div>
			)}
		</>
	);
}
