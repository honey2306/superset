import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "@superset/ui/utils";
import { CheckIcon } from "lucide-react";
import type { ReactNode } from "react";

interface StatusOptionItemProps {
	/** Renders the row as the current value: neutral wash + accent check + medium label. */
	selected: boolean;
	disabled?: boolean;
	onSelect: () => void;
	children: ReactNode;
}

/**
 * Shared row for the ACP status-bar config menus (model / thinking / mode).
 * Built on the Radix primitive rather than the DS `DropdownMenuItem` so the
 * current value reads as a selection — neutral wash, medium label and a
 * pink accent check — instead of the generic disabled dimming, while
 * keyboard/pointer highlight stays the calm neutral wash.
 */
export function StatusOptionItem({
	selected,
	disabled,
	onSelect,
	children,
}: StatusOptionItemProps) {
	return (
		<DropdownMenuPrimitive.Item
			disabled={disabled}
			onSelect={() => onSelect()}
			className={cn(
				"focus:bg-hover focus:text-fg data-[highlighted]:bg-hover data-[highlighted]:text-fg relative flex h-[30px] w-full cursor-default items-center gap-2 rounded-ds-3 py-0 pr-2.5 pl-2.5 text-xs text-fg outline-hidden select-none transition-colors duration-[80ms]",
				"[&_img]:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0",
				selected
					? "bg-hover font-medium data-[disabled]:pointer-events-none"
					: "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
			)}
		>
			{children}
			{selected && (
				<CheckIcon
					aria-hidden
					className="ml-auto size-3.5 shrink-0 text-accent-foreground"
				/>
			)}
		</DropdownMenuPrimitive.Item>
	);
}
