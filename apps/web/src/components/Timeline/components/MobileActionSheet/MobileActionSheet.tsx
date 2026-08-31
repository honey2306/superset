import { type ReactNode, useEffect, useId, useState } from "react";

interface MobileActionSheetProps {
	tone: "ask" | "plan" | "permission";
	icon: string;
	label: string;
	summary: string;
	meta?: string;
	kicker: string;
	title: string;
	subtitle?: string;
	children: ReactNode;
	footer?: ReactNode;
}

export function MobileActionSheet({
	tone,
	icon,
	label,
	summary,
	meta,
	kicker,
	title,
	subtitle,
	children,
	footer,
}: MobileActionSheetProps) {
	const [open, setOpen] = useState(false);
	const titleId = useId();

	useEffect(() => {
		if (!open) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [open]);

	return (
		<>
			<button
				type="button"
				className="mobile-action-dock"
				data-tone={tone}
				onClick={() => setOpen(true)}
				aria-haspopup="dialog"
			>
				<span className="mobile-action-dock__icon" aria-hidden="true">
					{icon}
				</span>
				<span className="mobile-action-dock__copy">
					<strong>{label}</strong>
					<span>{summary}</span>
				</span>
				{meta ? (
					<span className="mobile-action-dock__meta">{meta} ›</span>
				) : (
					<span className="mobile-action-dock__meta" aria-hidden="true">
						›
					</span>
				)}
			</button>

			{open ? (
				<div className="mobile-action-sheet-layer">
					<button
						type="button"
						className="mobile-action-sheet-scrim"
						onClick={() => setOpen(false)}
						aria-label="Close details"
					/>
					<section
						className="mobile-action-sheet"
						role="dialog"
						aria-modal="true"
						aria-labelledby={titleId}
						data-tone={tone}
					>
						<div className="mobile-action-sheet__handle" aria-hidden="true" />
						<header className="mobile-action-sheet__header">
							<div className="min-w-0 flex-1">
								<div className="mobile-action-sheet__kicker">{kicker}</div>
								<h2 id={titleId}>{title}</h2>
								{subtitle ? <p>{subtitle}</p> : null}
							</div>
							<button
								type="button"
								className="mobile-action-sheet__close"
								onClick={() => setOpen(false)}
								aria-label="Close details"
							>
								×
							</button>
						</header>
						<div className="mobile-action-sheet__body">{children}</div>
						{footer ? (
							<footer className="mobile-action-sheet__footer">{footer}</footer>
						) : null}
					</section>
				</div>
			) : null}
		</>
	);
}
