import { useTranslation } from "renderer/providers/I18nProvider";
import type { TaskDetailData } from "../../../../task-types";

export function TaskDeliveryRecords({
	operations,
}: Pick<TaskDetailData, "operations">) {
	const { t } = useTranslation();
	if (!operations.length) return null;
	return (
		<section className="space-y-2">
			<h3 className="font-medium">{t("agentTasks.deliveryRecord")}</h3>
			{operations.map((op) => (
				<details
					key={op.id}
					className="rounded-md border p-3"
					open={op.status === "failed" || op.status === "unknown"}
				>
					<summary className="cursor-pointer text-sm">
						<span
							className={
								op.status === "confirmed"
									? "text-success"
									: op.status === "failed" || op.status === "unknown"
										? "text-destructive"
										: "text-muted-foreground"
							}
						>
							{t(`agentTasks.operation.${op.status}`)}
						</span>{" "}
						· {op.kind} · <span className="font-mono">{op.target}</span>
					</summary>
					{op.commitOid && (
						<p className="mt-2 select-text cursor-text break-all font-mono text-xs">
							Commit: {op.commitOid}
						</p>
					)}
					<p className="mt-2 select-text cursor-text whitespace-pre-wrap text-xs">
						{op.paths.join("\n")}
					</p>
					{op.error && (
						<p
							role="alert"
							className="mt-2 select-text cursor-text text-sm text-destructive"
						>
							{op.error}
						</p>
					)}
					{op.output && (
						<pre className="mt-2 max-h-48 overflow-auto select-text cursor-text whitespace-pre-wrap bg-muted/50 p-2 text-xs">
							{op.output}
						</pre>
					)}
				</details>
			))}
		</section>
	);
}
