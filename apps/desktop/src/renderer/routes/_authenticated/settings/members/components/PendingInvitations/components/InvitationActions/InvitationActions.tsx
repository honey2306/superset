import type { SelectInvitation } from "@superset/db/schema";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { HiEllipsisVertical, HiOutlineXMark } from "react-icons/hi2";
import { authClient } from "renderer/lib/auth-client";
import { useTranslation } from "renderer/providers/I18nProvider";

interface InvitationActionsProps {
	invitation: SelectInvitation;
}

export function InvitationActions({ invitation }: InvitationActionsProps) {
	const { t } = useTranslation();
	const [isCanceling, setIsCanceling] = useState(false);

	const handleCancel = async () => {
		setIsCanceling(true);
		try {
			await authClient.organization.cancelInvitation({
				invitationId: invitation.id,
			});
			toast.success(t("members.invitationCanceled"));
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: t("members.cancelInvitationFailed"),
			);
		} finally {
			setIsCanceling(false);
		}
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" className="h-8 w-8">
					<HiEllipsisVertical className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem
					onSelect={handleCancel}
					disabled={isCanceling}
					className="text-destructive gap-2"
				>
					<HiOutlineXMark className="h-4 w-4" />
					{t("common.cancel")}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
