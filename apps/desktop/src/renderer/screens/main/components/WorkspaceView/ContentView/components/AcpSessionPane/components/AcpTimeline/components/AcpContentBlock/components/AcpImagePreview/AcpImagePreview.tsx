import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "@superset/ui/dialog";

interface AcpImagePreviewProps {
	src: string;
}

export function AcpImagePreview({ src }: AcpImagePreviewProps) {
	return (
		<Dialog modal>
			<DialogTrigger asChild>
				<button
					type="button"
					aria-label="Open image preview"
					style={{
						background: "transparent",
						border: 0,
						borderRadius: 4,
						cursor: "zoom-in",
						display: "block",
						padding: 0,
					}}
				>
					<img
						src={src}
						alt=""
						style={{
							maxHeight: 160,
							maxWidth: "min(100%, 240px)",
							borderRadius: 4,
							border: "1px solid var(--acp-line)",
							objectFit: "contain",
						}}
					/>
				</button>
			</DialogTrigger>
			<DialogContent
				className="flex max-h-[95vh] !max-w-[95vw] items-center justify-center overflow-hidden border-0 bg-transparent p-0 shadow-none"
				aria-label="Image preview"
			>
				<DialogTitle className="sr-only">Image preview</DialogTitle>
				<DialogDescription className="sr-only">
					Expanded image preview
				</DialogDescription>
				<img
					src={src}
					alt="Expanded preview"
					style={{
						display: "block",
						height: "auto",
						maxHeight: "85vh",
						maxWidth: "90vw",
						objectFit: "contain",
						width: "auto",
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}
