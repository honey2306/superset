import type { GitHubStatus } from "@superset/local-db";
import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useEffect, useRef, useState } from "react";
import { VscRefresh } from "react-icons/vsc";
import type { MessageKey } from "renderer/providers/I18nProvider";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { ChangesViewMode } from "../../types";
import { ViewModeToggle } from "../ViewModeToggle";
import { BranchMenu } from "./components/BranchMenu";
import { PRButton } from "./components/PRButton";
import { PullButton } from "./components/PullButton";

interface ChangesHeaderProps {
	onRefresh: () => void;
	viewMode: ChangesViewMode;
	onViewModeChange: (mode: ChangesViewMode) => void;
	showViewModeToggle?: boolean;
	worktreePath: string;
	workspaceId: string;
	pullCount: number;
	pr: GitHubStatus["pr"] | null;
	isPRStatusLoading: boolean;
	canCreatePR: boolean;
	createPRBlockedReason: MessageKey | null;
}

function RefreshButton({ onRefresh }: { onRefresh: () => void }) {
	const { t } = useTranslation();
	const [isSpinning, setIsSpinning] = useState(false);
	const timeoutRef = useRef<NodeJS.Timeout | null>(null);

	const handleClick = () => {
		setIsSpinning(true);
		onRefresh();
		if (timeoutRef.current) clearTimeout(timeoutRef.current);
		timeoutRef.current = setTimeout(() => setIsSpinning(false), 600);
	};

	useEffect(() => {
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		};
	}, []);

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					onClick={handleClick}
					disabled={isSpinning}
					className="size-6 p-0"
				>
					<VscRefresh
						className={`size-3.5 ${isSpinning ? "animate-spin" : ""}`}
					/>
				</Button>
			</TooltipTrigger>
			<TooltipContent side="top" showArrow={false}>
				{t("v1Changes.header.refreshChanges")}
			</TooltipContent>
		</Tooltip>
	);
}

export function ChangesHeader({
	onRefresh,
	viewMode,
	onViewModeChange,
	showViewModeToggle = true,
	worktreePath,
	workspaceId,
	pullCount,
	pr,
	isPRStatusLoading,
	canCreatePR,
	createPRBlockedReason,
}: ChangesHeaderProps) {
	return (
		<div className="flex items-center gap-0.5 px-2 py-1.5">
			<BranchMenu workspaceId={workspaceId} />
			{showViewModeToggle && (
				<ViewModeToggle
					viewMode={viewMode}
					onViewModeChange={onViewModeChange}
				/>
			)}
			<PullButton
				worktreePath={worktreePath}
				pullCount={pullCount}
				onRefresh={onRefresh}
			/>
			<RefreshButton onRefresh={onRefresh} />
			<PRButton
				pr={pr}
				isLoading={isPRStatusLoading}
				canCreatePR={canCreatePR}
				createPRBlockedReason={createPRBlockedReason}
				worktreePath={worktreePath}
				onRefresh={onRefresh}
			/>
		</div>
	);
}
