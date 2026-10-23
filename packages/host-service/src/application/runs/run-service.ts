import {
	type ExecutionRun,
	type RunKind,
	type RunReference,
	runKey,
} from "@superset/host-contract/runs";
import { HostOperationError } from "../errors";

export interface RunSource {
	kind: RunKind;
	list(workspaceId: string, limit: number): Promise<ExecutionRun[]>;
	get(id: string): Promise<ExecutionRun | null>;
	stop?(id: string, action: "cancel" | "pause"): Promise<void>;
}

/** No process-local lifecycle cache: reconstruct from the owning store on every
 * read, including after reconnect/restart. Owners retain locks and completion rules. */
export class RunService {
	constructor(private readonly sources: readonly RunSource[]) {}
	private source(kind: RunKind) {
		const source = this.sources.find((entry) => entry.kind === kind);
		if (!source)
			throw new HostOperationError({
				code: "PRECONDITION_FAILED",
				message: `${kind} runs are unavailable on this Host`,
			});
		return source;
	}
	async get(ref: RunReference): Promise<ExecutionRun> {
		const run = await this.source(ref.kind).get(ref.id);
		if (!run)
			throw new HostOperationError({
				code: "NOT_FOUND",
				message: `Run not found: ${runKey(ref)}`,
			});
		return sourceCapabilities(run, this.source(ref.kind));
	}
	async list(input: {
		workspaceId: string;
		kinds?: RunKind[];
		limit: number;
	}): Promise<ExecutionRun[]> {
		const sources = this.sources.filter(
			(source) => !input.kinds || input.kinds.includes(source.kind),
		);
		const pages = await Promise.all(
			sources.map(async (source) =>
				(await source.list(input.workspaceId, input.limit)).map((run) =>
					sourceCapabilities(run, source),
				),
			),
		);
		return pages
			.flat()
			.sort((a, b) => b.createdAt - a.createdAt || a.key.localeCompare(b.key))
			.slice(0, input.limit);
	}
	async stop(
		ref: RunReference,
		action: "cancel" | "pause",
	): Promise<ExecutionRun> {
		const source = this.source(ref.kind);
		const run = await this.get(ref);
		// A terminal run no longer owns execution. Never cancel a later turn on
		// its reused session, even if that session is currently running.
		if (run.terminal || (action === "pause" && run.status === "paused"))
			return run;
		if (!run.capabilities[action] || !source.stop)
			throw new HostOperationError({
				code: "PRECONDITION_FAILED",
				message: `${action} is unavailable for ${runKey(ref)}`,
			});
		await source.stop(ref.id, action);
		return this.get(ref);
	}
}

function sourceCapabilities(
	run: ExecutionRun,
	source: RunSource,
): ExecutionRun {
	return source.stop
		? run
		: { ...run, capabilities: { cancel: false, pause: false } };
}
