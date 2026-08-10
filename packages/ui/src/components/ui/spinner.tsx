import { Loader2Icon } from "lucide-react";

import { cn } from "../../lib/utils";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
	// DS Spinner: reads Loader2 in muted color; caller can tint via
	// `text-accent-solid`, `text-success`, `text-danger`. 900ms rotation
	// matches the DS motion contract; reduced-motion halts the spin.
	return (
		<Loader2Icon
			role="status"
			aria-label="Loading"
			className={cn(
				"size-[14px] text-fg-mute animate-spin [animation-duration:900ms] motion-reduce:animate-none",
				className,
			)}
			{...props}
		/>
	);
}

export { Spinner };
