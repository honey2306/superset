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
			label: t("v1Changes.reset.softLabel"),
			desc: t("v1Changes.reset.softDesc"),
		},
		{
			value: "mixed",
			label: t("v1Changes.reset.mixedLabel"),
			desc: t("v1Changes.reset.mixedDesc"),
		},
		{
			value: "hard",
			label: t("v1Changes.reset.hardLabel"),
			desc: t("v1Changes.reset.hardDesc"),
		},
	];

	const isHard = mode === "hard";

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<EnterEnabledAlertDialogContent className="max-w-[420px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						{t("v1Changes.reset.title", { commit: shortHash })}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{t("v1Changes.reset.modeLabel")}
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
								className="flex cursor-pointer items-start gap-2 rounded-md border border-transparent p-2 hover:bg-accent/50 has-[button[data-state=checked]]:border-border has-[button[data-state=checked]]:bg-accent/40"
							>
								<RadioGroupItem
									id={`reset-mode-${m.value}`}
									value={m.value}
									className="mt-0.5"
								/>
								<div className="flex flex-col gap-0.5">
									<span className="text-xs font-medium">{m.label}</span>
									<span className="text-[11px] text-muted-foreground leading-snug">
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
						{t("v1Changes.dialog.cancel")}
					</Button>
					<AlertDialogAction
						variant={isHard ? "destructive" : "default"}
						size="sm"
						className="h-7 px-3 text-xs"
						disabled={isPending}
						onClick={() => onConfirm(mode)}
					>
						{isHard
							? t("v1Changes.reset.hardConfirm")
							: t("v1Changes.reset.confirm")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</EnterEnabledAlertDialogContent>
		</AlertDialog>
	);
}
