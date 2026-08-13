import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	EnterEnabledAlertDialogContent,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { RadioGroup, RadioGroupItem } from "@superset/ui/radio-group";
import { useState } from "react";
import { useTranslation } from "renderer/providers/I18nProvider";

export type ResetMode = "soft" | "mixed" | "hard";

interface ResetToCommitDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	shortHash: string;
	onConfirm: (mode: ResetMode) => void;
	isPending?: boolean;
}

export function ResetToCommitDialog({
	open,
	onOpenChange,
	shortHash,
	onConfirm,
	isPending = false,
}: ResetToCommitDialogProps) {
	const { t } = useTranslation();
	const [mode, setMode] = useState<ResetMode>("mixed");

	const modes: Array<{ value: ResetMode; label: string; desc: string }> = [
		{
			value: "soft",
			label: t("changes.reset.softLabel"),
			desc: t("changes.reset.softDesc"),
		},
		{
			value: "mixed",
			label: t("changes.reset.mixedLabel"),
			desc: t("changes.reset.mixedDesc"),
		},
		{
			value: "hard",
			label: t("changes.reset.hardLabel"),
			desc: t("changes.reset.hardDesc"),
		},
	];

	const isHard = mode === "hard";

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<EnterEnabledAlertDialogContent className="max-w-[420px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						{t("changes.reset.title", { commit: shortHash })}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{t("changes.reset.modeLabel")}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="px-4 pb-2">
					<RadioGroup
						value={mode}
						onValueChange={(v) => setMode(v as ResetMode)}
						className="gap-2"
					>
						{modes.map((m) => (
							<Label
								key={m.value}
								htmlFor={`reset-mode-${m.value}`}
								className="flex cursor-pointer items-start gap-2 rounded-ds-3 border border-transparent p-2 hover:bg-hover has-[button[data-state=checked]]:border-line has-[button[data-state=checked]]:bg-hover"
							>
								<RadioGroupItem
									id={`reset-mode-${m.value}`}
									value={m.value}
									className="mt-0.5"
								/>
								<div className="flex flex-col gap-0.5">
									<span className="text-xs font-medium">{m.label}</span>
									<span className="text-[11px] text-fg-mute leading-snug">
										{m.desc}
									</span>
								</div>
							</Label>
						))}
					</RadioGroup>
				</div>
				<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						{t("changes.dialog.cancel")}
					</Button>
					<AlertDialogAction
						variant={isHard ? "destructive" : "default"}
						size="sm"
						className="h-7 px-3 text-xs"
						disabled={isPending}
						onClick={() => onConfirm(mode)}
					>
						{isHard
							? t("changes.reset.hardConfirm")
							: t("changes.reset.confirm")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</EnterEnabledAlertDialogContent>
		</AlertDialog>
	);
}
