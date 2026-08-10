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
import { toast } from "@superset/ui/sonner";
import { useEffect, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { useTranslation } from "renderer/providers/I18nProvider";

interface EditSecretDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectId: string;
	organizationId: string;
	secret: {
		id: string;
		key: string;
		value: string;
		sensitive: boolean;
	};
	onSaved: () => void;
}

export function EditSecretDialog({
	open,
	onOpenChange,
	projectId,
	organizationId,
	secret,
	onSaved,
}: EditSecretDialogProps) {
	const { t } = useTranslation();
	const [value, setValue] = useState("");
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		if (open) {
			// Sensitive secrets never have their value sent from the server
			setValue(secret.sensitive ? "" : secret.value);
		}
	}, [open, secret]);

	const handleSave = async () => {
		if (!value.trim()) return;

		setIsSaving(true);
		try {
			await apiTrpcClient.project.secrets.upsert.mutate({
				projectId,
				organizationId,
				key: secret.key,
				value: value.trim(),
				sensitive: secret.sensitive,
			});
			toast.success(t("secrets.updated", { key: secret.key }));
			onSaved();
			onOpenChange(false);
		} catch (err) {
			console.error("[secrets/edit] Failed to update:", err);
			toast.error(t("secrets.updateFailed"));
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange} modal>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("secrets.editTitle")}</DialogTitle>
					<DialogDescription>
						{t("secrets.updateValueFor")}{" "}
						<code className="font-mono font-semibold text-fg">
							{secret.key}
						</code>
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-2">
					<div className="space-y-2">
						<span className="text-sm font-medium">{t("secrets.key")}</span>
						<Input
							value={secret.key}
							disabled
							className="font-mono text-sm bg-hover"
						/>
					</div>

					<div className="space-y-2">
						<span className="text-sm font-medium">{t("secrets.value")}</span>
						<Input
							placeholder={
								secret.sensitive
									? t("secrets.enterNewValue")
									: t("secrets.value")
							}
							value={value}
							onChange={(e) => setValue(e.target.value)}
							className="font-mono text-sm"
							type={secret.sensitive ? "password" : "text"}
							autoFocus
						/>
					</div>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isSaving}
					>
						{t("common.cancel")}
					</Button>
					<Button onClick={handleSave} disabled={isSaving || !value.trim()}>
						{isSaving ? t("common.saving") : t("common.save")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
