import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { XIcon } from "lucide-react";
import { LinearIcon } from "renderer/components/icons/LinearIcon";
import { useTranslation } from "renderer/providers/I18nProvider";

interface LinkedIssuePillProps {
	slug: string;
	title: string;
	url?: string;
	taskId?: string;
	onRemove: () => void;
}

export function LinkedIssuePill({
	slug,
	title,
	url,
	taskId,
	onRemove,
}: LinkedIssuePillProps) {
	const navigate = useNavigate();
	const { t } = useTranslation();

	const handleClick = () => {
		// Prefer internal navigation over external URL for better UX
		if (taskId?.trim()) {
			navigate({ to: "/tasks/$taskId", params: { taskId } }).catch((error) => {
				console.error("Failed to navigate to task:", error);
				toast.error(t("linkedIssue.openFailed"));
				// Fallback to external URL if available
				if (url) {
					window.open(url, "_blank");
				}
			});
		} else if (url) {
			window.open(url, "_blank");
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		// Only handle keyboard events that originate from this element,
		// not from nested buttons (e.g., the remove button)
		if (e.currentTarget !== e.target) return;

		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			handleClick();
		}
	};

	return (
		<div
			title={title}
			{...((taskId || url) && {
				onClick: handleClick,
				onKeyDown: handleKeyDown,
				role: "button",
				tabIndex: 0,
				"aria-label": t("linkedIssue.openTask", { title }),
			})}
			className="group flex items-center gap-2.5 rounded-ds-3 border border-line/50 bg-hover/60 px-3 py-2 text-sm transition-all select-none hover:bg-accent-tint hover:ring-1 hover:ring-border dark:hover:bg-hover"
			style={{ cursor: taskId || url ? "pointer" : "default" }}
		>
			<div className="relative flex size-7 shrink-0 items-center justify-center rounded-ds-3 bg-foreground/10 p-0.5">
				<LinearIcon className="size-5 rounded-sm transition-opacity group-hover:opacity-0" />
				<Button
					aria-label={t("linkedIssue.remove")}
					className="pointer-events-none absolute inset-0 size-7 cursor-pointer rounded-ds-3 p-0 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 [&>svg]:size-3"
					onClick={(e) => {
						e.stopPropagation();
						onRemove();
					}}
					type="button"
					variant="ghost"
				>
					<XIcon />
					<span className="sr-only">{t("linkedIssue.removeShort")}</span>
				</Button>
			</div>
			<div className="flex flex-col items-start leading-tight">
				<span className="max-w-[180px] truncate font-medium">
					{title || slug}
				</span>
				<div className="flex items-center gap-1.5 text-fg-mute text-[10px] uppercase tracking-widest">
					<span className="max-w-[80px] truncate">{slug}</span>
					<span>·</span>
					<span>Linear</span>
				</div>
			</div>
		</div>
	);
}
