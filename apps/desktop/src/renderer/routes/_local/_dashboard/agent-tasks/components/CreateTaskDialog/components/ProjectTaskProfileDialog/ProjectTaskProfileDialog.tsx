import {
	type TaskProfile,
	type TaskProfileSnapshot,
	taskProfileSchema,
} from "@superset/shared/tasks";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { Textarea } from "@superset/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { managedTaskKeys } from "../../../../task-types";

export function ProjectTaskProfileDialog({
	hostUrl,
	projectId,
	onClose,
}: {
	hostUrl: string;
	projectId: string;
	onClose(): void;
}) {
	const { t } = useTranslation();
	const id = useId();
	const queryClient = useQueryClient();
	const client = getHostServiceClientByUrl(hostUrl);
	const query = useQuery({
		queryKey: [...managedTaskKeys.all(hostUrl), "profile", projectId],
		queryFn: () => client.tasks.profile.query({ projectId }),
	});
	// Preserve the draft and base revision across cache refreshes; never overwrite edits.
	const [draft, setDraft] = useState<TaskProfileSnapshot | null>(null);
	const current = draft ?? query.data;
	const edit = (transform: (config: TaskProfile) => TaskProfile) => {
		if (current) setDraft({ ...current, config: transform(current.config) });
	};
	const discover = useMutation({
		mutationFn: () => client.tasks.discoverChecks.query({ projectId }),
	});
	const save = useMutation({
		mutationFn: () => {
			if (!current) throw new Error(t("agentTasks.loading"));
			return client.tasks.saveProfile.mutate({
				projectId,
				expectedRevision: current.revision,
				config: taskProfileSchema.parse({
					...current.config,
					checks: current.config.checks.map((check) => ({
						...check,
						paths: check.paths.filter(Boolean),
					})),
				}),
			});
		},
		onSuccess: (value) => {
			queryClient.setQueryData(
				[...managedTaskKeys.all(hostUrl), "profile", projectId],
				value,
			);
			onClose();
		},
	});
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !save.isPending) onClose();
			}}
		>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>{t("agentTasks.profile")}</DialogTitle>
					<DialogDescription>{t("agentTasks.profileHint")}</DialogDescription>
				</DialogHeader>
				{query.error && (
					<p role="alert" className="select-text cursor-text text-destructive">
						{query.error.message}
					</p>
				)}
				{current ? (
					<form
						className="space-y-4"
						onSubmit={(event) => {
							event.preventDefault();
							save.mutate();
						}}
					>
						<div className="space-y-2">
							<Label htmlFor={`${id}-instructions`}>
								{t("agentTasks.projectInstructions")}
							</Label>
							<Textarea
								id={`${id}-instructions`}
								value={current.config.instructions}
								onChange={(event) =>
									edit((config) => ({
										...config,
										instructions: event.target.value,
									}))
								}
								maxLength={10000}
							/>
							<p className="text-xs text-muted-foreground">
								{t("skillsUi.profileBoundary")}
							</p>
						</div>
						{current.config.checks.map((check, index) => (
							<fieldset
								key={check.id}
								className="space-y-3 rounded-lg border p-3"
							>
								<legend className="px-1 text-xs text-muted-foreground">
									{check.id}
								</legend>
								<div className="grid grid-cols-[1fr_auto] gap-2">
									<div className="space-y-1">
										<Label htmlFor={`${id}-${check.id}-name`}>
											{t("agentTasks.checkName")}
										</Label>
										<Input
											id={`${id}-${check.id}-name`}
											value={check.name}
											onChange={(event) =>
												edit((config) => ({
													...config,
													checks: config.checks.map((item, i) =>
														i === index
															? { ...item, name: event.target.value }
															: item,
													),
												}))
											}
										/>
									</div>
									<Button
										type="button"
										size="sm"
										variant="ghost"
										onClick={() =>
											edit((config) => ({
												...config,
												checks: config.checks.filter((_, i) => i !== index),
											}))
										}
									>
										{t("agentTasks.removeCheck")}
									</Button>
								</div>
								<div className="space-y-1">
									<Label htmlFor={`${id}-${check.id}-command`}>
										{t("agentTasks.checkCommand")}
									</Label>
									<Input
										id={`${id}-${check.id}-command`}
										className="font-mono text-xs"
										value={check.command}
										onChange={(event) =>
											edit((config) => ({
												...config,
												checks: config.checks.map((item, i) =>
													i === index
														? { ...item, command: event.target.value }
														: item,
												),
											}))
										}
									/>
								</div>
								<div className="space-y-1">
									<Label htmlFor={`${id}-${check.id}-paths`}>
										{t("agentTasks.checkPaths")}
									</Label>
									<Input
										id={`${id}-${check.id}-paths`}
										value={check.paths.join(", ")}
										placeholder="src/**/*.ts, packages/shared/**"
										onChange={(event) =>
											edit((config) => ({
												...config,
												checks: config.checks.map((item, i) =>
													i === index
														? {
																...item,
																paths: event.target.value
																	.split(",")
																	.map((path) => path.trim()),
															}
														: item,
												),
											}))
										}
									/>
									<p className="text-xs text-muted-foreground">
										{t("agentTasks.checkPathsHint")}
									</p>
								</div>
								<div className="flex items-center gap-3">
									<Label htmlFor={`${id}-${check.id}-timeout`}>
										{t("agentTasks.checkTimeout")}
									</Label>
									<Input
										id={`${id}-${check.id}-timeout`}
										className="w-24"
										type="number"
										min={1}
										max={600}
										value={check.timeoutMs / 1000}
										onChange={(event) =>
											edit((config) => ({
												...config,
												checks: config.checks.map((item, i) =>
													i === index
														? {
																...item,
																timeoutMs: Number(event.target.value) * 1000,
															}
														: item,
												),
											}))
										}
									/>
								</div>
								<label className="flex items-start gap-2 text-xs">
									<input
										type="checkbox"
										checked={Boolean(check.reuse)}
										onChange={(event) =>
											edit((config) => ({
												...config,
												checks: config.checks.map((item, i) =>
													i === index
														? { ...item, reuse: event.target.checked }
														: item,
												),
											}))
										}
									/>
									{t("agentTasks.reuseCheck")}
								</label>
							</fieldset>
						))}
						<div className="flex gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={() =>
									edit((config) => ({
										...config,
										checks: [
											...config.checks,
											{
												id: `check-${crypto.randomUUID().slice(0, 8)}`,
												name: "",
												command: "",
												paths: [],
												timeoutMs: 120000,
											},
										],
									}))
								}
								disabled={current.config.checks.length >= 30}
							>
								{t("agentTasks.addCheck")}
							</Button>
							<Button
								type="button"
								variant="outline"
								disabled={discover.isPending}
								onClick={() => discover.mutate()}
							>
								{t("agentTasks.discoverChecks")}
							</Button>
						</div>
						{discover.data && (
							<div className="space-y-2 rounded-md bg-muted/40 p-3">
								<p className="text-xs text-muted-foreground">
									{t("agentTasks.discoverHint")}
								</p>
								{!discover.data.suggestions.length && (
									<p className="text-sm">{t("agentTasks.noSuggestions")}</p>
								)}
								{discover.data.suggestions.map((suggestion) => (
									<div
										key={suggestion.id}
										className="flex items-center justify-between gap-3"
									>
										<div className="min-w-0">
											<p className="font-mono text-xs">{suggestion.command}</p>
											<p className="select-text cursor-text break-all text-xs text-muted-foreground">
												{suggestion.script}
											</p>
										</div>
										<Button
											size="sm"
											type="button"
											variant="outline"
											disabled={
												current.config.checks.some(
													(check) => check.id === suggestion.id,
												) || current.config.checks.length >= 30
											}
											onClick={() =>
												edit((config) => ({
													...config,
													checks: [
														...config.checks,
														{
															id: suggestion.id,
															name: suggestion.name,
															command: suggestion.command,
															timeoutMs: suggestion.timeoutMs,
															paths: [],
														},
													],
												}))
											}
										>
											{t("agentTasks.addSuggestion")}
										</Button>
									</div>
								))}
							</div>
						)}
						<label className="flex items-start gap-2 text-sm">
							<input
								type="checkbox"
								checked={current.config.completion === "checks"}
								onChange={(event) =>
									edit((config) => ({
										...config,
										completion: event.target.checked ? "checks" : "review",
									}))
								}
							/>
							{t("agentTasks.profileAuto")}
						</label>
						{(save.error || discover.error) && (
							<p
								role="alert"
								className="select-text cursor-text text-sm text-destructive"
							>
								{save.error?.message || discover.error?.message}
							</p>
						)}
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={onClose}
								disabled={save.isPending}
							>
								{t("agentTasks.close")}
							</Button>
							<Button type="submit" disabled={save.isPending}>
								{t("agentTasks.saveProfile")}
							</Button>
						</DialogFooter>
					</form>
				) : (
					<p>{t("agentTasks.loading")}</p>
				)}
			</DialogContent>
		</Dialog>
	);
}
