import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { useTranslation } from "renderer/providers/I18nProvider";
import { MemberRow, type MemberRowData } from "./components/MemberRow";

interface MembersTableProps {
	members: MemberRowData[];
	isOwner: boolean;
	onSetRole: (member: MemberRowData, role: "owner" | "member") => void;
	onRemove: (member: MemberRowData) => void;
}

export function MembersTable({
	members,
	isOwner,
	onSetRole,
	onRemove,
}: MembersTableProps) {
	const { t } = useTranslation();
	return (
		<div className="rounded-md border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>{t("common.name")}</TableHead>
						<TableHead>{t("common.email")}</TableHead>
						<TableHead className="w-32">{t("hosts.role")}</TableHead>
						{isOwner && <TableHead className="w-12" />}
					</TableRow>
				</TableHeader>
				<TableBody>
					{members.map((member) => (
						<MemberRow
							key={member.usersHostsId}
							member={member}
							isOwner={isOwner}
							onSetRole={onSetRole}
							onRemove={onRemove}
						/>
					))}
					{members.length === 0 && (
						<TableRow>
							<TableCell
								colSpan={isOwner ? 4 : 3}
								className="text-center text-sm text-muted-foreground py-6"
							>
								{t("hosts.noMembers")}
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</div>
	);
}
