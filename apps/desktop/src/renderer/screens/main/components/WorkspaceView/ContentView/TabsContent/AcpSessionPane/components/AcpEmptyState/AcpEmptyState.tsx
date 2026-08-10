import { useEffect, useRef, useState } from "react";

interface AcpEmptyStateProps {
	/** Stable key used to remember boot-animation progress across remounts. */
	sessionId?: string;
	cwd?: string;
	model?: string;
	agentLabel?: string;
}

// The pane renders AcpEmptyState from two different parents (loading branch in
// AcpSessionPane, empty-timeline branch in AcpTimeline). When session loading
// finishes with an empty timeline, React remounts this component and the
// animation restarts. Persist progress per session in module scope so the
// reveal picks up where it left off instead of replaying.
const bootProgress = new Map<string, number>();

type BootTone = "green" | "cyan" | "purple" | "pink";

interface BootLine {
	tone: BootTone;
	text: string;
}

const BOOT_INITIAL_DELAY_MS = 600;
const BOOT_LINE_DELAY_MS = 160;
const MAX_BANNER_LENGTH = 12;

// 6-row "ANSI Shadow" figlet — the same font Claude Code / Codex CLI use for
// their splash banners. Uses U+2588 blocks + U+2550/U+2551/U+2554–U+255D box-
// drawing characters; every glyph is padded so rows in a given glyph share the
// same visual column width when rendered in a strict monospace font (see the
// .acp-empty__ascii-art font stack).
const GLYPH_ROWS = 6;
const GLYPHS: Record<string, readonly string[]> = {
	A: [" █████╗ ", "██╔══██╗", "███████║", "██╔══██║", "██║  ██║", "╚═╝  ╚═╝"],
	B: ["██████╗ ", "██╔══██╗", "██████╔╝", "██╔══██╗", "██████╔╝", "╚═════╝ "],
	C: [" ██████╗", "██╔════╝", "██║     ", "██║     ", "╚██████╗", " ╚═════╝"],
	D: ["██████╗ ", "██╔══██╗", "██║  ██║", "██║  ██║", "██████╔╝", "╚═════╝ "],
	E: ["███████╗", "██╔════╝", "█████╗  ", "██╔══╝  ", "███████╗", "╚══════╝"],
	F: ["███████╗", "██╔════╝", "█████╗  ", "██╔══╝  ", "██║     ", "╚═╝     "],
	G: [
		" ██████╗ ",
		"██╔════╝ ",
		"██║  ███╗",
		"██║   ██║",
		"╚██████╔╝",
		" ╚═════╝ ",
	],
	H: ["██╗  ██╗", "██║  ██║", "███████║", "██╔══██║", "██║  ██║", "╚═╝  ╚═╝"],
	I: ["██╗", "██║", "██║", "██║", "██║", "╚═╝"],
	J: ["     ██╗", "     ██║", "     ██║", "██   ██║", "╚█████╔╝", " ╚════╝ "],
	K: ["██╗  ██╗", "██║ ██╔╝", "█████╔╝ ", "██╔═██╗ ", "██║  ██╗", "╚═╝  ╚═╝"],
	L: ["██╗     ", "██║     ", "██║     ", "██║     ", "███████╗", "╚══════╝"],
	M: [
		"███╗   ███╗",
		"████╗ ████║",
		"██╔████╔██║",
		"██║╚██╔╝██║",
		"██║ ╚═╝ ██║",
		"╚═╝     ╚═╝",
	],
	N: [
		"███╗   ██╗",
		"████╗  ██║",
		"██╔██╗ ██║",
		"██║╚██╗██║",
		"██║ ╚████║",
		"╚═╝  ╚═══╝",
	],
	O: [
		" ██████╗ ",
		"██╔═══██╗",
		"██║   ██║",
		"██║   ██║",
		"╚██████╔╝",
		" ╚═════╝ ",
	],
	P: ["██████╗ ", "██╔══██╗", "██████╔╝", "██╔═══╝ ", "██║     ", "╚═╝     "],
	Q: [
		" ██████╗ ",
		"██╔═══██╗",
		"██║   ██║",
		"██║▄▄ ██║",
		"╚██████╔╝",
		" ╚══▀▀═╝ ",
	],
	R: ["██████╗ ", "██╔══██╗", "██████╔╝", "██╔══██╗", "██║  ██║", "╚═╝  ╚═╝"],
	S: ["███████╗", "██╔════╝", "███████╗", "╚════██║", "███████║", "╚══════╝"],
	T: [
		"████████╗",
		"╚══██╔══╝",
		"   ██║   ",
		"   ██║   ",
		"   ██║   ",
		"   ╚═╝   ",
	],
	U: [
		"██╗   ██╗",
		"██║   ██║",
		"██║   ██║",
		"██║   ██║",
		"╚██████╔╝",
		" ╚═════╝ ",
	],
	V: [
		"██╗   ██╗",
		"██║   ██║",
		"██║   ██║",
		"╚██╗ ██╔╝",
		" ╚████╔╝ ",
		"  ╚═══╝  ",
	],
	W: [
		"██╗    ██╗",
		"██║    ██║",
		"██║ █╗ ██║",
		"██║███╗██║",
		"╚███╔███╔╝",
		" ╚══╝╚══╝ ",
	],
	X: ["██╗  ██╗", "╚██╗██╔╝", " ╚███╔╝ ", " ██╔██╗ ", "██╔╝ ██╗", "╚═╝  ╚═╝"],
	Y: [
		"██╗   ██╗",
		"╚██╗ ██╔╝",
		" ╚████╔╝ ",
		"  ╚██╔╝  ",
		"   ██║   ",
		"   ╚═╝   ",
	],
	Z: ["███████╗", "╚══███╔╝", "  ███╔╝ ", " ███╔╝  ", "███████╗", "╚══════╝"],
	"0": [
		" ██████╗ ",
		"██╔═████╗",
		"██║██╔██║",
		"████╔╝██║",
		"╚██████╔╝",
		" ╚═════╝ ",
	],
	"1": [" ██╗", "███║", "╚██║", " ██║", " ██║", " ╚═╝"],
	"2": ["██████╗ ", "╚════██╗", " █████╔╝", "██╔═══╝ ", "███████╗", "╚══════╝"],
	"3": ["██████╗ ", "╚════██╗", " █████╔╝", " ╚═══██╗", "██████╔╝", "╚═════╝ "],
	"4": ["██╗  ██╗", "██║  ██║", "███████║", "╚════██║", "     ██║", "     ╚═╝"],
	"5": ["███████╗", "██╔════╝", "███████╗", "╚════██║", "███████║", "╚══════╝"],
	"6": [
		" ██████╗ ",
		"██╔════╝ ",
		"███████╗ ",
		"██╔═══██╗",
		"╚██████╔╝",
		" ╚═════╝ ",
	],
	"7": ["███████╗", "╚════██║", "    ██╔╝", "   ██╔╝ ", "   ██║  ", "   ╚═╝  "],
	"8": [" █████╗ ", "██╔══██╗", "╚█████╔╝", "██╔══██╗", "╚█████╔╝", " ╚════╝ "],
	"9": [" █████╗ ", "██╔══██╗", "╚██████║", " ╚═══██║", " █████╔╝", " ╚════╝ "],
	" ": ["  ", "  ", "  ", "  ", "  ", "  "],
};

