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

function readCssColor(name: string, fallback: string): string {
	if (typeof window === "undefined") return fallback;
	const value = getComputedStyle(document.documentElement)
		.getPropertyValue(name)
		.trim();
	return value || fallback;
}

/**
 * xterm-addon-search needs concrete CSS color strings, so we resolve the
 * theme's highlight tokens at open time. Fallbacks match the VS Code
 * search palette in case the theme store hasn't hydrated yet.
 */
function getSearchDecorations(): ISearchOptions["decorations"] {
	const match = readCssColor("--highlight-match", "#515c6a");
	const active = readCssColor("--highlight-active", "#ffd33d");
	const line = readCssColor("--line-strong", "#74879f");
	return {
		matchBackground: match,
		matchBorder: line,
		matchOverviewRuler: match,
		activeMatchBackground: active,
		activeMatchBorder: active,
		activeMatchColorOverviewRuler: active,
	};
}

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
	// Re-resolve theme-derived decorations each time the panel opens so a
	// theme change between opens is picked up.
	const [decorations, setDecorations] = useState(() => getSearchDecorations());
	useEffect(() => {
		if (isOpen) setDecorations(getSearchDecorations());
	}, [isOpen]);

	const searchOptions: ISearchOptions = useMemo(
		() => ({
			caseSensitive,
			regex: false,
			decorations,
		}),
		[caseSensitive, decorations],
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
				placeholder={t("workspace.terminalSearch.find")}
				className="h-6 min-w-0 w-28 flex-shrink bg-transparent text-sm text-fg placeholder:text-fg-mute focus:outline-none"
			/>
			{matchCount === 0 && query && (
				<span className="text-xs text-fg-mute whitespace-nowrap px-1">
					{t("workspace.terminalSearch.noResults")}
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
						{t("workspace.terminalSearch.matchCase")}
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
						{t("workspace.terminalSearch.previous")}
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
						{t("workspace.terminalSearch.next")}
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
						{t("workspace.terminalSearch.close")}
					</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
