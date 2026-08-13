import { type RefObject, useEffect, useRef } from "react";
import { isNearTimelineBottom } from "../../utils/autoFollow";

export function useTimelineAutoFollow(updateKey: string): {
	containerRef: RefObject<HTMLDivElement | null>;
	onScroll: () => void;
} {
	const containerRef = useRef<HTMLDivElement>(null);
	const followsLatestRef = useRef(true);

	const onScroll = () => {
		const element = containerRef.current;
		if (!element) return;
		followsLatestRef.current = isNearTimelineBottom(element);
	};

	useEffect(() => {
		if (!updateKey) return;
		const element = containerRef.current;
		if (!element || !followsLatestRef.current) return;
		element.scrollTop = element.scrollHeight;
	}, [updateKey]);

	return { containerRef, onScroll };
}
