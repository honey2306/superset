/**
 * User avatar. 20/24/28/32px sizes. Falls back to initials on
 * --surface-elev with mono type; no ring, no online-dot (that's a project
 * pattern, not a primitive).
 */
export interface AvatarProps {
	name: string;
	src?: string;
	size?: 20 | 24 | 28 | 32;
	className?: string;
}
export function Avatar(props: AvatarProps): JSX.Element;
