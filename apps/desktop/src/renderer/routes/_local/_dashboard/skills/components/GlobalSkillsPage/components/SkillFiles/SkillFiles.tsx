import type { SkillDetail, SkillScope } from "@superset/shared/skills";
import { Button } from "@superset/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { skillKeys } from "../../skill-types";
export function SkillFiles({
	hostUrl,
	scope,
	skill,
}: {
	hostUrl: string;
	scope: SkillScope;
	skill: SkillDetail;
}) {
	const { t } = useTranslation();
	const [selected, setSelected] = useState("");
	const file = useQuery({
		queryKey: skillKeys.file(
			hostUrl,
			scope,
			skill.name,
			selected,
			skill.revision,
		),
		enabled: Boolean(selected),
		queryFn: () =>
			getHostServiceClientByUrl(hostUrl).settings.skills.readFile.query({
				scope,
				name: skill.name,
				path: selected,
			}),
	});
	const companions = skill.files.filter((item) => item.path !== "SKILL.md");
	return (
		<section className="space-y-3 rounded-lg border p-4">
			<h3 className="font-medium">
				{t("skillsUi.files")} ({skill.files.length})
			</h3>
			<p className="text-xs text-muted-foreground">{t("skillsUi.filesHint")}</p>
			{!companions.length && (
				<p className="text-sm text-muted-foreground">{t("skillsUi.noFiles")}</p>
			)}
			<div className="flex flex-wrap gap-2">
				{companions.map((item) => (
					<Button
						key={item.path}
						type="button"
						size="sm"
						variant={selected === item.path ? "secondary" : "outline"}
						onClick={() => setSelected(item.path)}
						className="max-w-full"
					>
						<span className="truncate font-mono text-xs">{item.path}</span>
						<span className="text-xs text-muted-foreground">{item.size} B</span>
					</Button>
				))}
			</div>
			{file.isFetching && selected && (
				<p className="text-xs text-muted-foreground">{t("skillsUi.loading")}</p>
			)}
			{file.error && (
				<p
					role="alert"
					className="select-text cursor-text text-sm text-destructive"
				>
					{file.error.message}
				</p>
			)}
			{file.data && (
				<>
					<p className="select-text cursor-text break-all font-mono text-xs">
						{file.data.path}
					</p>
					{file.data.revision !== skill.revision && (
						<p role="alert" className="text-sm text-warning">
							{t("skillsUi.fileChanged")}
						</p>
					)}
					<pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/50 p-3 font-mono text-xs select-text cursor-text">
						{file.data.content ?? file.data.reason}
					</pre>
				</>
			)}
		</section>
	);
}
