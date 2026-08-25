import { describe, expect, it } from "bun:test";
import {
	filterSlashCommands,
	getSlashCommandSelectionBehavior,
	parseSlashCommandArgumentOptions,
	resolveCommandAction,
	resolveSlashCommandArgumentOptions,
	type SlashCommand,
	sortSlashCommandMatches,
} from "./useSlashCommands";

function createCommand(
	command: Partial<SlashCommand> & { name: string },
): SlashCommand {
	return {
		name: command.name,
		aliases: command.aliases ?? [],
		description: command.description ?? "",
		argumentHint: command.argumentHint ?? "",
		kind: command.kind ?? "custom",
		source: command.source ?? "project",
		action: command.action,
	};
}

describe("resolveCommandAction", () => {
	it("keeps composer open for commands with optional hints", () => {
		const action = resolveCommandAction(
			createCommand({ name: "plan", argumentHint: "[<goal>]" }),
		);
		expect(action).toEqual({ text: "/plan ", shouldSend: false });
	});

	it("keeps composer open for required argument hints", () => {
		const action = resolveCommandAction(
			createCommand({ name: "grep", argumentHint: "<pattern>" }),
		);
		expect(action).toEqual({ text: "/grep ", shouldSend: false });
	});

	it("sends immediately when no argument hint exists", () => {
		const action = resolveCommandAction(createCommand({ name: "new" }));
		expect(action).toEqual({ text: "", shouldSend: true });
	});
});

describe("sortSlashCommandMatches", () => {
	it("places builtin commands after custom commands when ranks tie", () => {
		const sorted = sortSlashCommandMatches([
			{
				command: createCommand({
					name: "plan",
					kind: "builtin",
					source: "builtin",
				}),
				rank: 0,
			},
			{
				command: createCommand({
					name: "deploy",
					kind: "custom",
					source: "project",
				}),
				rank: 0,
			},
		]);

		expect(sorted.map((command) => command.name)).toEqual(["deploy", "plan"]);
	});

	it("keeps builtins at the end even when builtin rank is better", () => {
		const sorted = sortSlashCommandMatches([
			{
				command: createCommand({
					name: "plan",
					kind: "builtin",
					source: "builtin",
				}),
				rank: 0,
			},
			{
				command: createCommand({
					name: "deploy",
					kind: "custom",
					source: "project",
				}),
				rank: 1,
			},
		]);

		expect(sorted.map((command) => command.name)).toEqual(["deploy", "plan"]);
	});
});

describe("slash command selection behavior", () => {
	it("parses only simple pipe-delimited argument enums", () => {
		expect(parseSlashCommandArgumentOptions("on|off|toggle")).toEqual([
			"on",
			"off",
			"toggle",
		]);
		expect(
			parseSlashCommandArgumentOptions("<default|plan|accept-edits>"),
		).toEqual(["default", "plan", "accept-edits"]);
	});

	it("does not turn free-form or mixed usage hints into options", () => {
		for (const hint of [
			"[任务描述]",
			"<query>",
			"(no args to show) all | one-at-a-time",
			"all | one-at-a-time (default)",
			"<safe|needs more context>",
		]) {
			expect(parseSlashCommandArgumentOptions(hint)).toEqual([]);
		}
	});

	it("opens a second-level picker for commands with enumerated options", () => {
		const command = createCommand({ name: "mode", argumentHint: "<mode>" });
		const composerCommand = {
			...command,
			argumentOptions: ["default", "plan"],
		};
		expect(getSlashCommandSelectionBehavior(composerCommand)).toBe("choose");
		expect(resolveSlashCommandArgumentOptions(composerCommand, [])).toEqual([
			"default",
			"plan",
		]);
	});

	it("uses inline input for free-form arguments", () => {
		expect(
			getSlashCommandSelectionBehavior(
				createCommand({ name: "search", argumentHint: "<query>" }),
			),
		).toBe("input");
	});

	it("falls back to live model names for the model command", () => {
		const command = {
			...createCommand({ name: "model", argumentHint: "<model>" }),
			action: { type: "set_model" as const, argument: "" },
		};
		expect(
			resolveSlashCommandArgumentOptions(command, ["Opus", "Sonnet"]),
		).toEqual(["Opus", "Sonnet"]);
	});
});

describe("filterSlashCommands", () => {
	const commands = [
		createCommand({
			name: "model",
			aliases: ["m"],
			argumentHint: "[<model-id-or-name>]",
		}),
		createCommand({
			name: "mode",
			argumentHint: "<default|plan|accept-edits>",
		}),
	];

	it("keeps an exact command match visible and ranks it first", () => {
		const matches = filterSlashCommands(commands, "mode").map(
			(command) => command.name,
		);
		expect(matches).toContain("mode");
		expect(matches[0]).toBe("mode");
	});

	it("matches command aliases", () => {
		const commandsWithDistinctAlias = [
			createCommand({ name: "model", aliases: ["mdl"] }),
			createCommand({ name: "mode" }),
		];
		expect(
			filterSlashCommands(commandsWithDistinctAlias, "mdl").map(
				(command) => command.name,
			),
		).toEqual(["model"]);
	});
});