/** Turns a provider label into a compact, readable terminal-banner name. */
export function normalizeAgentName(agentLabel?: string): string {
	const label = agentLabel?.trim() ?? "";
	const key = label.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
	if (key === "claude" || key.startsWith("claudecode")) return "CLAUDE";
	if (key === "codex" || key.startsWith("codex")) return "CODEX";
	if (key === "grok" || key.startsWith("grok")) return "GROK";

	const safeName = label
		.normalize("NFKD")
		.replace(/[^a-zA-Z0-9 ]/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.toUpperCase();
	return (safeName || "AGENT").slice(0, MAX_BANNER_LENGTH).trimEnd();
}

/** Renders a six-row ANSI Shadow terminal banner for the resolved agent name. */
export function createAgentAsciiBanner(agentLabel?: string): string {
	const name = normalizeAgentName(agentLabel);
	const glyphs = Array.from(
		name,
		(character) => GLYPHS[character] ?? GLYPHS[" "],
	);
	return Array.from({ length: GLYPH_ROWS }, (_, row) =>
		glyphs
			.map((g) => g[row] ?? "")
			.join(" ")
			.trimEnd(),
	).join("\n");
}

export function buildBootLines({
	agentLabel,
	model,
	cwd,
}: AcpEmptyStateProps): BootLine[] {
	const resolvedAgent = agentLabel?.trim() || "Agent";
	const resolvedWorkspace = cwd?.trim() || "workspace";
	return [
		{ tone: "green", text: `Agent connected · ${resolvedAgent}` },
		{
			tone: "green",
			text: model?.trim() ? `Model loaded · ${model.trim()}` : "Model loaded",
		},
		{ tone: "cyan", text: `Workspace mounted · ${resolvedWorkspace}` },
		{ tone: "cyan", text: "Git status checked" },
		{ tone: "purple", text: "ACP session initialized" },
		{ tone: "purple", text: "Permissions armed" },
		{ tone: "pink", text: "Ready." },
	];
}

function usePrefersReducedMotion(): boolean {
	const query = "(prefers-reduced-motion: reduce)";
	const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
		typeof window !== "undefined" && window.matchMedia
			? window.matchMedia(query).matches
			: false,
	);

	useEffect(() => {
		const mediaQuery = window.matchMedia?.(query);
		if (!mediaQuery) return;
		const update = () => setPrefersReducedMotion(mediaQuery.matches);
		update();
		mediaQuery.addEventListener("change", update);
		return () => mediaQuery.removeEventListener("change", update);
	}, []);

	return prefersReducedMotion;
}

