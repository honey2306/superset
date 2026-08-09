import { ToolCallRow } from "@superset/ui/ai-elements/tool-call-row";
import {
	CheckIcon,
	CircleXIcon,
	ClockIcon,
	FolderLockIcon,
	XIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { ToolPart } from "../../../../utils/tool-helpers";
import type { ToolStatusBadgeVariant } from "../ToolStatusBadge";
import { ToolStatusBadge } from "../ToolStatusBadge";

interface RequestSandboxAccessToolCallProps {
	part: ToolPart;
	args: Record<string, unknown>;
	result: Record<string, unknown>;
	isInterrupted?: boolean;
}

type AccessStatus = "pending" | "granted" | "denied" | "cancelled" | "error";

const ACCESS_STATUS_CONFIG: Record<
	AccessStatus,
	{
		icon: ComponentType<{ className?: string }>;
		labelKey:
			| "chat.tool.awaitingResponse"
			| "chat.tool.accessGranted"
			| "chat.tool.accessDenied"
			| "chat.tool.cancelled"
			| "chat.tool.error";
		variant?: ToolStatusBadgeVariant;
	}
> = {
	pending: { icon: ClockIcon, labelKey: "chat.tool.awaitingResponse" },
	granted: { icon: CheckIcon, labelKey: "chat.tool.accessGranted" },
	denied: { icon: XIcon, labelKey: "chat.tool.accessDenied" },
	cancelled: { icon: XIcon, labelKey: "chat.tool.cancelled" },
	error: {
		icon: CircleXIcon,
		labelKey: "chat.tool.error",
		variant: "danger",
	},
};

function toAccessDecision(content: string): "granted" | "denied" | null {
	if (content.startsWith("Access already granted")) return "granted";
	if (content.startsWith("Access granted")) return "granted";
	if (content.startsWith("Access denied")) return "denied";
	return null;
}

function toAccessStatus(
	part: ToolPart,
	result: Record<string, unknown>,
	isInterrupted: boolean,
): AccessStatus {
	if (
		isInterrupted &&
		part.state !== "output-available" &&
		part.state !== "output-error"
	) {
		return "cancelled";
	}
	if (part.state !== "output-available" && part.state !== "output-error") {
		return "pending";
	}
	if (part.state === "output-error" || result.isError === true) {
		return "error";
	}
	const content =
		(typeof result.content === "string" && result.content.trim()) ||
		(typeof result.text === "string" && result.text.trim()) ||
		"";
	return toAccessDecision(content) ?? "error";
}

export function RequestSandboxAccessToolCall({
	part,
	args,
	result,
	isInterrupted = false,
}: RequestSandboxAccessToolCallProps) {
	const { t } = useTranslation();
	const requestedPath = typeof args.path === "string" ? args.path.trim() : null;
	const reason = typeof args.reason === "string" ? args.reason.trim() : null;

	const status = toAccessStatus(part, result, isInterrupted);
	const { icon, labelKey, variant } = ACCESS_STATUS_CONFIG[status];
	const statusBadge = (
		<ToolStatusBadge icon={icon} label={t(labelKey)} variant={variant} />
	);

	const isPending = status === "pending";
	const isCancelledOrError = status === "cancelled" || status === "error";
	const hasContext = Boolean(requestedPath || reason);

	return (
		<ToolCallRow
			icon={FolderLockIcon}
			isPending={false}
			isError={false}
			title={t("chat.tool.requestAccess")}
			description={statusBadge}
		>
			{!isPending && hasContext ? (
				<div className="space-y-1 px-3 py-2">
					{requestedPath ? (
						<div className="text-xs text-fg-mute">
							{t("chat.tool.path", { path: requestedPath })}
						</div>
					) : null}
					{reason ? (
						<div className="text-xs text-fg-mute">
							{t("chat.tool.reason", { reason })}
						</div>
					) : null}
					{!isCancelledOrError ? (
						<div className="text-sm text-fg">
							{status === "granted"
								? t("chat.tool.accessGrantedText")
								: t("chat.tool.accessDeniedText")}
						</div>
					) : (
						<div className="flex items-center gap-1 text-sm text-destructive">
							<CircleXIcon className="h-3 w-3 shrink-0" />
							{t("chat.tool.aborted")}
						</div>
					)}
				</div>
			) : undefined}
		</ToolCallRow>
	);
}
