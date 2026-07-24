import { useEffect, useState } from "react";
import { HiArrowTopRightOnSquare } from "react-icons/hi2";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";

interface Invoice {
	id: string;
	date: number;
	amount: number;
	currency: string;
	hostedInvoiceUrl: string | null | undefined;
}

function formatAmount(amount: number, currency: string, locale: string) {
	return new Intl.NumberFormat(locale, {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(amount / 100);
}

function formatDate(timestamp: number, locale: string) {
	return new Intl.DateTimeFormat(locale, {
		year: "numeric",
		month: "short",
		day: "numeric",
	}).format(new Date(timestamp * 1000));
}

export function RecentInvoices() {
	const { locale, t } = useTranslation();
	const [invoices, setInvoices] = useState<Invoice[]>([]);
	const openUrl = electronTrpc.external.openUrl.useMutation();

	useEffect(() => {
		apiTrpcClient.billing.invoices
			.query()
			.then(setInvoices)
			.catch(() => {
				// Silently handle errors — invoices are non-critical
			});
	}, []);

	if (invoices.length === 0) {
		return null;
	}

	return (
		<div>
			<h3 className="text-sm font-medium mb-2">
				{t("billing.recentInvoices")}
			</h3>
			<div className="divide-y divide-border">
				{invoices.map((invoice) => (
					<div
						key={invoice.id}
						className="flex items-center justify-between gap-8 py-3"
					>
						<div className="flex items-center gap-6 text-sm">
							<span className="text-muted-foreground tabular-nums">
								{formatDate(invoice.date, locale)}
							</span>
							<span className="tabular-nums">
								{formatAmount(invoice.amount, invoice.currency, locale)}
							</span>
						</div>
						{invoice.hostedInvoiceUrl ? (
							<button
								type="button"
								onClick={() =>
									openUrl.mutate(invoice.hostedInvoiceUrl as string)
								}
								className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
							>
								{t("billing.viewInvoice")}
								<HiArrowTopRightOnSquare className="h-3 w-3" />
							</button>
						) : null}
					</div>
				))}
			</div>
		</div>
	);
}
