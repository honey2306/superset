import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useEffect, useRef, useState } from "react";
import { VscRefresh } from "react-icons/vsc";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { ChangesViewMode } from "../../types";
import { ViewModeToggle } from "../ViewModeToggle";

interface ChangesHeaderProps {
	onRefresh: () => void;
	viewMode: ChangesViewMode;
	onViewModeChange: (mode: ChangesViewMode) => void;
	showViewModeToggle?: boolean;
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
}: ChangesHeaderProps) {
	return (
		<div className="flex items-center gap-0.5 px-2 py-1.5">
			{showViewModeToggle && (
				<ViewModeToggle
					viewMode={viewMode}
					onViewModeChange={onViewModeChange}
				/>
			)}
			<RefreshButton onRefresh={onRefresh} />
		</div>
	);
}
