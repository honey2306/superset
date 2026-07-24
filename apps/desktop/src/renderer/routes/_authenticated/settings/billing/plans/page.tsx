import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { cn } from "@superset/ui/utils";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute, Link } from "@tanstack/react-router";
import { differenceInDays } from "date-fns";
import { Fragment, useState } from "react";
import { HiArrowLeft, HiArrowUpRight, HiCheck } from "react-icons/hi2";
import { env } from "renderer/env.renderer";
import { track } from "renderer/lib/analytics";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { MessageKey } from "renderer/providers/I18nProvider/messages";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { PlanTier } from "../constants";

export const Route = createFileRoute("/_authenticated/settings/billing/plans/")(
	{
		component: PlansPage,
	},
);

type PlanCardAction =
	| "current"
	| "upgrade"
	| "downgrade"
	| "restore"
	| "contact";

type PlanCardData = {
	id: "free" | "pro" | "enterprise";
	nameKey: MessageKey;
	price: { monthly: string; yearly: string } | string;
	priceNoteKey?: MessageKey;
	billingTextKey: { monthly: MessageKey; yearly: MessageKey } | MessageKey;
	showBillingToggle?: boolean;
	actions: Array<{
		labelKey: MessageKey;
		action: PlanCardAction;
		variant: "default" | "secondary" | "outline";
		size?: "default" | "sm";
		fullWidth?: boolean;
		align?: "center" | "start";
	}>;
};

type ComparisonValue = string | boolean | null;

type ComparisonRow = {
	labelKey: MessageKey;
	values: ComparisonValue[];
	badge?: { labelKey: MessageKey; variant: "default" | "secondary" };
};

type ComparisonSection = {
	titleKey: MessageKey;
	rows: ComparisonRow[];
};

const createPlanCards = (t: ReturnType<typeof useTranslation>["t"]): PlanCardData[] => [
	{
		id: "free",
		nameKey: "billing.free",
		price: "$0",
		priceNoteKey: "billing.perUserMonth",
		billingTextKey: "billing.freeForEveryone",
		actions: [
			{
				labelKey: "billing.currentPlan",
				action: "current",
				variant: "secondary",
			},
		],
	},
	{
		id: "pro",
		nameKey: "billing.pro",
		price: { monthly: "$20", yearly: "$15" },
		priceNoteKey: "billing.perUserMonth",
		billingTextKey: { monthly: "billing.billedMonthly", yearly: "billing.billedYearly" },
		showBillingToggle: true,
		actions: [
			{
				labelKey: "billing.upgrade",
				action: "upgrade",
				variant: "default",
			},
		],
	},
	{
		id: "enterprise",
		nameKey: "billing.enterprise",
		price: t("billing.customPricing"),
		billingTextKey: "billing.billedYearly",
		actions: [
			{
				labelKey: "billing.requestTrial",
				action: "contact",
				variant: "outline",
			},
		],
	},
];

const COMPARISON_SECTIONS: ComparisonSection[] = [
	{
		titleKey: "billing.usage",
		rows: [
			{
				labelKey: "billing.teamMembers",
				values: ["1", "billing.unlimited", "billing.unlimited"],
			},
			{
				labelKey: "billing.workspaces",
				values: ["billing.unlimited", "billing.unlimited", "billing.unlimited"],
			},
			{
				labelKey: "billing.projects",
				values: ["billing.unlimited", "billing.unlimited", "billing.unlimited"],
			},
		],
	},
	{
		titleKey: "billing.features",
		rows: [
			{
				labelKey: "billing.desktopApp",
				values: [true, true, true],
			},
			{
				labelKey: "billing.localWorkspaces",
				values: [true, true, true],
			},
			{
				labelKey: "billing.remoteWorkspaces",
				values: [null, true, true],
				badge: { labelKey: "billing.beta", variant: "default" },
			},
			{
				labelKey: "billing.automations",
				values: [true, true, true],
			},
			{
				labelKey: "billing.mobileApp",
				values: [null, true, true],
				badge: { labelKey: "billing.comingSoon", variant: "secondary" },
			},
			{
				labelKey: "billing.githubIntegration",
				values: [true, true, true],
			},
			{
				labelKey: "billing.linearIntegration",
				values: [null, true, true],
			},
			{
				labelKey: "billing.slackIntegration",
				values: [null, true, true],
			},
			{
				labelKey: "billing.teamCollaboration",
				values: [null, true, true],
			},
		],
	},
	{
		titleKey: "billing.support",
		rows: [
			{
				labelKey: "billing.prioritySupport",
				values: [null, true, true],
			},
			{
				labelKey: "billing.uptimeSla",
				values: [null, null, true],
			},
			{
				labelKey: "billing.customContracts",
				values: [null, null, true],
			},
		],
	},
	{
		titleKey: "billing.security",
		rows: [
			{
				labelKey: "billing.ssoSaml",
				values: [null, null, true],
			},
			{
				labelKey: "billing.ipRestrictions",
				values: [null, null, true],
			},
			{
				labelKey: "billing.scimProvisioning",
				values: [null, null, true],
			},
			{
				labelKey: "billing.auditLog",
				values: [null, null, true],
			},
		],
	},
];

