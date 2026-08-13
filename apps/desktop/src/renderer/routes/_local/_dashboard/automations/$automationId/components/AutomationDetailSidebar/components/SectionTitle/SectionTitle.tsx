import type { ReactNode } from "react";

export function SectionTitle({ children }: { children: ReactNode }) {
	return (
		<span className="font-sans text-xs font-medium uppercase tracking-wider text-fg-mute">
			{children}
		</span>
	);
}
