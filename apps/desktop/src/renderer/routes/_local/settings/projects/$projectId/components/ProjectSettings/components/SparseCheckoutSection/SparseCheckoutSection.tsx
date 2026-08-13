import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	formatSparseCheckoutPaths,
	validateSparseCheckoutPaths,
} from "./sparseCheckoutPaths";

interface SparseCheckoutSectionProps {
	projectId: string;
	hostUrl: string;
	paths: string[];
	onChanged: () => void;
}

export function SparseCheckoutSection({
	projectId,
	hostUrl,
	paths,
	onChanged,
}: SparseCheckoutSectionProps) {
	const persistedValue = useMemo(
		() => formatSparseCheckoutPaths(paths),
		[paths],
	);
	const [value, setValue] = useState(persistedValue);
	useEffect(() => setValue(persistedValue), [persistedValue]);

	const validation = useMemo(() => validateSparseCheckoutPaths(value), [value]);
	const hasChanges = value !== persistedValue;
	const save = useMutation({
		mutationFn: (nextPaths: string[]) =>
			getHostServiceClientByUrl(hostUrl).project.setSparseCheckoutPaths.mutate({
				projectId,
				paths: nextPaths,
			}),
		onSuccess: () => {
			toast.success("Sparse checkout paths updated");
			onChanged();
		},
		onError: (error) =>
			toast.error(error instanceof Error ? error.message : String(error)),
	});

	return (
		<div className="space-y-3">
			<p className="text-xs text-fg-mute">
				These paths are applied only to new worktrees. Existing worktrees are
				unchanged.
			</p>
			<Textarea
				value={value}
				onChange={(event) => setValue(event.target.value)}
				placeholder={"apps\npackages/ui"}
				rows={5}
				className="font-mono text-sm"
				aria-label="Sparse checkout paths"
				disabled={save.isPending}
			/>
			{validation.error ? (
				<p className="text-xs text-destructive select-text cursor-text">
					{validation.error}
				</p>
			) : null}
			<div className="flex items-center gap-2">
				<Button
					type="button"
					size="sm"
					disabled={!hasChanges || !!validation.error || save.isPending}
					onClick={() => save.mutate(validation.paths)}
				>
					Save
				</Button>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={!hasChanges || save.isPending}
					onClick={() => setValue(persistedValue)}
				>
					Reset
				</Button>
			</div>
		</div>
	);
}
