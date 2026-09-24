import type { TaskDelivery } from "@superset/shared/tasks";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { RadioGroup, RadioGroupItem } from "@superset/ui/radio-group";
import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";

const selectClass =
	"h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
export function TaskDeliveryFields({
	hostUrl,
	workspaceId,
	harness,
	goal,
	value,
	onChange,
}: {
	hostUrl: string;
	workspaceId: string;
	harness: string;
	goal: string;
	value: TaskDelivery;
	onChange: (value: TaskDelivery) => void;
}) {
	const { t } = useTranslation();
	const id = useId();
	const target = useQuery({
		queryKey: ["task-delivery-targets", hostUrl, workspaceId],
		enabled: Boolean(workspaceId) && harness === "pi-acp",
		queryFn: () =>
			getHostServiceClientByUrl(hostUrl).tasks.deliveryTargets.query({
				workspaceId,
			}),
		staleTime: 5000,
	});
	return (
		<section className="space-y-3 rounded-lg border p-3">
			<Label id={`${id}-delivery-label`}>{t("agentTasks.deliveryMode")}</Label>
			<RadioGroup
				aria-labelledby={`${id}-delivery-label`}
				data-testid="task-delivery-mode"
				value={value.mode}
				onValueChange={(mode) => {
					if (mode === "none") {
						onChange({ mode: "none" });
						return;
					}
					if (!target.data) return;
					const base = {
						branch: target.data.branch,
						message:
							value.mode === "none"
								? `fix(task): ${goal.split("\n")[0]?.slice(0, 90) || "complete requested change"}`
								: value.message,
					};
					if (mode === "commit") onChange({ mode, ...base });
					else {
						const remote =
							target.data.remotes.find((item) => item.remote === "origin") ??
							target.data.remotes[0];
						if (remote)
							onChange({
								mode: "push",
								...base,
								remote: remote.remote,
								remoteBranch: target.data.branch,
								targetHash: remote.targetHash,
							});
					}
				}}
			>
				{(["none", "commit", "push"] as const).map((mode) => (
					<div key={mode} className="flex items-center gap-2">
						<RadioGroupItem
							id={`${id}-${mode}`}
							data-testid={`task-delivery-${mode}`}
							value={mode}
							disabled={
								mode !== "none" &&
								(!target.data ||
									harness !== "pi-acp" ||
									(mode === "push" && !target.data.remotes.length))
							}
						/>
						<Label
							htmlFor={`${id}-${mode}`}
							className="cursor-pointer text-sm font-normal"
						>
							{t(`agentTasks.delivery.${mode}`)}
						</Label>
					</div>
				))}
			</RadioGroup>
			{harness !== "pi-acp" && (
				<p className="text-xs text-muted-foreground">
					{t("agentTasks.deliveryNotSupported")}
				</p>
			)}
			{target.error && (
				<p
					role="alert"
					className="select-text cursor-text text-xs text-destructive"
				>
					{target.error.message}
				</p>
			)}
			{value.mode !== "none" && (
				<>
					<p className="text-xs text-muted-foreground">
						{t("agentTasks.deliveryHint")}
					</p>
					<p className="text-sm">
						{t("agentTasks.deliveryBranch")}:{" "}
						<span className="font-mono select-text cursor-text">
							{value.branch}
						</span>
					</p>
					<Label htmlFor={`${id}-message`}>
						{t("agentTasks.deliveryMessage")}
					</Label>
					<Input
						id={`${id}-message`}
						data-testid="task-commit-message"
						value={value.message}
						maxLength={2000}
						onChange={(event) =>
							onChange({ ...value, message: event.target.value })
						}
					/>
				</>
			)}
			{value.mode === "push" && (
				<>
					<Label htmlFor={`${id}-remote`}>
						{t("agentTasks.deliveryRemote")}
					</Label>
					<select
						id={`${id}-remote`}
						className={selectClass}
						value={value.remote}
						onChange={(event) => {
							const remote = target.data?.remotes.find(
								(item) => item.remote === event.target.value,
							);
							if (remote)
								onChange({
									...value,
									remote: remote.remote,
									targetHash: remote.targetHash,
								});
						}}
					>
						{target.data?.remotes.map((remote) => (
							<option key={remote.remote} value={remote.remote}>
								{remote.remote} · {remote.url}
							</option>
						))}
					</select>
					<Label htmlFor={`${id}-branch`}>
						{t("agentTasks.deliveryRemoteBranch")}
					</Label>
					<Input
						id={`${id}-branch`}
						value={value.remoteBranch}
						onChange={(event) =>
							onChange({ ...value, remoteBranch: event.target.value })
						}
					/>
					<p className="text-xs text-warning">
						{t("agentTasks.deliveryPushHint")}
					</p>
				</>
			)}
		</section>
	);
}
