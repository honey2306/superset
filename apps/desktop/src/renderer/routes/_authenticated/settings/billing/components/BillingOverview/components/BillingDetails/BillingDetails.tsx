import { Button } from "@superset/ui/button";
import { useEffect, useState } from "react";
import stripeLinkIcon from "renderer/assets/stripe-link.png";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";

type BillingDetailsData = NonNullable<
	Awaited<ReturnType<typeof apiTrpcClient.billing.details.query>>
>;

function formatAddress(address: BillingDetailsData["address"]) {
	if (!address) return null;
	const parts = [
		address.line1,
		address.line2,
		[address.city, address.state].filter(Boolean).join(", "),
		address.postalCode,
		address.country,
	].filter(Boolean);
	return parts.join(", ");
}

function capitalizeFirst(str: string) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

function PaymentMethodLabel({
	paymentMethod,
	endingIn,
}: {
	paymentMethod: NonNullable<BillingDetailsData["paymentMethod"]>;
	endingIn: string;
}) {
	if (paymentMethod.type === "link") {
		return (
			<span className="inline-flex items-center gap-1.5">
				<img src={stripeLinkIcon} alt="Link" className="h-4 w-4 rounded-sm" />
				<span>Link by Stripe</span>
			</span>
		);
	}

	if (paymentMethod.last4) {
		return (
			<span>
				{capitalizeFirst(paymentMethod.brand)} {endingIn} {paymentMethod.last4}
			</span>
		);
	}

	return <span>{capitalizeFirst(paymentMethod.brand)}</span>;
}

export function BillingDetails() {
	const { t } = useTranslation();
	const [details, setDetails] = useState<BillingDetailsData | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [openingPortal, setOpeningPortal] = useState<string | null>(null);
	const openUrl = electronTrpc.external.openUrl.useMutation();

	useEffect(() => {
		apiTrpcClient.billing.details
			.query()
			.then(setDetails)
			.catch(() => {})
			.finally(() => setIsLoading(false));
	}, []);

	const handleEdit = async (flowType: "payment_method_update" | "general") => {
		setOpeningPortal(flowType);
		try {
			const result = await apiTrpcClient.billing.portal.mutate({ flowType });
			if (result?.url) {
				openUrl.mutate(result.url);
			}
		} catch {
			// Silently handle
		} finally {
			setOpeningPortal(null);
		}
	};

	if (isLoading || !details) return null;

	const addressStr = formatAddress(details.address);

	return (
		<div>
			<h3 className="text-sm font-medium mb-2">{t("billing.details")}</h3>
			<div>
				<DetailRow
					label={details.name ?? t("billing.noName")}
					hint={
						<>
							{addressStr && <div>{addressStr}</div>}
							{details.email && <div>{details.email}</div>}
						</>
					}
					action={
						<Button
							variant="ghost"
							size="sm"
							onClick={() => handleEdit("general")}
							disabled={openingPortal !== null}
						>
							{t("billing.edit")}
						</Button>
					}
				/>
				<DetailRow
					label={t("billing.paymentMethod")}
					hint={
						details.paymentMethod ? (
							<PaymentMethodLabel
								paymentMethod={details.paymentMethod}
								endingIn={t("billing.endingIn")}
							/>
						) : (
							t("billing.noPaymentMethod")
						)
					}
					action={
						<Button
							variant="ghost"
							size="sm"
							onClick={() => handleEdit("payment_method_update")}
							disabled={openingPortal !== null}
						>
							{t("billing.edit")}
						</Button>
					}
				/>
				<DetailRow
					label={t("billing.taxId")}
					hint={
						details.taxId
							? `${details.taxId.type.toUpperCase().replace("_", " ")} · ${details.taxId.value}`
							: t("billing.noTaxId")
					}
					action={
						<Button
							variant="ghost"
							size="sm"
							onClick={() => handleEdit("general")}
							disabled={openingPortal !== null}
						>
							{details.taxId ? t("billing.edit") : t("billing.addTaxId")}
						</Button>
					}
				/>
			</div>
		</div>
	);
}

interface DetailRowProps {
	label: React.ReactNode;
	hint?: React.ReactNode;
	action: React.ReactNode;
}

function DetailRow({ label, hint, action }: DetailRowProps) {
	return (
		<div className="flex items-center justify-between gap-8 py-3">
			<div className="min-w-0 flex-1">
				<div className="text-sm font-medium">{label}</div>
				{hint && (
					<div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
				)}
			</div>
			<div className="shrink-0">{action}</div>
		</div>
	);
}
