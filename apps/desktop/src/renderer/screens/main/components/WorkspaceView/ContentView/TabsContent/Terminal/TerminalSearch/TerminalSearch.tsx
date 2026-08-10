import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ISearchOptions, SearchAddon } from "@xterm/addon-search";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiChevronDown, HiChevronUp, HiMiniXMark } from "react-icons/hi2";
import { PiTextAa } from "react-icons/pi";
import { useTranslation } from "renderer/providers/I18nProvider";

interface TerminalSearchProps {
	searchAddon: SearchAddon | null;
	isOpen: boolean;
	onClose: () => void;
}

const SEARCH_DECORATIONS: ISearchOptions["decorations"] = {
	matchBackground: "#515c6a",
	matchBorder: "#74879f",
	matchOverviewRuler: "#d186167e",
	activeMatchBackground: "#515c6a",
	activeMatchBorder: "#ffd33d",
	activeMatchColorOverviewRuler: "#ffd33d",
};

export function TerminalSearch({
	searchAddon,
	isOpen,
	onClose,
}: TerminalSearchProps) {
	const { t } = useTranslation();
	const inputRef = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState("");
	const [matchCount, setMatchCount] = useState<number | null>(null);
	const [caseSensitive, setCaseSensitive] = useState(false);

	const searchOptions: ISearchOptions = useMemo(
		() => ({
			caseSensitive,
			regex: false,
			decorations: SEARCH_DECORATIONS,
		}),
		[caseSensitive],
	);

	// Focus input when search opens
	useEffect(() => {
		if (isOpen && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [isOpen]);

	// Clear search highlighting when closing
	useEffect(() => {
		if (!isOpen && searchAddon) {
			searchAddon.clearDecorations();
		}
	}, [isOpen, searchAddon]);

	const handleSearch = useCallback(
		(direction: "next" | "previous") => {
			if (!searchAddon || !query) return;

			const found =
				direction === "next"
					? searchAddon.findNext(query, searchOptions)
					: searchAddon.findPrevious(query, searchOptions);

			// xterm search addon doesn't provide match count directly
			// We just indicate if there are matches or not
			setMatchCount(found ? 1 : 0);
		},
		[searchAddon, query, searchOptions],
	);

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newQuery = e.target.value;
		setQuery(newQuery);

		if (searchAddon && newQuery) {
			const found = searchAddon.findNext(newQuery, searchOptions);
			setMatchCount(found ? 1 : 0);
		} else {
			setMatchCount(null);
			searchAddon?.clearDecorations();
		}
	};

	const toggleCaseSensitive = () => {
		setCaseSensitive((prev) => !prev);
	};

	// Re-run search when case sensitivity changes
	useEffect(() => {
		if (searchAddon && query) {
			const found = searchAddon.findNext(query, searchOptions);
			setMatchCount(found ? 1 : 0);
		}
	}, [searchAddon, query, searchOptions]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Escape") {
			e.preventDefault();
			onClose();
		} else if (e.key === "Enter") {
			e.preventDefault();
			if (e.shiftKey) {
				handleSearch("previous");
			} else {
				handleSearch("next");
			}
		}
	};

	const handleClose = () => {
		setQuery("");
		setMatchCount(null);
		onClose();
	};

	if (!isOpen) return null;

	return (
		<div className="absolute top-1 right-1 z-10 flex items-center max-w-[calc(100%-0.5rem)] rounded bg-surface-sunk/95 pl-2 pr-0.5 shadow-lg ring-1 ring-line/40 backdrop-blur">
			<input
				ref={inputRef}
				type="text"
				value={query}
				onChange={handleInputChange}
				onKeyDown={handleKeyDown}
				placeholder={t("v2Workspace.terminalSearch.find")}
				className="h-6 min-w-0 w-28 flex-shrink bg-transparent text-sm text-fg placeholder:text-fg-mute focus:outline-none"
			/>
			{matchCount === 0 && query && (
				<span className="text-xs text-fg-mute whitespace-nowrap px-1">
					{t("v2Workspace.terminalSearch.noResults")}
				</span>
			)}
			<div className="flex items-center shrink-0">
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={toggleCaseSensitive}
							className={`rounded p-1 transition-colors ${
								caseSensitive
									? "bg-accent-tint text-fg"
									: "text-fg-mute hover:bg-fg-mute/20 hover:text-fg"
							}`}
						>
							<PiTextAa className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						{t("v2Workspace.terminalSearch.matchCase")}
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() => handleSearch("previous")}
							className="rounded p-1 text-fg-mute transition-colors hover:bg-fg-mute/20 hover:text-fg"
						>
							<HiChevronUp className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						{t("v2Workspace.terminalSearch.previous")}
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() => handleSearch("next")}
							className="rounded p-1 text-fg-mute transition-colors hover:bg-fg-mute/20 hover:text-fg"
						>
							<HiChevronDown className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						{t("v2Workspace.terminalSearch.next")}
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleClose}
							className="rounded p-1 text-fg-mute transition-colors hover:bg-fg-mute/20 hover:text-fg"
						>
							<HiMiniXMark className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						{t("v2Workspace.terminalSearch.close")}
					</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
