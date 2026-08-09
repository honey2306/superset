/**
 * Hairline horizontal rule. Bare form = 1px `--line`. With `label`, a small
 * mono caption sits centered on the rule ("Yesterday" · "3 more"). Use inside
 * lists and popovers to break groups; never as a decorative element.
 */
export interface DividerProps {
	label?: string;
	className?: string;
}
export function Divider(props: DividerProps): JSX.Element;
