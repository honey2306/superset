import { Button } from "@superset/ui/button";
import { useTranslation } from "renderer/providers/I18nProvider";
import { PLANS, type PlanTier } from "../../../../constants";

interface CurrentPlanCardProps {
	currentPlan: PlanTier;
	onCancel?: () => void;
	isCanceling?: boolean;
	onRestore?: () => void;
	isRestoring?: boolean;
	cancelAt?: Date | null;
	periodEnd?: Date | null;
}

export function CurrentPlanCard({
	currentPlan,
	onCancel,
	isCanceling,
	onRestore,
	isRestoring,
	cancelAt,
	periodEnd,
}: CurrentPlanCardProps) {
	const { locale, t } = useTranslation();
	const formatDate = (date: Date) =>
		new Intl.DateTimeFormat(locale, {
			year: "numeric",
			month: "long",
			day: "numeric",
		}).format(date);
	const plan = PLANS[currentPlan];
	const isPaidPlan = currentPlan !== "free";
	const isEnterprise = currentPlan === "enterprise";
	const isCancelingAtPeriodEnd = isPaidPlan && !isEnterprise && !!cancelAt;

	const hint =
		isCancelingAtPeriodEnd && cancelAt
			? t("billing.cancelsOn", { date: formatDate(new Date(cancelAt)) })
			: isEnterprise
				? t("billing.managedByAdmin")
				: isPaidPlan && periodEnd
					? t("billing.renewsOn", { date: formatDate(new Date(periodEnd)) })
					: currentPlan === "free"
						? t("billing.freePlanDescription")
						: plan.description;

	return (
		<div className="flex items-center justify-between gap-8 py-3">
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium">
						{t("billing.namedPlan", { name: plan.name })}
					</span>
					{isPaidPlan && (
						<span className="inline-flex items-center rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-background">
							{plan.name}
						</span>
					)}
				</div>
				<div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
			</div>
			{isPaidPlan && !isEnterprise && (
				<div className="shrink-0">
					{isCancelingAtPeriodEnd ? (
						<Button
							variant="ghost"
							size="sm"
							onClick={onRestore}
							disabled={isRestoring}
							className="text-primary"
						>
							{isRestoring ? t("billing.restoring") : t("billing.restorePlan")}
						</Button>
					) : (
						<Button
							variant="ghost"
							size="sm"
							onClick={onCancel}
							disabled={isCanceling}
							className="text-muted-foreground hover:text-destructive"
						>
							{isCanceling ? t("billing.canceling") : t("billing.cancelPlan")}
						</Button>
					)}
				</div>
			)}
		</div>
	);
}
