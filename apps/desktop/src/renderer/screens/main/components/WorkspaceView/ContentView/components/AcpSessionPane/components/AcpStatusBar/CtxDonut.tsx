interface CtxDonutProps {
	pct: number;
	size?: number;
	stroke?: number;
}

/**
 * SVG donut for context usage — precise fill, threshold-tinted.
 *
 * Levels:
 * - low: 0-49%
 * - mid: 50-79%
 * - high: 80-89%
 * - crit: 90%+
 */
export function CtxDonut({ pct, size = 12, stroke = 2.5 }: CtxDonutProps) {
	const r = (size - stroke) / 2;
	const c = 2 * Math.PI * r;
	const level =
		pct >= 90 ? "crit" : pct >= 80 ? "high" : pct >= 50 ? "mid" : "low";

	return (
		<svg
			className="acp-status-bar__donut"
			data-level={level}
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
			aria-hidden
		>
			<title>Context window usage</title>
			<circle
				className="acp-status-bar__donut-track"
				cx={size / 2}
				cy={size / 2}
				r={r}
				fill="none"
				strokeWidth={stroke}
			/>
			<circle
				className="acp-status-bar__donut-fill"
				cx={size / 2}
				cy={size / 2}
				r={r}
				fill="none"
				stroke="currentColor"
				strokeWidth={stroke}
				strokeDasharray={`${(c * pct) / 100} ${c}`}
				transform={`rotate(-90 ${size / 2} ${size / 2})`}
			/>
		</svg>
	);
}
