import { Avatar } from "@superset/ui/atoms/Avatar";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { HiArrowLeft } from "react-icons/hi2";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { AddMemberButton } from "./components/AddMemberButton";

interface TeamDetailSettingsProps {
	teamId: string;
}

interface TeamMemberRow {
	teamMembershipId: string;
	userId: string;
	name: string | null;
	email: string;
	image: string | null;
	createdAt: Date;
}

type OpenDialog = "delete" | "leaveTeam" | null;

export function TeamDetailSettings({ teamId }: TeamDetailSettingsProps) {
	const { locale, t } = useTranslation();
	const { data: session } = authClient.useSession();
	const navigate = useNavigate();
	const collections = useCollections();
	const activeOrganizationId = session?.session?.activeOrganizationId;
	const currentUserId = session?.user?.id;

	const { data: teamsData, isReady: teamsReady } = useLiveQuery(
		(q) =>
			q
				.from({ teams: collections.teams })
				.select(({ teams }) => ({ ...teams })),
		[collections],
	);

	const { data: orgUsers } = useLiveQuery(
		(q) =>
			q
				.from({ members: collections.members })
				.innerJoin({ users: collections.users }, ({ members, users }) =>
					eq(members.userId, users.id),
				)
				.select(({ users }) => ({ ...users })),
		[collections],
	);

	const { data: membersRaw, isReady: membersReady } = useLiveQuery(
		(q) =>
			q
				.from({ tm: collections.teamMembers })
				.innerJoin({ users: collections.users }, ({ tm, users }) =>
					eq(tm.userId, users.id),
				)
				.select(({ tm, users }) => ({
					teamMembershipId: tm.id,
					teamId: tm.teamId,
					userId: tm.userId,
					name: users.name,
					email: users.email,
					image: users.image,
					createdAt: tm.createdAt,
				})),
		[collections],
	);

	const team = (teamsData ?? []).find((t) => t.id === teamId) ?? null;
	const members: TeamMemberRow[] = (membersRaw ?? [])
		.filter((r) => r.teamId === teamId)
		.map((r) => ({
			teamMembershipId: r.teamMembershipId,
			userId: r.userId,
			name: r.name ?? null,
			email: r.email,
			image: r.image ?? null,
			createdAt: r.createdAt ? new Date(r.createdAt) : new Date(0),
		}))
		.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

	const currentMember = members.find((m) => m.userId === currentUserId);

	const [openDialog, setOpenDialog] = useState<OpenDialog>(null);
	const [nameValue, setNameValue] = useState("");
	const [slugValue, setSlugValue] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Populate form once the team row arrives from Electric (and re-populate
	// on navigation to a different team). Keyed off team?.id — which is
	// undefined until the collection hydrates, then becomes teamId — so we
	// don't seed empty strings before the row is loaded, and subsequent
	// Electric updates to the same row don't clobber in-progress edits.
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional — only resync when the loaded team's id changes
	useEffect(() => {
		if (!team) return;
		setNameValue(team.name);
		setSlugValue(team.slug);
	}, [team?.id]);

	const formatDate = (date: Date) =>
		date.toLocaleDateString(locale, { month: "short", day: "numeric" });

	const trimmedName = nameValue.trim();
	const trimmedSlug = slugValue.trim();
	const isDirty =
		!!team &&
		(trimmedName !== team.name || trimmedSlug !== team.slug) &&
		trimmedName.length > 0 &&
		trimmedSlug.length > 0;

	async function handleGeneralSave() {
		if (!team || !isDirty) return;
		setIsSubmitting(true);
		try {
			const result = await authClient.organization.updateTeam({
				teamId,
				data: { name: trimmedName, slug: trimmedSlug },
			});
			if (result.error) {
				toast.error(result.error.message ?? t("team.saveFailed"));
				return;
			}
			toast.success(t("team.saved"));
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : t("team.saveFailed"),
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	async function handleDelete() {
		if (!activeOrganizationId) return;
		setIsSubmitting(true);
		try {
			const result = await authClient.organization.removeTeam({
				teamId,
				organizationId: activeOrganizationId,
			});
			if (result.error) {
				toast.error(result.error.message ?? t("team.deleteFailed"));
				return;
			}
			toast.success(
				t("team.deleted", { name: team?.name ?? t("settings.teams") }),
			);
			navigate({ to: "/settings/teams" });
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : t("team.deleteFailed"),
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	async function handleLeaveTeam() {
		if (!currentUserId) return;
		setIsSubmitting(true);
		try {
			await apiTrpcClient.team.removeMember.mutate({
				teamId,
				userId: currentUserId,
			});
			toast.success(t("team.left"));
			setOpenDialog(null);
			navigate({ to: "/settings/teams" });
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : t("team.leaveFailed"),
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	if (!activeOrganizationId) return null;

	const isReady = teamsReady && membersReady;

	return (
		<div className="flex-1 flex flex-col min-h-0">
			<div className="px-8 pt-8 pb-4">
				<div className="max-w-5xl">
					<Link
						to="/settings/teams"
						className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
					>
						<HiArrowLeft className="h-4 w-4" />
						{t("team.all")}
					</Link>
					<h2 className="text-2xl font-semibold">{t("team.settings")}</h2>
				</div>
			</div>

			<div className="flex-1 overflow-auto">
				<div className="px-8 pb-16 space-y-12">
					{team && (
						<div className="max-w-5xl">
							<div className="space-y-4 max-w-md">
								<div className="space-y-1.5">
									<Label htmlFor="team-name-edit">{t("common.name")}</Label>
									<Input
										id="team-name-edit"
										value={nameValue}
										onChange={(event) => setNameValue(event.target.value)}
									/>
								</div>
								<div className="space-y-1.5">
									<Label htmlFor="team-slug-edit">
										{t("organization.slugLabel")}
									</Label>
									<Input
										id="team-slug-edit"
										value={slugValue}
										onChange={(event) => setSlugValue(event.target.value)}
									/>
									<p className="text-xs text-muted-foreground">
										{t("team.slugHint")}
									</p>
								</div>
								<div>
									<Button
										onClick={handleGeneralSave}
										disabled={!isDirty || isSubmitting}
									>
										{isSubmitting ? t("common.saving") : t("common.save")}
									</Button>
								</div>
							</div>
						</div>
					)}

					<div className="max-w-5xl space-y-4">
						<div className="flex items-center justify-between gap-4">
							<h3 className="text-lg font-semibold">{t("team.members")}</h3>
							{team && (
								<AddMemberButton
									teamId={teamId}
									currentUserId={currentUserId}
									currentMemberUserIds={new Set(members.map((m) => m.userId))}
									orgUsers={orgUsers ?? []}
								/>
							)}
						</div>

						{!isReady && members.length === 0 ? (
							<div className="space-y-2 border rounded-lg">
								{[1, 2, 3].map((i) => (
									<div key={i} className="flex items-center gap-4 p-4">
										<Skeleton className="h-8 w-8 rounded-full" />
										<div className="flex-1 space-y-2">
											<Skeleton className="h-4 w-48" />
											<Skeleton className="h-3 w-32" />
										</div>
										<Skeleton className="h-4 w-16" />
									</div>
								))}
							</div>
						) : members.length === 0 ? (
							<div className="text-center py-12 text-muted-foreground border rounded-lg">
								{t("team.noMembers")}
							</div>
						) : (
							<div className="border rounded-lg">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>{t("common.name")}</TableHead>
											<TableHead>{t("common.email")}</TableHead>
											<TableHead>{t("common.joined")}</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{members.map((member) => {
											const isCurrentUser = member.userId === currentUserId;
											return (
												<TableRow key={member.teamMembershipId}>
													<TableCell>
														<div className="flex items-center gap-3">
															<Avatar
																size="md"
																fullName={member.name ?? ""}
																image={member.image}
															/>
															<div className="flex items-center gap-2">
																<span className="font-medium">
																	{member.name || t("common.unknown")}
																</span>
																{isCurrentUser && (
																	<Badge
																		variant="secondary"
																		className="text-xs"
																	>
																		{t("common.you")}
																	</Badge>
																)}
															</div>
														</div>
													</TableCell>
													<TableCell className="text-muted-foreground">
														{member.email}
													</TableCell>
													<TableCell className="text-muted-foreground">
														{formatDate(member.createdAt)}
													</TableCell>
												</TableRow>
											);
										})}
									</TableBody>
								</Table>
							</div>
						)}
					</div>

					{team && (
						<div className="max-w-5xl space-y-4">
							<h3 className="text-lg font-semibold">{t("team.dangerZone")}</h3>
							<div className="border rounded-lg divide-y">
								{currentMember && (
									<div className="flex items-center justify-between gap-4 p-4">
										<div className="min-w-0">
											<p className="text-sm font-medium">{t("team.leave")}</p>
											<p className="text-xs text-muted-foreground mt-0.5">
												{t("team.leaveDescription")}
											</p>
										</div>
										<Button
											variant="outline"
											onClick={() => setOpenDialog("leaveTeam")}
										>
											{t("team.leave")}
										</Button>
									</div>
								)}
								<div className="flex items-center justify-between gap-4 p-4">
									<div className="min-w-0">
										<p className="text-sm font-medium">{t("team.delete")}</p>
										<p className="text-xs text-muted-foreground mt-0.5">
											{t("team.deleteDescription", { name: team.name })}
										</p>
									</div>
									<Button
										variant="destructive"
										onClick={() => setOpenDialog("delete")}
									>
										{t("team.delete")}
									</Button>
								</div>
							</div>
						</div>
					)}
				</div>
			</div>

			<Dialog
				open={openDialog === "delete"}
				onOpenChange={(open) => !open && setOpenDialog(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("team.delete")}</DialogTitle>
						<DialogDescription>
							{t("team.deleteDialogDescription", {
								name: team?.name ?? t("settings.teams"),
							})}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="mt-4">
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpenDialog(null)}
							disabled={isSubmitting}
						>
							{t("common.cancel")}
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={handleDelete}
							disabled={isSubmitting}
						>
							{isSubmitting ? t("common.deleting") : t("team.delete")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={openDialog === "leaveTeam"}
				onOpenChange={(open) => !open && setOpenDialog(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("team.leave")}</DialogTitle>
						<DialogDescription>{t("team.leaveDescription")}</DialogDescription>
					</DialogHeader>
					<DialogFooter className="mt-4">
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpenDialog(null)}
							disabled={isSubmitting}
						>
							{t("common.cancel")}
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={handleLeaveTeam}
							disabled={isSubmitting}
						>
							{isSubmitting ? t("team.leaving") : t("team.leave")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
