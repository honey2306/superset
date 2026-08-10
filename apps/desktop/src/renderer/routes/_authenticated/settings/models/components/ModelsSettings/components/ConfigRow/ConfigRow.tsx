import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { useTranslation } from "renderer/providers/I18nProvider";

interface ConfigRowProps {
	title: string;
	description?: string;
	htmlFor?: string;
	field: ReactNode;
	onSave?: () => void;
	onClear?: () => void;
	saveLabel?: string;
	clearLabel?: string;
	showSave?: boolean;
	showClear?: boolean;
	disableSave?: boolean;
	disableClear?: boolean;
	className?: string;
}

export function ConfigRow({
	title,
	description,
	htmlFor,
	field,
	onSave,
	onClear,
	saveLabel,
	clearLabel,
	showSave = true,
	showClear = true,
	disableSave,
	disableClear,
	className,
}: ConfigRowProps) {
	const { t } = useTranslation();
	const resolvedSaveLabel = saveLabel ?? t("common.save");
	const resolvedClearLabel = clearLabel ?? t("common.clear");
	return (
		<div className={cn("space-y-1.5", className)}>
			<Label htmlFor={htmlFor} className="text-sm font-medium">
				{title}
			</Label>
			{description ? (
				<p className="text-xs text-fg-mute -mt-1">{description}</p>
			) : null}
			<div className="flex items-center gap-2">
				<div className="min-w-0 flex-1">{field}</div>
				{onClear && showClear ? (
					<Button
						variant="outline"
						size="sm"
						onClick={onClear}
						disabled={disableClear}
					>
						{resolvedClearLabel}
					</Button>
				) : null}
				{onSave && showSave ? (
					<Button size="sm" onClick={onSave} disabled={disableSave}>
						{resolvedSaveLabel}
					</Button>
				) : null}
			</div>
		</div>
	);
}
