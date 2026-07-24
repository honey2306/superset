import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@superset/ui/button";
import { Card, CardContent, CardHeader } from "@superset/ui/card";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@superset/ui/form";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useSignOut } from "renderer/hooks/useSignOut";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import {
	type MessageKey,
	useTranslation,
} from "renderer/providers/I18nProvider";
import { z } from "zod";

export const Route = createFileRoute("/create-organization/")({
	component: CreateOrganization,
});

// Hoisted for stable props identity — <Navigate> re-navigates every re-render otherwise (react error #185 loop, #5729)
const signInRedirect = <Navigate to="/sign-in" replace />;

type FormValues = { name: string; slug: string };

function createFormSchema(t: (key: MessageKey) => string) {
	return z.object({
		name: z.string().min(1, t("organization.nameRequired")).max(100),
		slug: z
			.string()
			.min(3, t("organization.slugMin"))
			.max(50)
			.regex(/^[a-z0-9-]+$/, t("organization.slugCharacters"))
			.regex(/^[a-z0-9]/, t("organization.slugStart"))
			.regex(/[a-z0-9]$/, t("organization.slugEnd")),
	});
}

export function CreateOrganization() {
	const { t } = useTranslation();
	const formSchema = useMemo(() => createFormSchema(t), [t]);
	const { data: session } = authClient.useSession();
	const isSignedIn = !!session?.user;
	const activeOrganizationId = session?.session?.activeOrganizationId;
	const signOut = useSignOut();
	const navigate = useNavigate();

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isCheckingSlug, setIsCheckingSlug] = useState(false);
	const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);

	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: "",
			slug: "",
		},
	});

	const nameValue = form.watch("name");
	useEffect(() => {
		const slug = nameValue
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "");

		if (slug && slug !== form.getValues("slug")) {
			form.setValue("slug", slug, { shouldValidate: false });
		}
	}, [nameValue, form]);

	const slugValue = form.watch("slug");
	useEffect(() => {
		const timer = setTimeout(async () => {
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
				console.error("[create-org] Slug check failed:", error);
				setSlugAvailable(null);
			} finally {
				setIsCheckingSlug(false);
			}
		}, 500);

		return () => clearTimeout(timer);
	}, [slugValue]);

	async function handleSignOut(): Promise<void> {
		await signOut();
	}

	function renderSlugStatus(): ReactNode {
		if (isCheckingSlug) {
			return (
				<span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
					Checking...
				</span>
			);
		}
		if (slugAvailable === true) {
			return (
				<span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-green-600">
					Available
				</span>
			);
		}
		if (slugAvailable === false) {
			return (
				<span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-destructive">
					{t("organization.slugTaken")}
				</span>
			);
		}
		return null;
	}

	async function onSubmit(values: FormValues): Promise<void> {
		setIsSubmitting(true);
		try {
			const organization = await apiTrpcClient.organization.create.mutate({
				name: values.name,
				slug: values.slug,
			});

			await authClient.organization.setActive({
				organizationId: organization.id,
			});

			toast.success(t("organization.created"));
			navigate({ to: "/" });
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : t("organization.createFailed"),
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	if (!isSignedIn) {
		return signInRedirect;
	}

	const hasActiveOrganization = !!activeOrganizationId;

	return (
		<div className="relative flex min-h-screen items-center justify-center bg-background p-4">
			<div className="absolute top-4 right-4">
				{hasActiveOrganization ? (
					<Button
						variant="ghost"
						onClick={() => navigate({ to: "/" })}
						type="button"
					>
						{t("organization.cancel")}
					</Button>
				) : (
					<Button variant="ghost" onClick={handleSignOut} type="button">
						{t("organization.signOut")}
					</Button>
				)}
			</div>

			<Card className="w-full max-w-md">
				<CardHeader>
					<h1 className="text-2xl font-bold">{t("organization.create")}</h1>
					<p className="text-sm text-muted-foreground">
						{t("organization.description")}
					</p>
				</CardHeader>
				<CardContent>
					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
							{/* Organization Name */}
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("organization.name")}</FormLabel>
										<FormControl>
											<Input
												{...field}
												placeholder="Acme Inc."
												disabled={isSubmitting}
											/>
										</FormControl>
										<FormDescription>
											{t("organization.nameDescription")}
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="slug"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("organization.slug")}</FormLabel>
										<FormControl>
											<div className="relative">
												<Input
													{...field}
													placeholder="acme-inc"
													disabled={isSubmitting}
												/>
												{renderSlugStatus()}
											</div>
										</FormControl>
										<FormDescription>
											{t("organization.slugDescription")}
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<Button
								type="submit"
								className="w-full"
								disabled={
									isSubmitting || isCheckingSlug || slugAvailable === false
								}
							>
								{isSubmitting
									? t("organization.creating")
									: t("organization.create")}
							</Button>
						</form>
					</Form>
				</CardContent>
			</Card>
		</div>
	);
}
