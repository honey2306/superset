import { alert } from "@superset/ui/atoms/Alert";
import { DropdownMenuItem } from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { HiMiniTrash } from "react-icons/hi2";
import { useTranslation } from "renderer/providers/I18nProvider";

interface SessionSelectorItemProps {
	sessionId: string;
	title: string;
	isCurrent: boolean;
	onSelectSession: (sessionId: string) => void;
	onDeleteSession: (sessionId: string) => Promise<void>;
}

export function SessionSelectorItem({
	sessionId,
	title,
	isCurrent,
	onSelectSession,
	onDeleteSession,
}: SessionSelectorItemProps) {
	const { t } = useTranslation();
	return (
		<DropdownMenuItem
			className="group flex items-center gap-2"
			onSelect={() => {
				onSelectSession(sessionId);
			}}
		>
			<span
				className={`min-w-0 flex-1 truncate text-xs ${isCurrent ? "font-semibold" : ""}`}
			>
				{title || t("chat.pane.newChat")}
			</span>
			{!isCurrent && (
				<button
					type="button"
					className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
					onClick={(event) => {
						event.stopPropagation();
						alert({
							title: t("chat.session.deleteChatTitle"),
							description: t("chat.session.deleteChatDescription"),
							actions: [
								{
									label: t("chat.userMessage.cancel"),
									variant: "outline",
									onClick: () => {},
								},
								{
									label: t("common.delete"),
									variant: "destructive",
									onClick: () => {
										toast.promise(onDeleteSession(sessionId), {
											loading: t("chat.session.deletingSession"),
											success: t("chat.session.sessionDeleted"),
											error: t("chat.session.failedToDelete"),
										});
									},
								},
							],
						});
					}}
				>
					<HiMiniTrash className="size-3" />
				</button>
			)}
		</DropdownMenuItem>
	);
}
