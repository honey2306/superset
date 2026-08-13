import type {
	ExternalApp,
	OpenInAppInput,
} from "@superset/shared/desktop-types";
import type { LinkAction } from "renderer/lib/clickPolicy/types";

interface TerminalFileLink {
	resolvedPath: string;
	isDirectory: boolean;
	row?: number;
	col?: number;
}

interface FileViewerInput {
	filePath: string;
	line?: number;
	column?: number;
	openInNewTab: boolean;
}

export type TerminalFileLinkAction =
	| { kind: "external"; input: OpenInAppInput }
	| { kind: "viewer"; input: FileViewerInput };

export function buildTerminalFileLinkAction(
	action: LinkAction,
	link: TerminalFileLink,
	app: ExternalApp,
): TerminalFileLinkAction {
	if (action === "external" || link.isDirectory) {
		return {
			kind: "external",
			input: {
				path: link.resolvedPath,
				app,
				...(link.row === undefined ? {} : { line: link.row }),
				...(link.col === undefined ? {} : { column: link.col }),
			},
		};
	}

	return {
		kind: "viewer",
		input: {
			filePath: link.resolvedPath,
			line: link.row,
			column: link.col,
			openInNewTab: action === "newTab",
		},
	};
}
