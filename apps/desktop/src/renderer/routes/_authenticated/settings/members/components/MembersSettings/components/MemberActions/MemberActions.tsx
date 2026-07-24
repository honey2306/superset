import {
	getAvailableRoleChanges,
	getRoleLevel,
	type OrganizationRole,
} from "@superset/shared/auth";
import { alert } from "@superset/ui/atoms/Alert";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { HiEllipsisVertical, HiOutlineTrash } from "react-icons/hi2";
import { useCurrentPlan } from "renderer/hooks/useCurrentPlan";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { TeamMember } from "../../../../types";

export function MemberActions({
	member,
	currentUserRole,
	ownerCount,
	isCurrentUser,
	canRemove,
}: {
	member: TeamMember;
	currentUserRole: OrganizationRole;
	ownerCount: number;
	isCurrentUser: boolean;
	canRemove: boolean;
}) {
	const { t } = useTranslation();
	const [isChangingRole, setIsChangingRole] = useState(false);
	const { refetch: refetchSession } = authClient.useSession();
	const { plan } = useCurrentPlan();
	const navigate = useNavigate();

	const availableRoles = getAvailableRoleChanges(
		currentUserRole,
		member.role,
		ownerCount,
	);

	async function leaveOrganization(): Promise<void> {
		const result = await apiTrpcClient.organization.leave.mutate({
			organizationId: member.organizationId,
		});

		// Update session with new active organization (or null if none left)
		await authClient.organization.setActive({
			organizationId: result.activeOrganizationId ?? null,
		});
		await refetchSession();
		navigate({ to: "/" });
	}

	async function removeMember(): Promise<void> {
		await apiTrpcClient.organization.removeMember.mutate({
			organizationId: member.organizationId,
			userId: member.userId,
		});
	}

	function handleRemove(): void {
		if (isCurrentUser) {
			toast.promise(leaveOrganization(), {
				loading: t("members.leaving"),
				success: t("members.left"),
				error: (err) => err.message || t("members.leaveFailed"),
			});
		} else {
			toast.promise(removeMember(), {
				loading: t("members.removing"),
				success: t("members.removed"),
				error: (err) => err.message || t("members.removeFailed"),
			});
		}
	}

	const handleRemoveClick = () => {
		const billingNote =
			plan === "pro" || plan === "enterprise" ? t("members.billingNote") : "";

		alert({
			title: isCurrentUser ? t("members.leaveTitle") : t("members.removeTitle"),
			description: isCurrentUser
				? t("members.leaveConfirm", { billingNote })
				: t("members.removeConfirm", {
						name: member.name,
						email: member.email,
						billingNote,
					}),
			actions: [
				{ label: t("common.cancel"), variant: "outline", onClick: () => {} },
				{
					label: isCurrentUser
						? t("members.leaveOrganization")
						: t("members.removeMember"),
					variant: "destructive",
					onClick: () => handleRemove(),
				},
			],
		});
	};

	const handleChangeRole = async (newRole: OrganizationRole) => {
		setIsChangingRole(true);
		try {
			await apiTrpcClient.organization.updateMemberRole.mutate({
				organizationId: member.organizationId,
				memberId: member.memberId,
				role: newRole,
			});
			toast.success(
				t("members.roleChanged", { role: t(`organization.role.${newRole}`) }),
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : t("members.roleChangeFailed"),
			);
		} finally {
			setIsChangingRole(false);
		}
	};

	const handleRoleSelection = (newRole: OrganizationRole) => {
		const isSelfDemotion =
			isCurrentUser && getRoleLevel(newRole) < getRoleLevel(member.role);

		if (isSelfDemotion) {
			alert({
				title: t("members.demoteTitle"),
				description: t("members.demoteDescription", {
					from: t(`organization.role.${member.role}`),
					to: t(`organization.role.${newRole}`),
				}),
				actions: [
					{ label: t("common.cancel"), variant: "outline", onClick: () => {} },
					{
						label: t("members.confirmDemote"),
						variant: "destructive",
						onClick: () => handleChangeRole(newRole),
					},
				],
			});
		} else {
			handleChangeRole(newRole);
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
				{availableRoles.length > 0 && (
					<DropdownMenuSub>
						<DropdownMenuSubTrigger disabled={isChangingRole}>
							{t("members.changeRole")}
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							{availableRoles.map((role) => (
								<DropdownMenuItem
									key={role}
									onSelect={() => handleRoleSelection(role)}
									disabled={isChangingRole}
								>
									{t("members.changeToRole", {
										role: t(`organization.role.${role}`),
									})}
								</DropdownMenuItem>
							))}
						</DropdownMenuSubContent>
					</DropdownMenuSub>
				)}

				{isCurrentUser ? (
					<DropdownMenuItem
						className="text-destructive gap-2"
						onSelect={handleRemoveClick}
					>
						<HiOutlineTrash className="h-4 w-4 text-destructive" />
						<span>{t("members.leaveOrganizationMenu")}</span>
					</DropdownMenuItem>
				) : canRemove ? (
					<DropdownMenuItem
						className="text-destructive gap-2"
						onSelect={handleRemoveClick}
					>
						<HiOutlineTrash className="h-4 w-4 text-destructive" />
						<span>{t("members.removeMember")}</span>
					</DropdownMenuItem>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
