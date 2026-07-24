import { Button } from "@superset/ui/button";
import { useTranslation } from "renderer/providers/I18nProvider";
import { PLANS } from "../../../../constants";

interface UpgradeCardProps {
	onUpgrade: () => void;
	isUpgrading: boolean;
}

export function UpgradeCard({ onUpgrade, isUpgrading }: UpgradeCardProps) {
	const { locale, t } = useTranslation();
	const plan = PLANS.pro;
	const monthly = plan.price?.monthly ? plan.price.monthly / 100 : 0;

	return (
		<div className="flex items-center justify-between gap-8 py-3">
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium">
						{t("billing.upgradeTo", { name: plan.name })}
					</span>
					<span className="inline-flex items-center rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-background">
						{plan.name}
					</span>
				</div>
				<div className="text-xs text-muted-foreground mt-0.5">
					{t("billing.upgradeDescription", {
						price: new Intl.NumberFormat(locale, {
							style: "currency",
							currency: "USD",
							maximumFractionDigits: 0,
						}).format(monthly),
					})}
				</div>
			</div>
			<Button
				onClick={onUpgrade}
				size="sm"
				disabled={isUpgrading}
				className="shrink-0"
			>
				{isUpgrading ? t("billing.redirecting") : t("billing.upgrade")}
			</Button>
		</div>
	);
}
