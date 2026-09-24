import type { SkillDetail, SkillScope } from "@superset/shared/skills";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { cn } from "@superset/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LuPlus, LuRefreshCw, LuSparkles } from "react-icons/lu";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { type SkillProject, scopeKey, skillKeys } from "../../skill-types";
import {
	GlobalSkillEditor,
	type GlobalSkillEditorValue,
} from "../GlobalSkillEditor";
import { SkillCopyDialog } from "../SkillCopyDialog/SkillCopyDialog";
import { SkillFiles } from "../SkillFiles/SkillFiles";
import { SkillScopePicker } from "../SkillScopePicker/SkillScopePicker";

type Selection =
	| { kind: "scope"; scope: SkillScope }
	| { kind: "select"; name: string }
	| { kind: "new" }
	| { kind: "reload" };
const toDraft = (skill: SkillDetail): GlobalSkillEditorValue => ({
	originalName: skill.name,
	revision: skill.revision,
	name: skill.name,
	description: skill.description,
	instructions: skill.instructions,
	invocation: skill.invocation,
});
export function SkillsLibraryPage({
	hostUrl,
	projects,
	onDirtyChange,
}: {
	hostUrl: string;
	projects: SkillProject[];
	onDirtyChange?(dirty: boolean): void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const api = getHostServiceClientByUrl(hostUrl).settings.skills;
	const [refreshing, setRefreshing] = useState(false);
	const [scope, setScope] = useState<SkillScope>({ kind: "global" });
	const [selected, setSelected] = useState<string | null>(null);
	const [creating, setCreating] = useState(false);
	const [draft, setDraft] = useState<GlobalSkillEditorValue | null>(null);
	const [saved, setSaved] = useState<GlobalSkillEditorValue | null>(null);
	const [query, setQuery] = useState("");
	const [pending, setPending] = useState<Selection | null>(null);
	const [removing, setRemoving] = useState(false);
	const [copying, setCopying] = useState(false);
	const list = useQuery({
		queryKey: skillKeys.list(hostUrl, scope),
		queryFn: () => api.list.query({ scope }),
	});
	const detail = useQuery({
		queryKey: skillKeys.detail(hostUrl, scope, selected),
		enabled: Boolean(selected),
		queryFn: () => {
			if (!selected) throw new Error("No skill selected");
			return api.get.query({ scope, name: selected });
		},
		refetchOnWindowFocus: false,
	});
	const dirty =
		draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);
	useEffect(() => {
		onDirtyChange?.(dirty);
		return () => onDirtyChange?.(false);
	}, [dirty, onDirtyChange]);
	useEffect(() => {
		if (!selected && !creating && list.data?.skills[0])
			setSelected(list.data.skills[0].name);
	}, [selected, creating, list.data]);
	useEffect(() => {
		if (!draft && detail.data && selected === detail.data.name) {
			const value = toDraft(detail.data);
			setDraft(value);
			setSaved(value);
		}
	}, [detail.data, draft, selected]);
	const save = useMutation({
		mutationFn: (value: GlobalSkillEditorValue) =>
			api.save.mutate({
				scope,
				previousName: value.originalName,
				expectedRevision: value.revision,
				skill: {
					name: value.name,
					description: value.description,
					instructions: value.instructions,
					invocation: value.invocation,
				},
			}),
		onSuccess: (data) => {
			queryClient.setQueryData(
				skillKeys.detail(hostUrl, scope, data.name),
				data,
			);
			void queryClient.invalidateQueries({
				queryKey: skillKeys.list(hostUrl, scope),
			});
			setSelected(data.name);
			setCreating(false);
			const value = toDraft(data);
			setDraft(value);
			setSaved(value);
		},
	});
	const remove = useMutation({
		mutationFn: () => {
			if (!detail.data) throw new Error("Load a skill before deleting");
			return api.remove.mutate({
				scope,
				name: detail.data.name,
				expectedRevision: detail.data.revision,
			});
		},
		onSuccess: async () => {
			const name = selected;
			queryClient.setQueryData(
				skillKeys.list(hostUrl, scope),
				(previous: Awaited<ReturnType<typeof api.list.query>> | undefined) =>
					previous
						? {
								...previous,
								skills: previous.skills.filter((skill) => skill.name !== name),
							}
						: previous,
			);
			setRemoving(false);
			setDraft(null);
			setSaved(null);
			setSelected(null);
			setCreating(false);
			if (name)
				queryClient.removeQueries({
					queryKey: skillKeys.detail(hostUrl, scope, name),
				});
			await queryClient.invalidateQueries({
				queryKey: skillKeys.list(hostUrl, scope),
			});
		},
	});
	const busy = save.isPending || remove.isPending || refreshing;
	const apply = (change: Selection) => {
		if (change.kind === "reload") {
			setPending(null);
			save.reset();
			remove.reset();
			setRefreshing(true);
			void (async () => {
				try {
					await list.refetch();
					if (selected) {
						const result = await detail.refetch();
						if (result.data) {
							const value = toDraft(result.data);
							setDraft(value);
							setSaved(value);
						}
					} else {
						setDraft(null);
						setSaved(null);
						setCreating(false);
					}
				} finally {
					setRefreshing(false);
				}
			})();
			return;
		}
		save.reset();
		remove.reset();
		setDraft(null);
		setSaved(null);
		setPending(null);
		setCopying(false);
		if (change.kind === "scope") {
			setScope(change.scope);
			setSelected(null);
			setCreating(false);
			setQuery("");
		} else if (change.kind === "select") {
			setSelected(change.name);
			setCreating(false);
		} else if (change.kind === "new") {
			setSelected(null);
			setCreating(true);
			setDraft({
				name: "",
				description: "",
				instructions: "",
				invocation: "auto",
				revision: null,
			});
		}
	};
	const request = (change: Selection) => {
		if (busy) return;
		if (dirty) setPending(change);
		else apply(change);
	};
	const visible = (list.data?.skills ?? []).filter((skill) =>
		`${skill.name} ${skill.description}`
			.toLocaleLowerCase()
			.includes(query.trim().toLocaleLowerCase()),
	);
	return (
		<div className="flex h-full min-h-0 w-full flex-col bg-background">
			<header className="flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4">
				<div>
					<h1 className="flex items-center gap-2 text-lg font-semibold">
						<LuSparkles className="size-5" />
						{t("skillsUi.title")}
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						{t("skillsUi.subtitle")}
					</p>
				</div>
				<div className="flex gap-2">
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={busy}
						onClick={() => request({ kind: "reload" })}
					>
						<LuRefreshCw className="size-4" />
						{t("skillsUi.refresh")}
					</Button>
					<Button
						type="button"
						size="sm"
						disabled={busy}
						onClick={() => request({ kind: "new" })}
					>
						<LuPlus className="size-4" />
						{t("skillsUi.new")}
					</Button>
				</div>
			</header>
			<div className="flex min-h-0 flex-1">
				<aside className="flex w-64 min-w-56 flex-col border-r bg-sidebar">
					<div className="space-y-3 border-b p-3">
						<SkillScopePicker
							scope={scope}
							projects={projects}
							disabled={busy}
							onChange={(value) => request({ kind: "scope", scope: value })}
						/>
						<Input
							aria-label={t("skillsUi.search")}
							placeholder={t("skillsUi.search")}
							value={query}
							onChange={(event) => setQuery(event.target.value)}
						/>
					</div>
					<div className="min-h-0 flex-1 overflow-auto p-2">
						{visible.map((skill) => (
							<button
								key={skill.name}
								type="button"
								disabled={busy}
								onClick={() => {
									if (selected !== skill.name || creating)
										request({ kind: "select", name: skill.name });
								}}
								className={cn(
									"mb-1 block w-full rounded-md p-3 text-left hover:bg-hover",
									selected === skill.name && !creating && "bg-accent-tint",
								)}
							>
								<strong className="block truncate font-mono text-sm">
									{skill.name}
								</strong>
								<span className="mt-1 line-clamp-2 text-xs text-muted-foreground">
									{skill.description}
								</span>
								<span className="mt-2 block text-[10px] text-muted-foreground">
									{t(
										skill.invocation === "manual"
											? "skillsUi.manualTag"
											: "skillsUi.auto",
									)}
								</span>
							</button>
						))}
						{!list.data && list.isPending && (
							<p className="p-3 text-sm text-muted-foreground">
								{t("skillsUi.loading")}
							</p>
						)}
						{list.data && !visible.length && (
							<p className="p-3 text-sm text-muted-foreground">
								{t(query ? "skillsUi.noMatch" : "skillsUi.empty")}
							</p>
						)}
					</div>
					<footer className="border-t p-3 text-xs text-muted-foreground">
						<p>{t("skillsUi.bodyOnDemand")}</p>
						<p className="mt-2 select-text cursor-text break-all font-mono">
							{list.data?.directory}
						</p>
					</footer>
				</aside>
				<main className="min-w-0 flex-1 overflow-auto">
					<div className="mx-auto max-w-4xl space-y-5 p-6">
						<p className="text-xs text-muted-foreground">
							{t("skillsUi.scopeHint")}
						</p>
						{[list.error, detail.error, save.error, remove.error]
							.filter(Boolean)
							.map((error, index) => (
								<p
									key={`${index}:${error?.message}`}
									role="alert"
									className="select-text cursor-text rounded border border-destructive/30 p-3 text-sm text-destructive"
								>
									{error?.message}
								</p>
							))}
						{Boolean(list.data?.diagnostics.length) && (
							<details className="rounded border p-3">
								<summary className="cursor-pointer text-sm text-warning">
									{t("skillsUi.errors")} ({list.data?.diagnostics.length})
								</summary>
								{list.data?.diagnostics.map((item) => (
									<p
										key={item.path}
										className="mt-2 select-text cursor-text break-all text-xs"
									>
										{item.path}: {item.message}
									</p>
								))}
							</details>
						)}
						{draft ? (
							<>
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="min-w-0 flex-1">
										<p className="text-xs text-muted-foreground">
											{t(
												scope.kind === "global"
													? "skillsUi.global"
													: "skillsUi.project",
											)}
										</p>
										{detail.data && !creating && (
											<p className="mt-1 select-text cursor-text break-all font-mono text-xs">
												{detail.data.filePath}
											</p>
										)}
									</div>
									{detail.data && !creating && (
										<div className="flex gap-2">
											<Button
												size="sm"
												variant="outline"
												disabled={dirty || busy}
												onClick={() => setCopying(true)}
											>
												{t("skillsUi.copy")}
											</Button>
											<Button
												size="sm"
												variant="ghost"
												disabled={busy}
												onClick={() => setRemoving(true)}
											>
												{t("skillsUi.remove")}
											</Button>
										</div>
									)}
								</div>
								<GlobalSkillEditor
									key={`${scopeKey(scope)}:${selected ?? "new"}`}
									value={draft}
									isSaving={busy}
									isDirty={dirty}
									onChange={setDraft}
									onSave={() => save.mutate(draft)}
								/>
								{detail.data && !creating && (
									<SkillFiles
										key={`${scopeKey(scope)}:${selected}:${detail.data.revision}`}
										hostUrl={hostUrl}
										scope={scope}
										skill={detail.data}
									/>
								)}
							</>
						) : (
							<p className="py-10 text-center text-sm text-muted-foreground">
								{t(detail.isFetching ? "skillsUi.loading" : "skillsUi.select")}
							</p>
						)}
						<p className="text-xs text-muted-foreground">
							{t("skillsUi.lifetime")}
						</p>
						<p className="text-xs text-muted-foreground">
							{t("skillsUi.locationHint")}
						</p>
						{scope.kind === "project" && (
							<p className="text-xs text-muted-foreground">
								{t("skillsUi.projectTrust")}
							</p>
						)}
					</div>
				</main>
			</div>
			<AlertDialog
				open={Boolean(pending)}
				onOpenChange={(open) => {
					if (!open) setPending(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("skillsUi.discardTitle")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("skillsUi.discardHint")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("skillsUi.keep")}</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (pending) apply(pending);
							}}
						>
							{t("skillsUi.discard")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
			<AlertDialog
				open={removing}
				onOpenChange={(open) => {
					if (!remove.isPending) setRemoving(open);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("skillsUi.removeTitle")}</AlertDialogTitle>
						<AlertDialogDescription>
							{selected} · {t("skillsUi.removeHint")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={remove.isPending}>
							{t("skillsUi.cancel")}
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={remove.isPending}
							onClick={(event) => {
								event.preventDefault();
								remove.mutate();
							}}
						>
							{t("skillsUi.remove")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
			{copying && detail.data && (
				<SkillCopyDialog
					hostUrl={hostUrl}
					scope={scope}
					skill={detail.data}
					projects={projects}
					onClose={() => setCopying(false)}
				/>
			)}
		</div>
	);
}
