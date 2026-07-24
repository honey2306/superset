import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { useTranslation } from "renderer/providers/I18nProvider";
import { GhAuthTerminal } from "./GhAuthTerminal";

interface GhAuthDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Fired when the gh process exits so the caller can re-check auth status. */
	onExit: () => void;
}

export function GhAuthDialog({
	open,
	onOpenChange,
	onExit,
}: GhAuthDialogProps) {
	const { t } = useTranslation();
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-[752px] gap-4">
				<DialogHeader>
					<DialogTitle>{t("onboarding.githubSignInTitle")}</DialogTitle>
					<DialogDescription>
						{t("onboarding.githubSignInDescription")}
					</DialogDescription>
				</DialogHeader>
				<div className="h-[240px] w-full overflow-hidden rounded-md bg-[#151110] p-2">
					{open && <GhAuthTerminal onExit={onExit} />}
				</div>
			</DialogContent>
		</Dialog>
	);
}
