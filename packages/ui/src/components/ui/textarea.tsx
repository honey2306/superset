import type * as React from "react";

import { cn } from "../../lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
	// DS Textarea: hairline on --surface-elev, r-4, focus fires DS pink ring.
	// Auto-sizes to content unless the caller pins `rows` / uses `resize`.
	return (
		<textarea
			data-slot="textarea"
			className={cn(
				"border border-line bg-surface-elev text-fg placeholder:text-fg-faint focus-visible:border-accent-line focus-visible:ring-[3px] focus-visible:ring-accent-tint aria-invalid:ring-destructive/25 aria-invalid:border-destructive flex field-sizing-content min-h-[62px] w-full rounded-ds-4 px-3 py-2 text-[12px] leading-[var(--lh-body)] transition-[border-color,box-shadow] duration-[120ms] outline-none disabled:cursor-not-allowed disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	);
}

export { Textarea };
