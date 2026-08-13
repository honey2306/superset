import { cn } from "@superset/ui/utils";
import { useState } from "react";

interface ProjectThumbnailProps {
	projectName: string;
	iconUrl?: string | null;
	className?: string;
}

export function ProjectThumbnail({
	projectName,
	iconUrl,
	className,
}: ProjectThumbnailProps) {
	const [failedUrl, setFailedUrl] = useState<string | null>(null);

	const firstLetter = projectName.charAt(0).toUpperCase();

	if (iconUrl && failedUrl !== iconUrl) {
		return (
			<div
				className={cn(
					"relative size-6 rounded-sm overflow-hidden flex-shrink-0 bg-hover border border-foreground/10",
					className,
				)}
			>
				<img
					src={iconUrl}
					alt={`${projectName} icon`}
					className="size-full object-cover"
					onError={() => setFailedUrl(iconUrl)}
				/>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"size-6 rounded-sm flex items-center justify-center flex-shrink-0",
				"text-xs font-medium bg-hover text-fg-mute border border-foreground/10",
				className,
			)}
		>
			{firstLetter}
		</div>
	);
}
