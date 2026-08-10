import { ToolCallRow } from "@superset/ui/ai-elements/tool-call-row";
import { ZapIcon } from "lucide-react";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { ToolPart } from "../../../../utils/tool-helpers";

type SkillToolCallProps = {
	part: ToolPart;
	skillName: string;
};

export function SkillToolCall({ part, skillName }: SkillToolCallProps) {
	const { t } = useTranslation();
	const isError = part.state === "output-error";
	const isPending =
		part.state !== "output-available" && part.state !== "output-error";

	return (
		<ToolCallRow
			icon={ZapIcon}
			isError={isError}
			isPending={isPending}
			title={t("chat.tool.skillLabel", { name: skillName })}
		>
			{!isPending ? (
				<div className="py-1 pl-3">
					{isError ? (
						<p className="text-xs text-destructive">
							{t("chat.tool.failedToLoadSkill")}
						</p>
					) : (
						<p className="text-xs text-fg-mute">
							{t("chat.tool.successfullyLoadedSkill")}
						</p>
					)}
				</div>
			) : undefined}
		</ToolCallRow>
	);
}
