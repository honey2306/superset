import { Button } from "@superset/ui/button";
import { Card } from "@superset/ui/card";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useState } from "react";
import { LuFolderOpen, LuGitBranch, LuLayoutTemplate } from "react-icons/lu";
import { track } from "renderer/lib/analytics";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { showHostServiceUnavailableToast } from "renderer/lib/host-service-unavailable";
import { useTranslation } from "renderer/providers/I18nProvider";
import {
	type ProjectSetupResult,
	useFinalizeProjectSetup,
} from "renderer/react-query/projects";
import { useOpenMainRepoWorkspace } from "renderer/react-query/workspaces";
import { useFolderFirstImport } from "renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/hooks/useFolderFirstImport";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { TemplateGalleryModal } from "renderer/routes/_authenticated/components/TemplateGalleryModal";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	beginProjectProvisioning,
	createWorkspaceProvisioningAdapter,
} from "renderer/stores/workspace-launch";

export const Route = createFileRoute("/_authenticated/onboarding/project/")({
	component: OnboardingProjectPage,
});

function deriveProjectNameFromUrl(url: string): string {
	const trimmed = url
		.trim()
		.replace(/[?#].*$/, "")
		.replace(/[\\/]+$/, "")
		.replace(/\.git$/i, "");
	const segments = trimmed.split(/[/:\\]/).filter(Boolean);
	return segments[segments.length - 1] ?? "";
}

function OnboardingProjectPage() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { refetch: refetchSession } = authClient.useSession();
	const { data: homeDir } = electronTrpc.window.getHomeDir.useQuery();
	const cloneTargetDir = homeDir ? `${homeDir}/.superset/projects` : null;
	const [url, setUrl] = useState("");
	const [busy, setBusy] = useState(false);
	const [templateOpen, setTemplateOpen] = useState(false);

	const hostService = useLocalHostService();
	const finalizeSetup = useFinalizeProjectSetup();
	const folderImport = useFolderFirstImport({
		onError: (message) =>
			toast.error(t("onboarding.openFolderFailed"), { description: message }),
	});
	const openMainRepoWorkspace = useOpenMainRepoWorkspace();

	// Adding a project finishes onboarding: mark onboarded, then hand off to the
	// dashboard's new-workspace modal pre-selected to the project just added.
	const finish = async (
		result: Pick<ProjectSetupResult, "projectId" | "mainWorkspaceId">,
	) => {
		track("onboarding_finished", { outcome: "completed" });
		try {
			await apiTrpcClient.user.completeOnboarding.mutate();
			// Reactive refetch (not imperative getSession) so the layout guards'
			// useSession() sees onboardedAt before we navigate — otherwise the
			// _authenticated guard bounces /workspaces back to /onboarding.
			await refetchSession({ query: { disableCookieCache: true } });
		} catch (error) {
			console.error("[onboarding] completeOnboarding failed", error);
			toast.error(t("onboarding.finishFailed"));
			return;
		}
		try {
			if (result.mainWorkspaceId) {
				await navigateToWorkspace(result.mainWorkspaceId, navigate);
			} else {
				await openMainRepoWorkspace.mutateAsync({
					projectId: result.projectId,
				});
			}
		} catch (error) {
			console.error("[onboarding] open main workspace failed", error);
			await navigate({ to: "/workspaces", replace: true });
		}
	};

	const handleOpenFolder = async () => {
		setBusy(true);
		try {
			const result = await folderImport.start();
			if (result) await finish(result);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : t("onboarding.openFolderFailed"),
			);
		} finally {
			setBusy(false);
		}
	};

	const handleClone = async (e: FormEvent) => {
		e.preventDefault();
		const trimmed = url.trim();
		if (!trimmed || !cloneTargetDir) return;
		setBusy(true);
		try {
			if (!hostService.activeHostUrl) {
				showHostServiceUnavailableToast(hostService, t, {
					action: t("project.cloneRepositoryAction"),
				});
				return;
			}
			const result = await beginProjectProvisioning({
				hostUrl: hostService.activeHostUrl,
				adapter: createWorkspaceProvisioningAdapter(hostService.activeHostUrl),
				request: {
					idempotencyKey: `onboarding-clone:${trimmed}:${cloneTargetDir}`,
					project: {
						kind: "clone",
						url: trimmed,
						parentDirectory: cloneTargetDir,
						name: deriveProjectNameFromUrl(trimmed),
					},
					source: { kind: "main" },
				},
			});
			finalizeSetup(hostService.activeHostUrl, result);
			await finish(result);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : t("onboarding.cloneFailed"),
			);
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="flex flex-col gap-3">
			<Card className="flex-row items-center gap-4 p-5">
				<ProjectIcon icon={<LuFolderOpen className="size-4.5" />} />
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium text-foreground">
						{t("onboarding.openFolder")}
					</p>
					<p className="text-xs text-muted-foreground">
						{t("onboarding.openFolderDescription")}
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={handleOpenFolder}
					disabled={busy}
				>
					{t("onboarding.browse")}
				</Button>
			</Card>

			<Card className="gap-4 p-5">
				<div className="flex items-center gap-4">
					<ProjectIcon icon={<LuGitBranch className="size-4.5" />} />
					<div className="min-w-0 flex-1">
						<p className="text-sm font-medium text-foreground">
							{t("onboarding.cloneRepo")}
						</p>
						<p className="text-xs text-muted-foreground">
							{t("onboarding.cloneDescription")}
						</p>
					</div>
				</div>
				<form onSubmit={handleClone} className="flex items-center gap-2">
					<Input
						type="text"
						placeholder="git@github.com:org/repo.git"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						disabled={busy}
						className="flex-1"
					/>
					<Button
						type="submit"
						disabled={!url.trim() || busy || !cloneTargetDir}
					>
						{busy ? t("onboarding.cloning") : t("onboarding.clone")}
					</Button>
				</form>
			</Card>

			<Card className="flex-row items-center gap-4 p-5">
				<ProjectIcon icon={<LuLayoutTemplate className="size-4.5" />} />
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium text-foreground">
						{t("workspace.startFromTemplate")}
					</p>
					<p className="text-xs text-muted-foreground">
						{t("onboarding.templateDescription")}
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={() => setTemplateOpen(true)}
					disabled={busy}
				>
					{t("onboarding.browse")}
				</Button>
			</Card>

			<TemplateGalleryModal
				open={templateOpen}
				onOpenChange={setTemplateOpen}
				onCreated={(result) => {
					setTemplateOpen(false);
					void finish(result);
				}}
			/>
		</div>
	);
}

function ProjectIcon({ icon }: { icon: ReactNode }) {
	return (
		<div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
			{icon}
		</div>
	);
}
