import { describe, expect, test } from "bun:test";
import { canCreateTodo } from "./canCreateTodo";

const automaticTodo = {
	title: "Review inbox",
	hasDueDate: true,
	mode: "auto" as const,
	hasAgent: true,
	hasSelectedProject: true,
	isTemporaryTarget: false,
	hasHost: true,
	hasWorkspace: true,
	prompt: "Review the inbox",
	isPending: false,
};

describe("canCreateTodo", () => {
	test("allows the temporary target without a recent-project entry or workspace", () => {
		expect(
			canCreateTodo({
				...automaticTodo,
				hasSelectedProject: false,
				isTemporaryTarget: true,
				hasWorkspace: false,
			}),
		).toBe(true);
	});

	test("blocks submission while the temporary target is provisioning", () => {
		expect(canCreateTodo({ ...automaticTodo, isPending: true })).toBe(false);
	});
});
