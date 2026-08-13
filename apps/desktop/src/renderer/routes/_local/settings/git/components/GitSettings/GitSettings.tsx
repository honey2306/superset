import type { BranchPrefixMode } from "@superset/shared/workspace-launch";
import {
	resolveBranchPrefix,
	sanitizeSegment,
} from "@superset/shared/workspace-launch";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Switch } from "@superset/ui/switch";
import { useEffect, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import { BRANCH_PREFIX_MODE_LABEL_KEYS } from "../../../utils/branch-prefix";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { UserWorktreeLocationSection } from "./components/UserWorktreeLocationSection";
import {
	useHostBranchPrefix,
	useHostGitInfo,
	useSetHostBranchPrefix,
} from "./hooks/useHostBranchPrefix";

interface GitSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function GitSettings({ visibleItems }: GitSettingsProps) {
	const { t } = useTranslation();
	const showDeleteLocalBranch = isItemVisible(
		SETTING_ITEM_ID.GIT_DELETE_LOCAL_BRANCH,
		visibleItems,
	);
	const showBranchPrefix = isItemVisible(
		SETTING_ITEM_ID.GIT_BRANCH_PREFIX,
		visibleItems,
	);
	const showWorktreeLocation = isItemVisible(
		SETTING_ITEM_ID.GIT_WORKTREE_LOCATION,
		visibleItems,
	);

	const utils = electronTrpc.useUtils();
	const { activeHostUrl } = useLocalHostService();

	const { data: deleteLocalBranch, isLoading: isDeleteBranchLoading } =
		electronTrpc.settings.getDeleteLocalBranch.useQuery();
	const setDeleteLocalBranch =
		electronTrpc.settings.setDeleteLocalBranch.useMutation({
			onMutate: async ({ enabled }) => {
				await utils.settings.getDeleteLocalBranch.cancel();
				const previous = utils.settings.getDeleteLocalBranch.getData();
				utils.settings.getDeleteLocalBranch.setData(undefined, enabled);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getDeleteLocalBranch.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getDeleteLocalBranch.invalidate();
			},
		});

	const handleDeleteBranchToggle = (enabled: boolean) => {
		setDeleteLocalBranch.mutate({ enabled });
	};

	const { data: branchPrefix, isLoading: isBranchPrefixLoading } =
		useHostBranchPrefix(activeHostUrl);
	const { data: gitInfo } = useHostGitInfo(activeHostUrl);

	const [customPrefixInput, setCustomPrefixInput] = useState(
		branchPrefix?.customPrefix ?? "",
	);

	useEffect(() => {
		setCustomPrefixInput(branchPrefix?.customPrefix ?? "");
	}, [branchPrefix?.customPrefix]);

	const setBranchPrefix = useSetHostBranchPrefix(activeHostUrl);

	const handleBranchPrefixModeChange = (mode: BranchPrefixMode) => {
		setBranchPrefix.mutate({
			mode,
			customPrefix: customPrefixInput || null,
		});
	};

	const handleCustomPrefixBlur = () => {
		const sanitized = sanitizeSegment(customPrefixInput);
		setCustomPrefixInput(sanitized);
		setBranchPrefix.mutate({
			mode: "custom",
			customPrefix: sanitized || null,
		});
	};

	const previewPrefix =
		resolveBranchPrefix({
			mode: branchPrefix?.mode ?? "none",
			customPrefix: customPrefixInput,
			authorPrefix: gitInfo?.authorName,
			githubUsername: gitInfo?.githubUsername,
		}) ||
		(branchPrefix?.mode === "author"
			? "author-name"
			: branchPrefix?.mode === "github"
				? "username"
				: null);

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">{t("settings.gitWorktrees")}</h2>
				<p className="text-sm text-fg-mute mt-1">
					{t("git.legacyDescription")}
				</p>
			</div>

			<div className="space-y-6">
				{showDeleteLocalBranch && (
					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<Label
								htmlFor="delete-local-branch"
								className="text-sm font-medium"
							>
								{t("git.deleteLocalBranch")}
							</Label>
							<p className="text-xs text-fg-mute">
								{t("git.deleteLocalBranchHint")}
							</p>
						</div>
						<Switch
							id="delete-local-branch"
							checked={deleteLocalBranch ?? false}
							onCheckedChange={handleDeleteBranchToggle}
							disabled={isDeleteBranchLoading || setDeleteLocalBranch.isPending}
						/>
					</div>
				)}

				{showBranchPrefix && (
					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<Label className="text-sm font-medium">
								{t("git.branchPrefix")}
							</Label>
							<p className="text-xs text-fg-mute">
								{t("git.branchPrefixHint")}{" "}
								<code className="bg-hover px-1.5 py-0.5 rounded text-fg">
									{previewPrefix
										? `${previewPrefix}/branch-name`
										: "branch-name"}
								</code>
							</p>
						</div>
						<div className="flex items-center gap-2">
							<Select
								value={branchPrefix?.mode ?? "none"}
								onValueChange={(value) =>
									handleBranchPrefixModeChange(value as BranchPrefixMode)
								}
								disabled={
									!activeHostUrl ||
									isBranchPrefixLoading ||
									setBranchPrefix.isPending
								}
							>
								<SelectTrigger className="w-[180px]">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{(
										Object.entries(BRANCH_PREFIX_MODE_LABEL_KEYS) as [
											BranchPrefixMode,
											(typeof BRANCH_PREFIX_MODE_LABEL_KEYS)[BranchPrefixMode],
										][]
									).map(([value, labelKey]) => (
										<SelectItem key={value} value={value}>
											{t(labelKey)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{branchPrefix?.mode === "custom" && (
								<Input
									placeholder={t("project.prefixPlaceholder")}
									value={customPrefixInput}
									onChange={(e) => setCustomPrefixInput(e.target.value)}
									onBlur={handleCustomPrefixBlur}
									className="w-[120px]"
									disabled={
										!activeHostUrl ||
										isBranchPrefixLoading ||
										setBranchPrefix.isPending
									}
								/>
							)}
						</div>
					</div>
				)}

				{showWorktreeLocation && <UserWorktreeLocationSection />}
			</div>
		</div>
	);
}
