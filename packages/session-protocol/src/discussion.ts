import { z } from "zod";
import type { SupersetAgent } from "./superset-tools";

export type DiscussionStatus = "running" | "completed" | "cancelled" | "failed";

export interface DiscussionParticipant {
	sessionId: string;
	agent: SupersetAgent;
	model: string | null;
	label: string;
}

export interface DiscussionContribution {
	sessionId: string;
	label: string;
	response: string;
}

export interface DiscussionRound {
	round: number;
	contributions: DiscussionContribution[];
}

export interface DiscussionRun {
	id: string;
	workspaceId: string;
	sourceSessionId: string;
	topic: string;
	status: DiscussionStatus;
	currentRound: number;
	maxRounds: number;
	participants: DiscussionParticipant[];
	rounds: DiscussionRound[];
	finalPositions: DiscussionContribution[];
	failureMessage: string | null;
	createdAt: number;
	updatedAt: number;
	completedAt: number | null;
}

export const listDiscussionRunsInput = z.object({
	workspaceId: z.string().min(1),
	limit: z.number().int().min(1).max(100).default(20),
});

export const stopDiscussionRunInput = z.object({
	runId: z.string().min(1).max(256),
});
