import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormLabel,
	FormMessage,
} from "@superset/ui/form";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { z } from "zod";

const slugSchema = z.object({
	slug: z
		.string()
		.min(3, "Slug must be at least 3 characters")
		.max(50)
		.regex(
			/^[a-z0-9-]+$/,
			"Slug can only contain lowercase letters, numbers, and hyphens",
		)
		.regex(/^[a-z0-9]/, "Slug must start with a letter or number")
		.regex(/[a-z0-9]$/, "Slug must end with a letter or number"),
});

type SlugFormValues = z.infer<typeof slugSchema>;

interface SlugDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	currentSlug: string;
	onSuccess?: () => void;
}

export function SlugDialog({
	open,
	onOpenChange,
	organizationId,
	currentSlug,
	onSuccess,
}: SlugDialogProps) {
	const { t } = useTranslation();
	const [isCheckingSlug, setIsCheckingSlug] = useState(false);
	const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);

	const slugForm = useForm<SlugFormValues>({
		resolver: zodResolver(slugSchema),
		defaultValues: {
			slug: currentSlug,
		},
	});

	const slugValue = slugForm.watch("slug");

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally only sync on currentSlug change
	useEffect(() => {
		slugForm.reset({ slug: currentSlug });
	}, [currentSlug]);

	useEffect(() => {
		if (!open) return;

		const timer = setTimeout(async () => {
			if (slugValue === currentSlug) {
				setSlugAvailable(null);
				return;
			}

			if (!slugValue || slugValue.length < 3) {
				setSlugAvailable(null);
				return;
			}

			setIsCheckingSlug(true);
			try {
				const result = await authClient.organization.checkSlug({
					slug: slugValue,
				});

				setSlugAvailable(result.data?.status ?? null);
			} catch (error) {
				console.error("[slug-dialog] Slug check failed:", error);
				setSlugAvailable(null);
			} finally {
				setIsCheckingSlug(false);
			}
		}, 500);

		return () => clearTimeout(timer);
	}, [slugValue, currentSlug, open]);

	async function handleSlugUpdate(values: SlugFormValues): Promise<void> {
		try {
			await apiTrpcClient.organization.update.mutate({
				id: organizationId,
				slug: values.slug,
			});
			onSuccess?.();
			onOpenChange(false);
			setSlugAvailable(null);
			toast.success(t("organization.urlUpdated"));
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: t("organization.urlUpdateFailed");
			toast.error(message);
		}
	}

	function getSlugStatusDisplay(): { text: string; className: string } | null {
		if (isCheckingSlug) {
			return {
				text: t("organization.checking"),
				className: "text-muted-foreground",
			};
		}
		if (slugAvailable === true) {
			return { text: t("organization.available"), className: "text-green-600" };
		}
		if (slugAvailable === false) {
			return {
				text: t("organization.slugTaken"),
				className: "text-destructive",
			};
		}
		return null;
	}

	const slugStatus = getSlugStatusDisplay();

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("organization.changeSlug")}</DialogTitle>
					<DialogDescription>
						{t("organization.changeSlugDescription")}
					</DialogDescription>
				</DialogHeader>
				<Form {...slugForm}>
					<form
						onSubmit={slugForm.handleSubmit(handleSlugUpdate)}
						className="space-y-4"
					>
						<FormField
							control={slugForm.control}
							name="slug"
							render={({ field }) => (
								<>
									<FormLabel>{t("organization.organizationSlug")}</FormLabel>
									<FormControl>
										<div className="relative">
											<Input {...field} placeholder="acme-inc" />
											{slugStatus && (
												<span
													className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs ${slugStatus.className}`}
												>
													{slugStatus.text}
												</span>
											)}
										</div>
									</FormControl>
									<FormMessage />
								</>
							)}
						/>
						<DialogFooter>
							<Button
								type="button"
								variant="ghost"
								onClick={() => {
									onOpenChange(false);
									slugForm.reset({ slug: currentSlug });
									setSlugAvailable(null);
								}}
							>
								{t("common.cancel")}
							</Button>
							<Button
								type="submit"
								disabled={
									isCheckingSlug ||
									slugAvailable === false ||
									slugValue === currentSlug
								}
							>
								{t("common.save")}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
