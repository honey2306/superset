import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useEffect, useRef } from "react";
import { HiChevronDown, HiChevronUp, HiMiniXMark } from "react-icons/hi2";
import { PiTextAa } from "react-icons/pi";

interface MarkdownSearchProps {
	isOpen: boolean;
	query: string;
	caseSensitive: boolean;
	matchCount: number;
	activeMatchIndex: number;
	onQueryChange: (query: string) => void;
	onCaseSensitiveChange: (caseSensitive: boolean) => void;
	onFindNext: () => void;
	onFindPrevious: () => void;
	onClose: () => void;
}

export function MarkdownSearch({
	isOpen,
	query,
	caseSensitive,
	matchCount,
	activeMatchIndex,
	onQueryChange,
	onCaseSensitiveChange,
	onFindNext,
	onFindPrevious,
	onClose,
}: MarkdownSearchProps) {
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (isOpen && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [isOpen]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Escape") {
			e.preventDefault();
			onClose();
		} else if (e.key === "Enter") {
			e.preventDefault();
			if (e.shiftKey) {
				onFindPrevious();
			} else {
				onFindNext();
			}
		}
	};

	if (!isOpen) return null;

	return (
		<div className="absolute top-1 right-1 z-10 flex items-center max-w-[calc(100%-0.5rem)] rounded bg-surface-sunk/95 pl-2 pr-0.5 shadow-lg ring-1 ring-line/40 backdrop-blur">
			<input
				ref={inputRef}
				type="text"
				value={query}
				onChange={(e) => onQueryChange(e.target.value)}
				onKeyDown={handleKeyDown}
				placeholder="Find"
				className="h-6 min-w-0 w-28 flex-shrink bg-transparent text-sm text-fg placeholder:text-fg-mute focus:outline-none"
			/>
			{query && (
				<span className="text-xs text-fg-mute whitespace-nowrap px-1">
					{matchCount === 0
						? "No results"
						: `${activeMatchIndex + 1} of ${matchCount}`}
				</span>
			)}
			<div className="flex items-center shrink-0">
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() => onCaseSensitiveChange(!caseSensitive)}
							className={`rounded p-1 transition-colors ${
								caseSensitive
									? "bg-accent-tint text-fg"
									: "text-fg-mute hover:bg-fg-mute/20 hover:text-fg"
							}`}
						>
							<PiTextAa className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">Match case</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={onFindPrevious}
							className="rounded p-1 text-fg-mute transition-colors hover:bg-fg-mute/20 hover:text-fg"
						>
							<HiChevronUp className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">Previous (Shift+Enter)</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={onFindNext}
							className="rounded p-1 text-fg-mute transition-colors hover:bg-fg-mute/20 hover:text-fg"
						>
							<HiChevronDown className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">Next (Enter)</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={onClose}
							className="rounded p-1 text-fg-mute transition-colors hover:bg-fg-mute/20 hover:text-fg"
						>
							<HiMiniXMark className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">Close (Esc)</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
