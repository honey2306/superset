"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import type * as React from "react";

import { cn } from "../../lib/utils";

function Switch({
	className,
	...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
	return (
		<SwitchPrimitive.Root
			data-slot="switch"
			className={cn(
				// DS Switch: 18px tall × 30px, r-pill, unchecked = --line bg,
				// checked = accent-line bg (pink 55%). Thumb is 14px --fg dot,
				// slides 12px on toggle. Focus fires DS accent glow.
				"peer inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full border-0 bg-line data-[state=checked]:bg-accent-line focus-visible:ring-[3px] focus-visible:ring-accent-tint transition-colors duration-[120ms] outline-none disabled:cursor-not-allowed disabled:opacity-50",
				className,
			)}
			{...props}
		>
			<SwitchPrimitive.Thumb
				data-slot="switch-thumb"
				className={cn(
					"bg-fg pointer-events-none block size-[14px] translate-x-[2px] rounded-full ring-0 transition-transform duration-[120ms] data-[state=checked]:translate-x-[14px]",
				)}
			/>
		</SwitchPrimitive.Root>
	);
}

export { Switch };
