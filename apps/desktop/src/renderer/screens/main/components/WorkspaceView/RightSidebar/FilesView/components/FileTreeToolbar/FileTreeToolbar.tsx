import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	LuChevronsDownUp,
	LuFilePlus,
	LuFolderPlus,
	LuRefreshCw,
	LuX,
} from "react-icons/lu";
import { useTranslation } from "renderer/providers/I18nProvider";
import { SEARCH_DEBOUNCE_MS } from "../../constants";

interface FileTreeToolbarProps {
	searchTerm: string;
	onSearchChange: (term: string) => void;
	onNewFile: () => void;
	onNewFolder: () => void;
	onCollapseAll: () => void;
	onRefresh: () => void;
	isRefreshing?: boolean;
}

export function FileTreeToolbar({
	searchTerm,
	onSearchChange,
	onNewFile,
	onNewFolder,
	onCollapseAll,
	onRefresh,
	isRefreshing = false,
}: FileTreeToolbarProps) {
	const { t } = useTranslation();
	const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm);
	const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (debounceTimeoutRef.current) {
			clearTimeout(debounceTimeoutRef.current);
			debounceTimeoutRef.current = null;
		}
		setLocalSearchTerm(searchTerm);
	}, [searchTerm]);

	useEffect(() => {
		return () => {
			if (debounceTimeoutRef.current) {
				clearTimeout(debounceTimeoutRef.current);
			}
		};
	}, []);

	const handleSearchChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const value = e.target.value;
			setLocalSearchTerm(value);

			if (debounceTimeoutRef.current) {
				clearTimeout(debounceTimeoutRef.current);
			}

			debounceTimeoutRef.current = setTimeout(() => {
				onSearchChange(value);
				debounceTimeoutRef.current = null;
			}, SEARCH_DEBOUNCE_MS);
		},
		[onSearchChange],
	);

	const handleClearSearch = useCallback(() => {
		setLocalSearchTerm("");
		if (debounceTimeoutRef.current) {
			clearTimeout(debounceTimeoutRef.current);
			debounceTimeoutRef.current = null;
		}
		onSearchChange("");
	}, [onSearchChange]);

	return (
		<div className="flex flex-col gap-1 px-2 py-1.5 border-b border-line">
			<div className="relative">
				<Input
					type="text"
					placeholder={t("files.search")}
					value={localSearchTerm}
					onChange={handleSearchChange}
					/*
					 * DS Input's default `bg-surface-elev` (≈#24252f) sits on top of
					 * `--sidebar` (#21222c) at only ~2% luminance delta, which reads
					 * as a muddy same-tone panel instead of a search field. Swap in
					 * `bg-surface` (#282a36) so the field visibly lifts off the
					 * sidebar without changing DS defaults elsewhere.
					 */
					className="h-7 text-xs pr-7 bg-surface"
				/>
				{localSearchTerm && (
					<button
						type="button"
						onClick={handleClearSearch}
						className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded text-fg-mute hover:text-fg hover:bg-fg-mute/20 transition-colors"
					>
						<LuX className="size-3.5" />
					</button>
				)}
			</div>

			<div className="flex items-center gap-0.5">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-6"
							onClick={onNewFile}
						>
							<LuFilePlus className="size-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">{t("files.newFile")}</TooltipContent>
				</Tooltip>

				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-6"
							onClick={onNewFolder}
						>
							<LuFolderPlus className="size-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">{t("files.newFolder")}</TooltipContent>
				</Tooltip>

				<div className="flex-1" />

				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-6"
							onClick={onCollapseAll}
						>
							<LuChevronsDownUp className="size-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						{t("files.collapseAll")}
					</TooltipContent>
				</Tooltip>

				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-6"
							onClick={onRefresh}
							disabled={isRefreshing}
						>
							<LuRefreshCw
								className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`}
							/>
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">{t("files.refresh")}</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
