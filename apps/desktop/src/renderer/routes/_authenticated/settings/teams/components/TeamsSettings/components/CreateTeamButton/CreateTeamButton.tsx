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
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { authClient } from "renderer/lib/auth-client";
import { useTranslation } from "renderer/providers/I18nProvider";

interface CreateTeamButtonProps {
	organizationId: string;
}

function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function CreateTeamButton({ organizationId }: CreateTeamButtonProps) {
	const { t } = useTranslation();
	const [isOpen, setIsOpen] = useState(false);
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [slugEdited, setSlugEdited] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);

	function handleNameChange(value: string) {
		setName(value);
		if (!slugEdited) setSlug(slugify(value));
	}

	function handleSlugChange(value: string) {
		setSlug(value);
		setSlugEdited(true);
	}

	function reset() {
		setName("");
		setSlug("");
		setSlugEdited(false);
	}

	async function handleSubmit(event: React.FormEvent) {
		event.preventDefault();
		const trimmedName = name.trim();
		const trimmedSlug = slug.trim();
		if (!trimmedName || !trimmedSlug) return;

		setIsSubmitting(true);
		try {
			const result = await authClient.organization.createTeam({
				name: trimmedName,
				slug: trimmedSlug,
				organizationId,
			});
			if (result.error) {
				toast.error(result.error.message ?? t("teams.createFailed"));
				return;
			}
			toast.success(t("teams.createdNamed", { name: trimmedName }));
			reset();
			setIsOpen(false);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : t("teams.createFailed"),
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<>
			<Button onClick={() => setIsOpen(true)}>{t("teams.create")}</Button>
			<Dialog
				open={isOpen}
				onOpenChange={(open) => {
					setIsOpen(open);
					if (!open) reset();
				}}
			>
				<DialogContent>
					<form onSubmit={handleSubmit}>
						<DialogHeader>
							<DialogTitle>{t("teams.createTitle")}</DialogTitle>
							<DialogDescription>
								{t("teams.createDescription")}
							</DialogDescription>
						</DialogHeader>
						<div className="my-4 space-y-4">
							<div className="space-y-1.5">
								<Label htmlFor="team-name">{t("common.name")}</Label>
								<Input
									id="team-name"
									value={name}
									onChange={(event) => handleNameChange(event.target.value)}
									placeholder={t("teams.namePlaceholder")}
									autoFocus
									required
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="team-slug">{t("organization.slugLabel")}</Label>
								<Input
									id="team-slug"
									value={slug}
									onChange={(event) => handleSlugChange(event.target.value)}
									placeholder={t("teams.slugPlaceholder")}
									required
								/>
							</div>
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="ghost"
								onClick={() => setIsOpen(false)}
								disabled={isSubmitting}
							>
								{t("common.cancel")}
							</Button>
							<Button
								type="submit"
								disabled={!name.trim() || !slug.trim() || isSubmitting}
							>
								{isSubmitting ? t("teams.creating") : t("teams.create")}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</>
	);
}
