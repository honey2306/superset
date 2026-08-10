/**
 * Path breadcrumb. Mono for path segments, chevron between them, last
 * segment is `--fg`, prior segments are `--fg-mute` (clickable).
 */
export interface BreadcrumbProps {
	items: { label: string; onClick?: () => void }[];
	className?: string;
}
export function Breadcrumb(props: BreadcrumbProps): JSX.Element;
