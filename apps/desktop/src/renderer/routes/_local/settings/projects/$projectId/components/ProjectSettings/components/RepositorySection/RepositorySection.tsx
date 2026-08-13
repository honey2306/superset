import { parseGitHubRemote } from "@superset/shared/github-remote";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { FaGithub } from "react-icons/fa";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";

interface RepositorySectionProps {
	repoUrl: string | null;
}

/**
 * Read-only: the repository URL is derived from the repo's git remote by
 * the host and re-resolved on every import/setup — edit the remote in git
 * to change it.
 */
export function RepositorySection({ repoUrl }: RepositorySectionProps) {
	const { t } = useTranslation();
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const parsed = repoUrl ? parseGitHubRemote(repoUrl) : null;

	return (
		<div className="relative w-96">
			<Input
				id="project-repo"
				value={repoUrl ?? ""}
				readOnly
				disabled
				placeholder={t("project.noGitRemote")}
				className="w-full font-mono text-sm pr-9"
			/>
			{parsed && (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="absolute right-1 top-1 size-7 text-fg-mute hover:text-fg"
							onClick={() => openUrl.mutate(parsed.url)}
							aria-label={t("project.openInGitHub")}
						>
							<FaGithub className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>{t("project.openInGitHub")}</TooltipContent>
				</Tooltip>
			)}
		</div>
	);
}
