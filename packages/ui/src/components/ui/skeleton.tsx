import { cn } from "../../lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
	// DS Skeleton: shimmer sweep, not opacity pulse (matches the DS Skeleton
	// primitive in preview). Reduced-motion collapses to a static tint.
	return (
		<div
			data-slot="skeleton"
			className={cn(
				"bg-[linear-gradient(90deg,var(--hover)_0%,var(--line)_50%,var(--hover)_100%)] bg-[length:200%_100%] animate-[ds-skeleton-shimmer_1.4s_linear_infinite] rounded-ds-2 motion-reduce:animate-none",
				className,
			)}
			{...props}
		/>
	);
}

export { Skeleton };
