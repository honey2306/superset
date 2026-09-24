import type { SkillDetail, SkillScope } from "@superset/shared/skills";
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { type SkillProject, skillKeys } from "../../skill-types";
import { SkillScopePicker } from "../SkillScopePicker/SkillScopePicker";
export function SkillCopyDialog({
	hostUrl,
	scope,
	skill,
	projects,
	onClose,
}: {
	hostUrl: string;
	scope: SkillScope;
	skill: SkillDetail;
	projects: SkillProject[];
	onClose(): void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const id = useId();
	const [target, setTarget] = useState<SkillScope>(
		scope.kind === "project"
			? { kind: "global" }
			: projects[0]
				? { kind: "project", projectId: projects[0].id }
				: { kind: "global" },
	);
	const [name, setName] = useState(skill.name);
	const copy = useMutation({
		mutationFn: () =>
			getHostServiceClientByUrl(hostUrl).settings.skills.copy.mutate({
				source: { scope, name: skill.name },
				expectedRevision: skill.revision,
				target: { scope: target, name },
			}),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: skillKeys.all(hostUrl) });
			onClose();
		},
	});
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !copy.isPending) onClose();
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("skillsUi.copyTitle")}</DialogTitle>
					<DialogDescription>{t("skillsUi.copyHint")}</DialogDescription>
				</DialogHeader>
				<form
					onSubmit={(event) => {
						event.preventDefault();
						copy.mutate();
					}}
					className="space-y-4"
				>
					<SkillScopePicker
						scope={target}
						projects={projects}
						onChange={setTarget}
						disabled={copy.isPending}
						label={t("skillsUi.copyTarget")}
					/>
					<div className="space-y-2">
						<Label htmlFor={`${id}-name`}>{t("skillsUi.copyName")}</Label>
						<Input
							id={`${id}-name`}
							value={name}
							onChange={(event) => setName(event.target.value)}
							required
							pattern="[a-z0-9][a-z0-9-]*"
							maxLength={64}
							disabled={copy.isPending}
						/>
					</div>
					<p className="select-text cursor-text text-xs text-muted-foreground">
						{skill.files.map((file) => file.path).join(" · ")}
					</p>
					{copy.error && (
						<p
							role="alert"
							className="select-text cursor-text text-sm text-destructive"
						>
							{copy.error.message}
						</p>
					)}
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							disabled={copy.isPending}
							onClick={onClose}
						>
							{t("skillsUi.cancel")}
						</Button>
						<Button type="submit" disabled={copy.isPending}>
							{t(copy.isPending ? "skillsUi.saving" : "skillsUi.copyConfirm")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
