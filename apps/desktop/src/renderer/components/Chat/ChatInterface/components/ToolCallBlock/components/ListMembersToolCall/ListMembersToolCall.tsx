import { UsersIcon } from "lucide-react";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { getResult } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface ListMembersToolCallProps {
	part: ToolPart;
}

export function ListMembersToolCall({ part }: ListMembersToolCallProps) {
	const { t } = useTranslation();
	const result = getResult(part);
	const resultData =
		typeof result.result === "object" && result.result !== null
			? (result.result as Record<string, unknown>)
			: result;
	const members = Array.isArray(resultData.members)
		? resultData.members.filter(
				(item): item is Record<string, unknown> =>
					typeof item === "object" && item !== null,
			)
		: [];

	return (
		<SupersetToolCall
			part={part}
			toolName={t("chat.tool.listMembers")}
			icon={UsersIcon}
			details={
				<div className="space-y-2">
					<div className="text-muted-foreground">
						{t("chat.tool.membersCount", { count: members.length })}
					</div>
					{members.length > 0 ? (
						<div className="space-y-1">
							{members.map((member, index) => {
								const memberId =
									typeof member.id === "string" ? member.id : null;
								const name =
									typeof member.name === "string"
										? member.name
										: typeof member.email === "string"
											? member.email
											: t("chat.tool.memberN", { index: index + 1 });
								const email =
									typeof member.email === "string" ? member.email : null;
								const role =
									typeof member.role === "string" ? member.role : null;
								return (
									<div
										key={memberId ?? `${name}-${email ?? "unknown"}`}
										className="rounded border bg-background/70 px-2 py-1"
									>
										<div className="font-medium text-foreground">{name}</div>
										<div className="text-muted-foreground">
											{email ?? t("chat.tool.noEmail")}
											{role ? ` • ${role}` : ""}
										</div>
									</div>
								);
							})}
						</div>
					) : (
						<div className="text-muted-foreground">
							{t("chat.tool.noMembersInResult")}
						</div>
					)}
				</div>
			}
		/>
	);
}
