import QRCode from "qrcode";
import { useMemo } from "react";

interface PairingQrCodeProps {
	url: string;
	size?: number;
}

/**
 * Renders `url` as an inline SVG QR code. Uses `qrcode.create` to get the
 * bit matrix and paints each dark module as an SVG rect so we never touch
 * `dangerouslySetInnerHTML` and don't take a canvas dependency.
 */
export function PairingQrCode({ url, size = 192 }: PairingQrCodeProps) {
	const matrix = useMemo(() => {
		try {
			const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
			return { data: qr.modules.data, size: qr.modules.size, error: null };
		} catch (err) {
			return {
				data: null,
				size: 0,
				error: err instanceof Error ? err.message : "Failed to render QR.",
			};
		}
	}, [url]);

	if (matrix.error || !matrix.data) {
		return (
			<div
				role="img"
				aria-label="QR code render error"
				className="flex items-center justify-center rounded bg-background text-xs text-red-500 select-text cursor-text"
				style={{ width: size, height: size }}
			>
				{matrix.error}
			</div>
		);
	}

	const cells: React.ReactNode[] = [];
	for (let row = 0; row < matrix.size; row++) {
		for (let col = 0; col < matrix.size; col++) {
			if (matrix.data[row * matrix.size + col]) {
				cells.push(
					<rect key={`${row}-${col}`} x={col} y={row} width={1} height={1} />,
				);
			}
		}
	}

	return (
		<div
			role="img"
			aria-label="Pairing QR code"
			className="rounded bg-white p-2"
			style={{ width: size + 16, height: size + 16 }}
		>
			<svg
				viewBox={`0 0 ${matrix.size} ${matrix.size}`}
				width={size}
				height={size}
				shapeRendering="crispEdges"
				fill="black"
				aria-hidden
			>
				<title>Pairing QR code</title>
				{cells}
			</svg>
		</div>
	);
}