function PlansPage() {
	const { locale, t } = useTranslation();
	const formatDate = (date: Date) =>
		new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(date);
	const [isYearly, setIsYearly] = useState(true);
	const [isUpgrading, setIsUpgrading] = useState(false);
	const [isCanceling, setIsCanceling] = useState(false);
	const [isRestoring, setIsRestoring] = useState(false);
	const { data: session } = authClient.useSession();
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const collections = useCollections();

	const activeOrgId = session?.session?.activeOrganizationId;

	// Get subscription from Electric (preloaded, instant)
	const { data: subscriptionsData } = useLiveQuery(
		(q) => q.from({ subscriptions: collections.subscriptions }),
		[collections],
	);
	const subscriptionData = subscriptionsData?.find(
		(s) => s.status === "active",
	);

	const currentPlan: PlanTier = (subscriptionData?.plan as PlanTier) ?? "free";
	const cancelAt = subscriptionData?.cancelAt;

	const isCurrentlyYearly =
		subscriptionData?.periodStart &&
		subscriptionData?.periodEnd &&
		differenceInDays(
			new Date(subscriptionData.periodEnd),
			new Date(subscriptionData.periodStart),
		) > 60;

	const { data: membersData } = useLiveQuery(
		(q) =>
			q
				.from({ members: collections.members })
				.select(({ members }) => ({ id: members.id })),
		[collections],
	);
	const memberCount = membersData?.length ?? 1;

	const currentPlanLabelByTier: Record<PlanTier, string> = {
		free: t("billing.free"),
		pro: t("billing.pro"),
		enterprise: t("billing.enterprise"),
	};
	const planCards = createPlanCards(t);
	const currentPlanLabel = currentPlanLabelByTier[currentPlan];

	const getValue = <T,>(value: T | { monthly: T; yearly: T }): T => {
		if (typeof value === "object" && value !== null && "monthly" in value) {
			return isYearly ? value.yearly : value.monthly;
		}
		return value as T;
	};

	const handlePlanAction = async (action: PlanCardAction) => {
		if (action === "current") {
			return;
		}

		if (action === "contact") {
			track("enterprise_trial_requested", { source: "billing_plans" });
			openUrl.mutate("mailto:support@superset.sh");
			return;
		}

		if (!activeOrgId) return;

		if (action === "downgrade") {
			setIsCanceling(true);
			try {
				await authClient.subscription.cancel(
					{
						referenceId: activeOrgId,
						returnUrl: env.NEXT_PUBLIC_WEB_URL,
					},
					{
						onSuccess: (ctx) => {
							if (ctx.data?.url) {
								window.open(ctx.data.url, "_blank");
							}
						},
					},
				);
			} finally {
				setIsCanceling(false);
			}
			return;
		}

		if (action === "restore") {
			setIsRestoring(true);
			try {
				await authClient.subscription.restore({
					referenceId: activeOrgId,
				});
				toast.success(t("billing.restored"));
			} finally {
				setIsRestoring(false);
			}
			return;
		}

		setIsUpgrading(true);
		try {
			await authClient.subscription.upgrade(
				{
					plan: "pro",
					referenceId: activeOrgId,
					annual: isYearly,
					seats: memberCount,
					successUrl: `${env.NEXT_PUBLIC_WEB_URL}/settings/billing?success=true`,
					cancelUrl: env.NEXT_PUBLIC_WEB_URL,
					returnUrl: env.NEXT_PUBLIC_WEB_URL,
					disableRedirect: true,
				},
				{
					onSuccess: (ctx) => {
						if (ctx.data?.url) {
							window.open(ctx.data.url, "_blank");
						}
					},
				},
			);
		} finally {
			setIsUpgrading(false);
		}
	};

	const renderComparisonValue = (value: ComparisonValue) => {
		if (value === null || value === false) {
			return <span className="sr-only">{t("billing.notIncluded")}</span>;
		}

		if (value === true) {
			return <HiCheck className="h-3.5 w-3.5 text-muted-foreground" />;
		}

		return (
			<>
				<HiCheck className="h-3.5 w-3.5 text-muted-foreground" />
				<span className="text-sm">{value}</span>
			</>
		);
	};

	const highlightColumnIndex = 1;
	const highlightColumnStart = highlightColumnIndex + 2;
	const gridColumnsClass = "grid grid-cols-[240px_repeat(3,_1fr)]";

	return (
		<div className="p-6 max-w-7xl w-full">
			<div className="mb-6 space-y-4">
				<Button variant="ghost" size="sm" asChild>
					<Link to="/settings/billing">
						<HiArrowLeft className="h-4 w-4" />
						{t("settings.billing")}
					</Link>
				</Button>
				<div>
					<h2 className="text-xl font-semibold">{t("billing.plans")}</h2>
					<p className="text-sm text-muted-foreground mt-1">
						<span className="text-foreground font-medium">{t("billing.currentPlanSummary", { plan: currentPlanLabel })}</span>{" "}
						{t("billing.supportPrompt")}{" "}
						<button
							type="button"
							onClick={() => {
								track("billing_support_contacted", {
									source: "billing_plans_inline",
								});
								openUrl.mutate("mailto:support@superset.sh");
							}}
							className="inline-flex items-center gap-1 text-primary hover:underline"
						>
							{t("billing.contactUs")}
							<HiArrowUpRight className="h-3 w-3" />
						</button>
						.
					</p>
				</div>
			</div>

			<div className="overflow-x-auto">
				<div className="relative min-w-[720px]">
					<div
						className={cn(
							gridColumnsClass,
							"pointer-events-none absolute inset-0",
						)}
					>
						<div
							className="bg-accent/30 border border-border/60 rounded-lg"
							style={{
								gridColumn: `${highlightColumnStart} / ${highlightColumnStart + 1}`,
								gridRow: "span 3",
							}}
						/>
					</div>
					<div className={cn(gridColumnsClass, "relative z-10 items-start")}>
						{(["plan", "billing", "cta"] as const).map((rowKey, rowIndex) => (
							<Fragment key={rowKey}>
								<div
									className={cn("px-2", rowKey === "cta" ? "py-3" : "py-2.5")}
								/>
								{planCards.map((plan) => {
									const isCurrent = currentPlan === plan.id;
									const isDowngrade =
										plan.id === "free" && currentPlan !== "free";
									const isOnEnterprise = currentPlan === "enterprise";

									let planActions: typeof plan.actions;
									if (isOnEnterprise) {
										planActions = [
											{
												labelKey: isCurrent ? "billing.currentPlan" : "billing.includedInEnterprise",
												action: "current" as const,
												variant: "secondary" as const,
											},
										];
									} else if (isCurrent && cancelAt) {
										planActions = [
											{
												labelKey: isRestoring ? "billing.restoring" : "billing.restorePlan",
												action: "restore" as const,
												variant: "default" as const,
											},
										];
									} else if (isCurrent && plan.id === "pro") {
										const intervalMatches = isYearly === !!isCurrentlyYearly;
										if (intervalMatches) {
											planActions = [
												{
													labelKey: "billing.currentPlan",
													action: "current" as const,
													variant: "secondary" as const,
												},
											];
										} else {
											planActions = [
												{
													labelKey: isUpgrading
														? "billing.changing"
														: isYearly
															? "billing.changeAnnual"
															: "billing.changeMonthly",
													action: "upgrade" as const,
													variant: "default" as const,
												},
											];
										}
									} else if (isCurrent) {
										planActions = [
											{
												labelKey: "billing.currentPlan",
												action: "current" as const,
												variant: "secondary" as const,
											},
										];
									} else if (isDowngrade && cancelAt) {
										planActions = [
											{
												labelKey: "billing.startsOn",
												action: "current" as const,
												variant: "outline" as const,
											},
										];
									} else if (isDowngrade) {
										planActions = [
											{
												labelKey: isCanceling
													? "billing.downgrading"
													: "billing.downgradeFree",
												action: "downgrade" as const,
												variant: "outline" as const,
											},
										];
									} else {
										planActions = plan.actions;
									}

									if (rowKey === "plan") {
										return (
											<div key={plan.id} className="px-4 py-2.5">
												<div className="space-y-0.5">
													<div className="text-base font-medium">
														{t(plan.nameKey)}
													</div>
													<div
														className={cn(
															plan.priceNoteKey
																? "text-xl font-semibold leading-tight"
																: "text-base font-medium text-muted-foreground",
														)}
													>
														{getValue(plan.price)}
													</div>
													{plan.priceNoteKey && (
														<div className="text-xs text-muted-foreground">
															{t(plan.priceNoteKey)}
														</div>
													)}
												</div>
											</div>
										);
									}

									if (rowKey === "billing") {
										return (
											<div
												key={plan.id}
												className="flex items-center gap-2 px-4 py-2.5 text-xs text-muted-foreground"
											>
												{plan.showBillingToggle && (
													<Switch
														checked={isYearly}
														onCheckedChange={setIsYearly}
														aria-label={t("billing.billedYearly")}
													/>
												)}
												<span>{t(getValue(plan.billingTextKey))}</span>
											</div>
										);
									}

									return (
										<div key={plan.id} className="px-4 py-3">
											<div className="flex flex-col gap-2">
												{planActions.map((action) => (
													<Button
														key={action.labelKey}
														variant={action.variant}
														size={action.size ?? "sm"}
														className={cn(
															action.fullWidth === false ? "w-fit" : "w-full",
															action.align === "center" && "self-center",
															action.align === "start" && "self-start",
														)}
														disabled={
															action.action === "current" ||
															(action.action === "upgrade" && isUpgrading)
														}
														onClick={() => handlePlanAction(action.action)}
													>
														{action.labelKey === "billing.startsOn" ? t(action.labelKey, { date: cancelAt ? formatDate(new Date(cancelAt)) : "" }) : t(action.labelKey)}
													</Button>
												))}
											</div>
										</div>
									);
								})}

								{rowIndex < 2 && (
									<>
										<div />
										<div className="col-span-3 h-px bg-border/60" />
									</>
								)}
							</Fragment>
						))}

						{COMPARISON_SECTIONS.map((section, sectionIndex) => (
							<Fragment key={section.titleKey}>
								<div className="col-span-4 pt-6 pb-3 px-2">
									<span className="text-sm font-semibold">{t(section.titleKey)}</span>
								</div>
								<div className="col-span-4 h-px bg-border/60" />

								{section.rows.map((row, rowIndex) => {
									const isLastRow =
										sectionIndex === COMPARISON_SECTIONS.length - 1 &&
										rowIndex === section.rows.length - 1;

									return (
										<Fragment key={row.labelKey}>
											<div className="flex items-center gap-1.5 px-2 py-2.5 text-xs text-muted-foreground">
												{t(row.labelKey)}
												{row.badge && (
													<Badge
														variant={row.badge.variant}
														className="px-1.5 py-0 text-[10px] font-medium"
													>
														{t(row.badge.labelKey)}
													</Badge>
												)}
											</div>
											{row.values.map((value, valueIndex) => (
												<div
													key={`${t(row.labelKey)}-${valueIndex}`}
													className="flex items-center justify-start gap-2 px-4 py-2.5"
												>
													{renderComparisonValue(value)}
												</div>
											))}
											{!isLastRow && (
												<div className="col-span-4 h-px bg-border/60" />
											)}
										</Fragment>
									);
								})}
							</Fragment>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
