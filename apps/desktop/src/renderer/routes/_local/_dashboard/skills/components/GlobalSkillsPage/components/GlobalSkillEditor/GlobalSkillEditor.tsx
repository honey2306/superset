import type { SkillDraft } from "@superset/shared/skills";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { Textarea } from "@superset/ui/textarea";
import { useId, useState } from "react";
import { useTranslation } from "renderer/providers/I18nProvider";
import { SkillPreview } from "./components/SkillPreview/SkillPreview";
export interface GlobalSkillEditorValue extends SkillDraft {
	originalName?: string;
	revision: string | null;
}
export function GlobalSkillEditor({
	value,
	isSaving,
	isDirty,
	onChange,
	onSave,
}: {
	value: GlobalSkillEditorValue;
	isSaving: boolean;
	isDirty: boolean;
	onChange(value: GlobalSkillEditorValue): void;
	onSave(): void;
}) {
	const { t } = useTranslation();
	const id = useId();
	const [preview, setPreview] = useState(false);
	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				onSave();
			}}
			className="space-y-5"
		>
			<fieldset disabled={isSaving} className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor={`${id}-name`}>{t("skillsUi.name")}</Label>
					<Input
						id={`${id}-name`}
						aria-label={t("skillsUi.name")}
						value={value.name}
						required
						maxLength={64}
						pattern="[a-z0-9][a-z0-9-]*"
						onChange={(event) =>
							onChange({ ...value, name: event.target.value })
						}
						className="font-mono"
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor={`${id}-description`}>
						{t("skillsUi.description")}
					</Label>
					<Textarea
						id={`${id}-description`}
						aria-label={t("skillsUi.description")}
						value={value.description}
						required
						maxLength={1024}
						placeholder={t("skillsUi.descriptionPlaceholder")}
						onChange={(event) =>
							onChange({ ...value, description: event.target.value })
						}
					/>
				</div>
				<label className="flex items-start gap-2 text-sm">
					<input
						type="checkbox"
						checked={value.invocation === "manual"}
						onChange={(event) =>
							onChange({
								...value,
								invocation: event.target.checked ? "manual" : "auto",
							})
						}
						className="mt-1"
					/>
					{t("skillsUi.manual")}
				</label>
				<div className="flex items-center justify-between">
					<Label htmlFor={`${id}-body`}>{t("skillsUi.instructions")}</Label>
					<div className="flex gap-1">
						<Button
							type="button"
							size="sm"
							variant={preview ? "ghost" : "secondary"}
							onClick={() => setPreview(false)}
						>
							{t("skillsUi.edit")}
						</Button>
						<Button
							type="button"
							size="sm"
							variant={preview ? "secondary" : "ghost"}
							onClick={() => setPreview(true)}
						>
							{t("skillsUi.preview")}
						</Button>
					</div>
				</div>
				{preview ? (
					<div className="min-h-64 rounded-lg border p-4">
						<SkillPreview content={value.instructions} />
					</div>
				) : (
					<Textarea
						id={`${id}-body`}
						aria-label={t("skillsUi.instructions")}
						value={value.instructions}
						required
						maxLength={100000}
						placeholder={t("skillsUi.instructionsPlaceholder")}
						onChange={(event) =>
							onChange({ ...value, instructions: event.target.value })
						}
						className="min-h-72 font-mono text-sm"
					/>
				)}
			</fieldset>
			<div className="flex items-center justify-between gap-3 border-t pt-4">
				<p className="text-xs text-muted-foreground">
					{t(isDirty ? "skillsUi.unsaved" : "skillsUi.saved")}
				</p>
				<Button
					type="submit"
					disabled={
						isSaving ||
						!isDirty ||
						!value.name.trim() ||
						!value.description.trim() ||
						!value.instructions.trim()
					}
				>
					{t(isSaving ? "skillsUi.saving" : "skillsUi.save")}
				</Button>
			</div>
		</form>
	);
}
