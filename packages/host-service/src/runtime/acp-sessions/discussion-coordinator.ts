import type {
	DiscussionContribution,
	DiscussionParticipant,
	DiscussionRound,
	DiscussionRun,
	HarnessKind,
	SupersetAgent,
} from "@superset/session-protocol";
import type { AcpSessionManager } from "./acp-sessions";
import type { DiscussionRunPersistence } from "./persistence";

const MAX_EXCHANGED_RESPONSE_LENGTH = 30_000;

export interface DiscussionCoordinatorOptions {
	manager: AcpSessionManager;
	persistence?: DiscussionRunPersistence;
	onChanged?: (run: DiscussionRun) => void;
}

export interface StartDiscussionInput {
	id: string;
	workspaceId: string;
	sourceSessionId: string;
	topic: string;
	participants: Array<{
		sessionId: string;
		agent: SupersetAgent;
		model?: string;
		label: string;
		harness: HarnessKind;
	}>;
	maxRounds: number;
}

function cloneRun(run: DiscussionRun): DiscussionRun {
	return {
		...run,
		participants: run.participants.map((participant) => ({ ...participant })),
		rounds: run.rounds.map((round) => ({
			...round,
			contributions: round.contributions.map((contribution) => ({
				...contribution,
			})),
		})),
		finalPositions: run.finalPositions.map((position) => ({ ...position })),
	};
}

function boundedText(text: string): string {
	return text.length <= MAX_EXCHANGED_RESPONSE_LENGTH
		? text
		: `${text.slice(0, MAX_EXCHANGED_RESPONSE_LENGTH)}\n\n[Response truncated for peer exchange]`;
}

function responseFromLatestTurn(
	manager: AcpSessionManager,
	sessionId: string,
): string {
	const turn = manager.getTranscript({ sessionId, limit: 1 }).turns.at(-1);
	if (!turn) return "";
	const blocks =
		turn.assistantMessage ??
		turn.items.flatMap((item) => {
			if (
				item.frame.kind === "update" &&
				item.frame.update.sessionUpdate === "agent_message_chunk"
			) {
				return [item.frame.update.content];
			}
			return [];
		});
	return boundedText(
		blocks
			.filter((block) => block.type === "text")
			.map((block) => block.text)
			.join("")
			.trim(),
	);
}

function initialPrompt(topic: string): string {
	return `You are one of two equal participants in a bounded discussion. Neither participant is a reviewer, leader, or final authority.\n\nTopic:\n${topic}\n\nState your independent position and reasoning. Be concise. Do not invoke other agents or discussion tools; answer directly in this conversation.`;
}

function responsePrompt(input: {
	topic: string;
	round: number;
	maxRounds: number;
	own: string;
	peer: string;
}): string {
	const ending =
		input.round === input.maxRounds
			? "This is the final round. State your final position, common ground, and remaining disagreements."
			: "Identify the most useful points to resolve in the next round.";
	return `You are one of two equal participants in round ${input.round} of a bounded discussion. Neither participant is a reviewer, leader, or final authority.\n\nTopic:\n${input.topic}\n\nYour previous position:\n${boundedText(input.own)}\n\nThe other participant's previous position:\n${boundedText(input.peer)}\n\nRespond to the other position and update or retain your own position. ${ending} Be concise. Do not invoke other agents or discussion tools; answer directly in this conversation.`;
}

export class DiscussionCoordinator {
	private readonly manager: AcpSessionManager;
	private readonly persistence: DiscussionCoordinatorOptions["persistence"];
	private readonly onChanged: DiscussionCoordinatorOptions["onChanged"];
	private readonly runs = new Map<string, DiscussionRun>();

	constructor(options: DiscussionCoordinatorOptions) {
		this.manager = options.manager;
		this.persistence = options.persistence;
		this.onChanged = options.onChanged;
		for (const run of options.persistence?.listActiveDiscussionRuns() ?? []) {
			const interrupted: DiscussionRun = {
				...run,
				status: "failed",
				failureMessage:
					"Discussion was interrupted when the ACP daemon restarted. Start a new discussion to continue.",
				completedAt: Date.now(),
				updatedAt: Date.now(),
			};
			this.runs.set(interrupted.id, interrupted);
			this.persistence?.upsertDiscussionRun(interrupted);
		}
	}

