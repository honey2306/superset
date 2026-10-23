import type { SessionConfigOption } from "@superset/session-protocol";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { ChevronDown, Cpu } from "lucide-react";
import { StatusOptionItem } from "../StatusOptionItem";

interface RuntimeSelectorProps {
	option: Extract<SessionConfigOption, { type: "select" }>;
	disabled: boolean;
	onChange?(id: string, value: string): Promise<void>;
}

export function RuntimeSelector({
	option,
	disabled,
	onChange,
}: RuntimeSelectorProps) {
	const options = option.options.flatMap((entry) =>
		"options" in entry ? entry.options : [entry],
	);
	const current = options.find((entry) => entry.value === option.currentValue);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="acp-status-bar__seg"
					disabled={disabled || !onChange}
					aria-label={`Change runtime, current ${current?.name ?? option.currentValue}`}
					title={
						disabled
							? "Start a new conversation to change runtime"
							: "Choose runtime before sending the first message"
					}
				>
					<Cpu className="acp-status-bar__seg-icon" aria-hidden />
					<span className="acp-status-bar__seg-value">
						{current?.name ?? option.currentValue}
					</span>
					<ChevronDown className="acp-status-bar__seg-chev" aria-hidden />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">
				{options.map((entry) => (
					<StatusOptionItem
						key={entry.value}
						selected={entry.value === option.currentValue}
						disabled={
							disabled || entry.value === option.currentValue || !onChange
						}
						onSelect={() => {
							void onChange?.(option.id, entry.value);
						}}
					>
						{entry.name}
					</StatusOptionItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