export function AcpEmptyState(props: AcpEmptyStateProps) {
	const lines = buildBootLines(props);
	const prefersReducedMotion = usePrefersReducedMotion();
	const { sessionId } = props;
	const [shownLines, setShownLines] = useState(() => {
		if (prefersReducedMotion) return lines.length;
		if (sessionId) return bootProgress.get(sessionId) ?? 0;
		return 0;
	});
	// Lines that were already revealed on a previous mount should snap in
	// without replaying the per-line fade — only newly appended lines animate.
	const initialShownRef = useRef(shownLines);

	useEffect(() => {
		if (!sessionId) return;
		bootProgress.set(sessionId, shownLines);
	}, [sessionId, shownLines]);

	useEffect(() => {
		if (prefersReducedMotion) {
			setShownLines(lines.length);
			return;
		}
		if (shownLines >= lines.length) return;
		const delay = shownLines === 0 ? BOOT_INITIAL_DELAY_MS : BOOT_LINE_DELAY_MS;
		const timeout = window.setTimeout(
			() => setShownLines((count) => count + 1),
			delay,
		);
		return () => window.clearTimeout(timeout);
	}, [lines.length, prefersReducedMotion, shownLines]);

	return (
		<div className="acp-empty acp-empty--boot">
			<pre
				aria-label={`${normalizeAgentName(props.agentLabel)} agent`}
				className="acp-empty__ascii-art"
				role="img"
			>
				{createAgentAsciiBanner(props.agentLabel)}
			</pre>
			<div className="acp-empty__boot-log" aria-live="polite">
				{lines.slice(0, shownLines).map((line, index) => (
					<div
						className="acp-empty__boot-line"
						data-restored={index < initialShownRef.current ? "true" : undefined}
						data-tone={line.tone}
						key={line.text}
					>
						<span aria-hidden="true" className="acp-empty__boot-check">
							[✓]
						</span>
						<span>{line.text}</span>
					</div>
				))}
				{shownLines >= lines.length && (
					<div className="acp-empty__boot-cursor" aria-hidden="true">
						<span aria-hidden="true">›</span>
						<span aria-hidden="true" className="acp-empty__boot-blink">
							▍
						</span>
					</div>
				)}
			</div>
		</div>
	);
}
