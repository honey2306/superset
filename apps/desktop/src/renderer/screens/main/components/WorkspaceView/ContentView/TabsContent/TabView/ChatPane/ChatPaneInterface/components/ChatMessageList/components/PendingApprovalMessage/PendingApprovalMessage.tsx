import type { UseChatDisplayReturn } from "@superset/chat/client";
import { Message, MessageContent } from "@superset/ui/ai-elements/message";
import { Button } from "@superset/ui/button";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "renderer/providers/I18nProvider";

type ApprovalDecision = "approve" | "decline" | "always_allow_category";
type PendingApproval = UseChatDisplayReturn["pendingApproval"];

interface PendingApprovalMessageProps {
	approval: PendingApproval;
	isSubmitting: boolean;
	onRespond: (decision: ApprovalDecision) => Promise<void>;
}

function stringifyArgs(
	value: unknown,
	noArgsLabel: string,
	errorLabel: string,
): string {
	try {
		if (value === undefined) return noArgsLabel;
		if (typeof value === "string" && value.trim().length > 0) return value;
		if (typeof value === "string") return noArgsLabel;
		const serialized = JSON.stringify(value, null, 2);
		return serialized && serialized !== "{}" ? serialized : noArgsLabel;
	} catch {
		return errorLabel;
	}
}

export function PendingApprovalMessage({
	approval,
	isSubmitting,
	onRespond,
}: PendingApprovalMessageProps) {
	const { t } = useTranslation();
	const [selectedDecision, setSelectedDecision] =
		useState<ApprovalDecision | null>(null);
	const inFlightResponseRef = useRef(false);
	const previousToolCallIdRef = useRef<string | null>(null);

	useEffect(() => {
		const currentToolCallId = approval?.toolCallId ?? null;
		if (previousToolCallIdRef.current === currentToolCallId) return;
		previousToolCallIdRef.current = currentToolCallId;
		setSelectedDecision(null);
	}, [approval]);

	if (!approval) return null;

	const toolCallId = approval.toolCallId?.trim() ?? "";
	const toolName =
		approval.toolName?.trim().replaceAll("_", " ") ||
		t("chat.approval.toolExecution");
	const renderedArgs = stringifyArgs(
		approval.args,
		t("chat.approval.noArguments"),
		t("chat.approval.unableToRender"),
	);
	const canRespond = toolCallId.length > 0;

	const getDecisionClassName = (decision: ApprovalDecision): string => {
		if (selectedDecision !== decision) return "";
		if (decision === "decline") return "border-destructive text-destructive";
		return "border-primary bg-primary/10 text-primary";
	};

	const handleRespond = async (decision: ApprovalDecision): Promise<void> => {
		if (!canRespond || isSubmitting || inFlightResponseRef.current) return;
		inFlightResponseRef.current = true;
		setSelectedDecision(decision);
		try {
			await onRespond(decision);
		} catch (error) {
			console.error("Failed to submit approval response", error);
			setSelectedDecision(null);
		} finally {
			inFlightResponseRef.current = false;
		}
	};

	return (
		<Message from="assistant">
			<MessageContent>
				<div className="w-full max-w-none space-y-3 rounded-xl border bg-card/95 p-3">
					<div className="text-sm text-foreground">
						{t("chat.approval.permissionRequested", { toolName })}
					</div>
					<div className="rounded-md border bg-muted/20 p-3">
						<div className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
							{t("chat.approval.arguments")}
						</div>
						<pre className="max-h-64 overflow-auto text-xs whitespace-pre-wrap break-words">
							{renderedArgs}
						</pre>
					</div>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<Button
							type="button"
							variant="outline"
							className={getDecisionClassName("always_allow_category")}
							disabled={isSubmitting || !canRespond}
							onClick={() => {
								void handleRespond("always_allow_category");
							}}
						>
							{t("chat.approval.alwaysAllowCategory")}
						</Button>
						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="outline"
								className={getDecisionClassName("decline")}
								disabled={isSubmitting || !canRespond}
								onClick={() => {
									void handleRespond("decline");
								}}
							>
								{t("chat.approval.decline")}
							</Button>
							<Button
								type="button"
								className={getDecisionClassName("approve")}
								disabled={isSubmitting || !canRespond}
								onClick={() => {
									void handleRespond("approve");
								}}
							>
								{t("chat.approval.approve")}
							</Button>
						</div>
					</div>
				</div>
			</MessageContent>
		</Message>
	);
}
