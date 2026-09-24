import type { SkillScope } from "@superset/shared/skills";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useTranslation } from "renderer/providers/I18nProvider";
import { type SkillProject, scopeKey } from "../../skill-types";
export function SkillScopePicker({
	scope,
	projects,
	onChange,
	disabled = false,
	label,
}: {
	scope: SkillScope;
	projects: SkillProject[];
	onChange(scope: SkillScope): void;
	disabled?: boolean;
	label?: string;
}) {
	const { t } = useTranslation();
	return (
		<Select
			value={scopeKey(scope)}
			disabled={disabled}
			onValueChange={(value) =>
				onChange(
					value === "global"
						? { kind: "global" }
						: { kind: "project", projectId: value.slice("project:".length) },
				)
			}
		>
			<SelectTrigger
				aria-label={label ?? t("skillsUi.scope")}
				className="w-full"
			>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="global">{t("skillsUi.global")}</SelectItem>
				{projects.map((project) => (
					<SelectItem key={project.id} value={`project:${project.id}`}>
						{t("skillsUi.project")} · {project.name || project.repoPath}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
