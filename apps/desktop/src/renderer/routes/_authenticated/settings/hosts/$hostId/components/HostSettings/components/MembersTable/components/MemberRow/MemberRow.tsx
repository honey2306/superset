import { Button } from "@superset/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { TableCell, TableRow } from "@superset/ui/table";
import { HiOutlineTrash } from "react-icons/hi2";
import { useTranslation } from "renderer/providers/I18nProvider";

export interface MemberRowData {
	usersHostsId: string;
	userId: string;
	role: "owner" | "member";
	name: string;
	email: string;
}

interface MemberRowProps {
	member: MemberRowData;
	isOwner: boolean;
	onSetRole: (member: MemberRowData, role: "owner" | "member") => void;
	onRemove: (member: MemberRowData) => void;
}

export function MemberRow({
	member,
	isOwner,
	onSetRole,
	onRemove,
}: MemberRowProps) {
	const { t } = useTranslation();
	return (
		<TableRow>
			<TableCell className="font-medium">{member.name}</TableCell>
			<TableCell className="text-muted-foreground">{member.email}</TableCell>
			<TableCell>
				{isOwner ? (
					<Select
						value={member.role}
						onValueChange={(value) =>
							onSetRole(member, value as "owner" | "member")
						}
					>
						<SelectTrigger className="h-8">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="owner">{t("hosts.owner")}</SelectItem>
							<SelectItem value="member">{t("hosts.member")}</SelectItem>
						</SelectContent>
					</Select>
				) : (
					<span className="text-sm">
						{member.role === "owner" ? t("hosts.owner") : t("hosts.member")}
					</span>
				)}
			</TableCell>
			{isOwner && (
				<TableCell>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => onRemove(member)}
						aria-label={t("hosts.removeMember", { name: member.name })}
					>
						<HiOutlineTrash className="h-4 w-4" />
					</Button>
				</TableCell>
			)}
		</TableRow>
	);
}
