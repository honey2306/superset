/**
 * On/off switch (18px tall). Pair with an external label — the control
 * itself is unlabeled.
 */
export interface SwitchProps {
	checked: boolean;
	onChange?: (next: boolean) => void;
	className?: string;
}

export function Switch(props: SwitchProps): JSX.Element;