	list(workspaceId: string, limit = 20): DiscussionRun[] {
		const persisted = this.persistence?.listDiscussionRuns(workspaceId, limit);
		if (persisted) return persisted.map(cloneRun);
		return [...this.runs.values()]
			.filter((run) => run.workspaceId === workspaceId)
			.sort((left, right) => right.createdAt - left.createdAt)
			.slice(0, limit)
			.map(cloneRun);
	}

	get(runId: string): DiscussionRun | null {
		const run = this.runs.get(runId);
		return run ? cloneRun(run) : null;
	}

	async start(input: StartDiscussionInput): Promise<DiscussionRun> {
		const now = Date.now();
		const participants: DiscussionParticipant[] = input.participants.map(
			(participant) => ({
				sessionId: participant.sessionId,
				agent: participant.agent,
				model: participant.model ?? null,
				label: participant.label,
			}),
		);
		const run: DiscussionRun = {
			id: input.id,
			workspaceId: input.workspaceId,
			sourceSessionId: input.sourceSessionId,
			topic: input.topic,
			status: "running",
			currentRound: 1,
			maxRounds: input.maxRounds,
			participants,
			rounds: [],
			finalPositions: [],
			failureMessage: null,
			createdAt: now,
			updatedAt: now,
			completedAt: null,
		};
		this.runs.set(run.id, run);
		this.emit(run);

		try {
			for (let round = 1; round <= run.maxRounds; round += 1) {
				if (run.status !== "running") break;
				run.currentRound = round;
				run.updatedAt = Date.now();
				this.emit(run);
				const previous = run.rounds.at(-1)?.contributions;
				const contributions = await Promise.all(
					participants.map(async (participant, index) => {
						const prompt =
							round === 1
								? initialPrompt(run.topic)
								: responsePrompt({
										topic: run.topic,
										round,
										maxRounds: run.maxRounds,
										own: previous?.[index]?.response ?? "",
										peer: previous?.[index === 0 ? 1 : 0]?.response ?? "",
									});
						const admission = this.manager.prompt({
							sessionId: participant.sessionId,
							prompt: [{ type: "text", text: prompt }],
						});
						await admission.turn;
						const response = responseFromLatestTurn(
							this.manager,
							participant.sessionId,
						);
						if (!response) {
							throw new Error(
								`${participant.label} returned no discussion response`,
							);
						}
						return {
							sessionId: participant.sessionId,
							label: participant.label,
							response,
						} satisfies DiscussionContribution;
					}),
				);
				if (run.status !== "running") break;
				run.rounds.push({ round, contributions } satisfies DiscussionRound);
				run.updatedAt = Date.now();
				this.emit(run);
			}
			if (run.status === "running") {
				run.status = "completed";
				run.finalPositions = run.rounds.at(-1)?.contributions ?? [];
				run.completedAt = Date.now();
				run.updatedAt = run.completedAt;
				this.emit(run);
			}
		} catch (error) {
			if (run.status !== "cancelled") {
				run.status = "failed";
				run.failureMessage =
					error instanceof Error ? error.message : String(error);
				run.completedAt = Date.now();
				run.updatedAt = run.completedAt;
				this.emit(run);
			}
		} finally {
			await Promise.allSettled(
				run.participants.map((participant) =>
					this.manager.close({ sessionId: participant.sessionId }),
				),
			);
		}
		return cloneRun(run);
	}

	async stop(runId: string): Promise<DiscussionRun> {
		const run = this.runs.get(runId);
		if (!run) throw new Error(`Discussion run not found: ${runId}`);
		if (run.status !== "running") return cloneRun(run);
		run.status = "cancelled";
		run.completedAt = Date.now();
		run.updatedAt = run.completedAt;
		await Promise.allSettled(
			run.participants.map((participant) =>
				this.manager.cancel({ sessionId: participant.sessionId }),
			),
		);
		this.emit(run);
		return cloneRun(run);
	}

	private emit(run: DiscussionRun): void {
		this.persistence?.upsertDiscussionRun(run);
		this.onChanged?.(cloneRun(run));
	}
}
