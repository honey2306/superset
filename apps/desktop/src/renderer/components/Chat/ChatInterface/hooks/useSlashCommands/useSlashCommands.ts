import type { ChatServiceRouter } from "@superset/chat/server/desktop";
import type { inferRouterOutputs } from "@trpc/server";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ChatServiceOutputs = inferRouterOutputs<ChatServiceRouter>;
export type SlashCommand =
	ChatServiceOutputs["workspace"]["getSlashCommands"][number];

/** The presentation fields a rich composer needs, independent of command host. */
export type ComposerSlashCommand = {
	name: string;
	aliases: string[];
	description: string;
	argumentHint: string;
	kind: "builtin" | "custom";
	action?:
		| SlashCommand["action"]
		| { type: "set_mode"; valueByLabel: Record<string, string | boolean> }
		| {
				type: "set_config_option";
				configId: string;
				valueByLabel: Record<string, string | boolean>;
		  };
	argumentOptions?: string[];
};

function getSlashQuery(inputValue: string): string | null {
	if (inputValue.includes("\n")) return null;
	const match = inputValue.match(/^\/([^\s]*)$/);
	if (!match) return null;
	return match[1]?.toLowerCase() ?? "";
}

function getMatchRank(commandName: string, query: string): number | null {
	if (query === "") return 0;
	if (commandName === query) return 0;
	if (commandName.startsWith(query)) return 1;
	if (commandName.includes(query)) return 2;
	return null;
}

export function getCommandMatchRank(
	command: ComposerSlashCommand,
	query: string,
): number | null {
	const nameRank = getMatchRank(command.name.toLowerCase(), query);
	if (nameRank !== null) return nameRank;

	let bestAliasRank: number | null = null;
	for (const alias of command.aliases) {
		const rank = getMatchRank(alias.toLowerCase(), query);
		if (rank === null) continue;
		const aliasRank = rank + 3;
		if (bestAliasRank === null || aliasRank < bestAliasRank) {
			bestAliasRank = aliasRank;
		}
	}

	return bestAliasRank;
}

export function sortSlashCommandMatches<T extends ComposerSlashCommand>(
	matches: Array<{ command: T; rank: number }>,
): T[] {
	return matches
		.sort((a, b) => {
			if (a.command.kind !== b.command.kind) {
				return a.command.kind === "builtin" ? 1 : -1;
			}
			if (a.rank !== b.rank) return a.rank - b.rank;
			return a.command.name.localeCompare(b.command.name);
		})
		.map((item) => item.command);
}

export type SlashCommandSelectionBehavior = "choose" | "input" | "execute";

export function getSlashCommandSelectionBehavior(
	command: ComposerSlashCommand,
): SlashCommandSelectionBehavior {
	if (command.argumentOptions?.length || command.action?.type === "set_model")
		return "choose";
	if (command.argumentHint.trim()) return "input";
	return "execute";
}

export function resolveSlashCommandArgumentOptions(
	command: ComposerSlashCommand,
	availableModelNames: string[],
): string[] {
	if (command.argumentOptions?.length) return command.argumentOptions;
	if (command.action?.type === "set_model") return availableModelNames;
	return [];
}

export function filterSlashCommands<T extends ComposerSlashCommand>(
	commands: T[],
	query: string,
): T[] {
	const rankedCommands = commands
		.map((command) => {
			const rank = getCommandMatchRank(command, query);
			return rank === null ? null : { command, rank };
		})
		.filter((item): item is { command: T; rank: number } => item !== null);

	return sortSlashCommandMatches(rankedCommands);
}

export function useSlashCommands({
	inputValue,
	commands,
}: {
	inputValue: string;
	commands: SlashCommand[];
}) {
	const [selectedIndex, setSelectedIndex] = useState(0);

	const query = getSlashQuery(inputValue);
	const isOpen = query !== null;
	const filteredCommands = useMemo(() => {
		if (!isOpen || query === null) return [];
		return filterSlashCommands(commands, query);
	}, [commands, isOpen, query]);

	const prevQuery = useRef(query);
	useEffect(() => {
		if (prevQuery.current !== query) {
			setSelectedIndex(0);
			prevQuery.current = query;
		}
	}, [query]);

	const navigateUp = useCallback(() => {
		setSelectedIndex((prev) =>
			prev <= 0 ? filteredCommands.length - 1 : prev - 1,
		);
	}, [filteredCommands.length]);

	const navigateDown = useCallback(() => {
		setSelectedIndex((prev) =>
			prev >= filteredCommands.length - 1 ? 0 : prev + 1,
		);
	}, [filteredCommands.length]);

	return {
		isOpen: isOpen && filteredCommands.length > 0,
		filteredCommands,
		selectedIndex,
		setSelectedIndex,
		navigateUp,
		navigateDown,
	};
}

export function resolveCommandAction(command: SlashCommand): {
	text: string;
	shouldSend: boolean;
} {
	if (command.argumentHint.trim()) {
		return { text: `/${command.name} `, shouldSend: false };
	}
	return { text: "", shouldSend: true };
}
