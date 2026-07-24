import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { Check, GitBranch, Loader2, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import {
	type MessageKey,
	useTranslation,
} from "renderer/providers/I18nProvider";
import "./WorkspaceCreatingState.css";

interface Step {
	id: string;
	labelKey: MessageKey;
	/** Cumulative seconds at which this step is considered complete. */
	doneAt: number;
}

// Mirrors the v1 init step order in shared/types/workspace-init.ts so the
// labels feel real — v2 workspaces.create runs the same git work server-side
// without streaming progress events, so timings here are estimates.
const STEPS: readonly Step[] = [
	{ id: "preparing", labelKey: "v2Workspace.creating.preparing", doneAt: 1 },
	{ id: "syncing", labelKey: "v2Workspace.creating.syncing", doneAt: 4 },
	{ id: "verifying", labelKey: "v2Workspace.creating.verifying", doneAt: 5 },
	{ id: "fetching", labelKey: "v2Workspace.creating.fetching", doneAt: 15 },
	{
		id: "creating_worktree",
		labelKey: "v2Workspace.creating.creatingWorktree",
		doneAt: 18,
	},
	{
		id: "copying_config",
		labelKey: "v2Workspace.creating.copyingConfig",
		doneAt: 20,
	},
	{ id: "finalizing", labelKey: "v2Workspace.creating.finalizing", doneAt: 23 },
] as const;

const TOTAL_SECONDS = STEPS[STEPS.length - 1].doneAt;
// Cap synthetic progress so the bar never claims completion before the real
// workspaces.create mutation resolves.
const PROGRESS_CAP = 0.94;
// Past the typical budget — offer a window reload as an escape hatch in
// case the renderer state has drifted from the real workspace row.
const STUCK_AFTER_SECONDS = 30;

interface WorkspaceCreatingStateProps {
	name?: string;
	branch?: string;
	startedAt?: number;
}

export function WorkspaceCreatingState({
	name,
	branch,
	startedAt,
}: WorkspaceCreatingStateProps) {
	const elapsed = useElapsedSeconds(startedAt);
	const activeIndex = getActiveIndex(elapsed);
	const progress = Math.min(elapsed / TOTAL_SECONDS, PROGRESS_CAP);
	const stuck = elapsed >= STUCK_AFTER_SECONDS;
	const { t } = useTranslation();

	return (
		<div className="flex h-full w-full items-center justify-center p-6">
			<div className="flex w-full max-w-sm flex-col items-start gap-5">
				<Loader2
					className="size-5 animate-spin text-muted-foreground"
					strokeWidth={1.5}
					aria-hidden="true"
				/>

				<div className="flex flex-col gap-1.5">
					<h1 className="text-[15px] font-medium tracking-tight text-foreground">
						{t("v2Workspace.creating.title")}
					</h1>
					<p className="truncate text-[13px] leading-relaxed text-muted-foreground">
						{name || t("v2Workspace.creating.untitled")}
					</p>
				</div>

				{branch && (
					<div className="flex w-full items-center gap-2">
						<GitBranch
							className="size-3 shrink-0 text-muted-foreground/80"
							strokeWidth={2}
							aria-hidden="true"
						/>
						<code className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
							{branch}
						</code>
					</div>
				)}

				<ul className="flex w-full flex-col gap-2">
					{STEPS.map((step, i) => {
						const state: StepState =
							i < activeIndex
								? "done"
								: i === activeIndex
									? "active"
									: "pending";
						return (
							<StepRow key={step.id} label={t(step.labelKey)} state={state} />
						);
					})}
				</ul>

				<div className="flex w-full flex-col gap-2">
					<div className="wcs-bar-track">
						<div
							className="wcs-bar-fill"
							style={{ width: `${progress * 100}%` }}
						/>
						<div className="wcs-bar-sweep" />
					</div>
					<div className="flex items-center justify-between text-[11px] text-muted-foreground/80">
						<span className="font-mono tabular-nums">
							{formatElapsed(elapsed)}
						</span>
						<span>
							{t("v2Workspace.creating.typicalTime", {
								seconds: TOTAL_SECONDS,
							})}
						</span>
					</div>
				</div>

				{stuck && (
					<div className="flex w-full flex-col gap-2 border-t border-border/60 pt-4 animate-in fade-in slide-in-from-bottom-1 duration-500">
						<p className="select-text cursor-text text-[12px] leading-relaxed text-muted-foreground">
							{t("v2Workspace.creating.takingLonger")}
						</p>
						<Button
							size="sm"
							variant="outline"
							className="h-7 w-fit gap-1.5 px-2 text-[12px] font-medium"
							onClick={() => window.location.reload()}
						>
							<RotateCw
								className="size-3.5"
								strokeWidth={2}
								aria-hidden="true"
							/>
							{t("v2Workspace.creating.reloadWindow")}
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}

type StepState = "done" | "active" | "pending";

function StepRow({ label, state }: { label: string; state: StepState }) {
	return (
		<li
			className={cn(
				"flex items-center gap-2.5 text-[13px] leading-tight transition-colors duration-300",
				state === "done" && "text-foreground/80",
				state === "active" && "text-foreground",
				state === "pending" && "text-muted-foreground/55",
			)}
		>
			<StepIcon state={state} />
			<span>{label}</span>
		</li>
	);
}

function StepIcon({ state }: { state: StepState }) {
	if (state === "done") {
		return (
			<span className="grid size-3.5 shrink-0 place-items-center rounded-full bg-foreground/85 text-background">
				<Check className="size-2" strokeWidth={3.5} />
			</span>
		);
	}
	if (state === "active") {
		return (
			<span className="relative grid size-3.5 shrink-0 place-items-center">
				<span className="wcs-active-ring absolute inset-0 rounded-full border border-foreground/40" />
				<span className="size-1.5 rounded-full bg-foreground/85" />
			</span>
		);
	}
	return (
		<span className="grid size-3.5 shrink-0 place-items-center">
			<span className="size-1.5 rounded-full bg-muted-foreground/35" />
		</span>
	);
}

function getActiveIndex(elapsed: number): number {
	for (let i = 0; i < STEPS.length; i++) {
		if (elapsed < STEPS[i].doneAt) return i;
	}
	// Past the synthetic budget — keep the last step active until real completion.
	return STEPS.length - 1;
}

function formatElapsed(seconds: number): string {
	const total = Math.max(0, Math.floor(seconds));
	const m = Math.floor(total / 60);
	const s = total % 60;
	return `${m}:${s.toString().padStart(2, "0")}`;
}

function useElapsedSeconds(startedAt: number | undefined): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const id = window.setInterval(() => setNow(Date.now()), 250);
		return () => window.clearInterval(id);
	}, []);
	if (!startedAt) return 0;
	return Math.max(0, (now - startedAt) / 1000);
}
