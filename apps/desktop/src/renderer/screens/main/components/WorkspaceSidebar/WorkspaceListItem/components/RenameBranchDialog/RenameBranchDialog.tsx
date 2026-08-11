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
import { useEffect, useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { showHostServiceUnavailableToast } from "renderer/lib/host-service-unavailable";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

interface RenameBranchDialogProps {
	workspaceId: string;
	currentBranchName: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onAfterRename?: (newName: string) => void;
	hostUrl?: string | null;
	hostWorkspaceId?: string | null;
}

export function RenameBranchDialog({
	workspaceId,
	currentBranchName,
	open,
	onOpenChange,
	onAfterRename,
	hostUrl,
	hostWorkspaceId,
}: RenameBranchDialogProps) {
	const { t } = useTranslation();
	const [value, setValue] = useState(currentBranchName);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const hostService = useLocalHostService();
	const hostTarget =
		hostUrl && hostWorkspaceId
			? { url: hostUrl, workspaceId: hostWorkspaceId }
			: { url: hostService.activeHostUrl, workspaceId };

	useEffect(() => {
		if (open) setValue(currentBranchName);
	}, [open, currentBranchName]);

	const trimmed = value.trim();
	const isUnchanged = trimmed === currentBranchName;
	const isInvalid = trimmed.length === 0 || isUnchanged;

	const handleSubmit = async () => {
		if (isInvalid || isSubmitting) return;
		if (!hostTarget.url) {
			showHostServiceUnavailableToast(hostService, t, {
				action: t("workspace.renameBranchAction"),
			});
			return;
		}

		const client = getHostServiceClientByUrl(hostTarget.url);
		const renamePromise = client.git.renameBranch.mutate({
			workspaceId: hostTarget.workspaceId,
			oldName: currentBranchName,
			newName: trimmed,
		});

		toast.promise(renamePromise, {
			loading: t("workspace.renamingBranch", { name: trimmed }),
			success: t("workspace.branchRenamed", { name: trimmed }),
			error: (err) =>
				err instanceof Error ? err.message : t("workspace.renameBranchFailed"),
		});

		setIsSubmitting(true);
		try {
			await renamePromise;
			onAfterRename?.(trimmed);
			onOpenChange(false);
		} catch {
			// toast.promise surfaced the error to the user
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange} modal>
			<DialogContent className="max-w-[420px]">
				<DialogHeader>
					<DialogTitle>{t("workspace.renameBranch")}</DialogTitle>
					<DialogDescription>
						{t("workspace.renameBranchDescription")}
					</DialogDescription>
				</DialogHeader>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						void handleSubmit();
					}}
					className="space-y-4"
				>
					<div className="space-y-1.5">
						<Label htmlFor="rename-branch-input" className="text-xs">
							{t("workspace.branchName")}
						</Label>
						<Input
							id="rename-branch-input"
							value={value}
							onChange={(e) => setValue(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									e.stopPropagation();
									void handleSubmit();
								}
							}}
							autoFocus
							disabled={isSubmitting}
							spellCheck={false}
							autoComplete="off"
							className="font-mono"
						/>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => onOpenChange(false)}
							disabled={isSubmitting}
						>
							{t("common.cancel")}
						</Button>
						<Button type="submit" disabled={isInvalid || isSubmitting}>
							{t("workspace.rename")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
