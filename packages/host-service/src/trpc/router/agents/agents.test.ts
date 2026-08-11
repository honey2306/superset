import { describe, expect, it } from "bun:test";
import {
	buildAgentCommandString,
	buildChatAgentMetadata,
	resolveBundledHostAgentConfig,
} from "./agents";

const argvConfig = {
	id: "00000000-0000-0000-0000-000000000001",
	presetId: "claude",
	label: "Claude",
	command: "claude",
	args: ["--dangerously-skip-permissions"],
	promptTransport: "argv" as const,
	promptArgs: [],
	env: {},
};

const stdinConfig = {
	id: "00000000-0000-0000-0000-000000000002",
	presetId: "amp",
	label: "Amp",
	command: "amp",
	args: [],
	promptTransport: "stdin" as const,
	promptArgs: [],
	env: {},
};

const myFlickerConfig = {
	id: "00000000-0000-0000-0000-000000000003",
	presetId: "myflicker",
	label: "MyFlicker",
	command: "mfcli",
	args: [],
	promptTransport: "argv" as const,
	promptArgs: [],
	env: {},
};

const RANDOM_ID = "test-1234";
const DELIMITER = "SUPERSET_PROMPT_test1234";

describe("resolveBundledHostAgentConfig", () => {
	it("resolves the bundled mfcli preset for older config tables", () => {
		expect(resolveBundledHostAgentConfig("myflicker")).toMatchObject({
			id: "myflicker",
			presetId: "myflicker",
			label: "MyFlicker",
			command: "mfcli",
		});
	});
});

describe("buildAgentCommandString", () => {
	it("appends the prompt as a quoted positional (argv transport)", () => {
		// Not the shared "$(cat <<…)" form: the command must parse in non-POSIX
		// shells like fish, which have no heredocs.
		expect(
			buildAgentCommandString(argvConfig, "do the thing", [], RANDOM_ID),
		).toBe("'claude' '--dangerously-skip-permissions' 'do the thing'");
	});

	it("inserts model args between base args and the prompt (argv transport)", () => {
		expect(
			buildAgentCommandString(
				argvConfig,
				"do the thing",
				["--model", "sonnet"],
				RANDOM_ID,
			),
		).toBe(
			"'claude' '--dangerously-skip-permissions' '--model' 'sonnet' 'do the thing'",
		);
	});

	it("inserts model args before the heredoc (stdin transport)", () => {
		expect(
			buildAgentCommandString(
				stdinConfig,
				"do the thing",
				["--model", "sonnet"],
				RANDOM_ID,
			),
		).toBe(
			`'amp' '--model' 'sonnet' <<'${DELIMITER}'\ndo the thing\n${DELIMITER}`,
		);
	});

	it("shell-quotes hostile model and prompt values", () => {
		expect(
			buildAgentCommandString(
				argvConfig,
				"p'; rm -rf /",
				["--model", "x'; rm -rf /"],
				RANDOM_ID,
			),
		).toBe(
			"'claude' '--dangerously-skip-permissions' '--model' 'x'\\''; rm -rf /' 'p'\\''; rm -rf /'",
		);
	});

	it("includes promptArgs before the prompt when a prompt is present", () => {
		const config = { ...argvConfig, promptArgs: ["-p"] };
		expect(buildAgentCommandString(config, "p", [], RANDOM_ID)).toBe(
			"'claude' '--dangerously-skip-permissions' '-p' 'p'",
		);
	});

	it("drops promptArgs and the prompt payload when the prompt sanitizes to empty", () => {
		const config = { ...argvConfig, promptArgs: ["-p"] };
		expect(buildAgentCommandString(config, "\x1b\x07", [], RANDOM_ID)).toBe(
			"'claude' '--dangerously-skip-permissions'",
		);
		expect(buildAgentCommandString(stdinConfig, "", [], RANDOM_ID)).toBe(
			"'amp'",
		);
	});

	it("adds MyFlicker's verified yolo flag for unattended full-access launches", () => {
		expect(
			buildAgentCommandString(
				myFlickerConfig,
				"do the thing",
				[],
				RANDOM_ID,
				"full_access",
			),
		).toBe("'mfcli' '--approval-mode' 'yolo' 'do the thing'");
	});

	it("keeps MyFlicker's yolo flag idempotent", () => {
		expect(
			buildAgentCommandString(
				{ ...myFlickerConfig, args: ["--approval-mode", "yolo"] },
				"do the thing",
				[],
				RANDOM_ID,
				"full_access",
			),
		).toBe("'mfcli' '--approval-mode' 'yolo' 'do the thing'");
	});

	it("does not add duplicate full-access flags to presets that already have them", () => {
		expect(
			buildAgentCommandString(
				argvConfig,
				"do the thing",
				[],
				RANDOM_ID,
				"full_access",
			),
		).toBe("'claude' '--dangerously-skip-permissions' 'do the thing'");
		const codex = resolveBundledHostAgentConfig("codex");
		if (!codex) throw new Error("Expected bundled Codex preset");
		expect(
			buildAgentCommandString(
				codex,
				"do the thing",
				[],
				RANDOM_ID,
				"full_access",
			),
		).toBe(
			"'codex' '--dangerously-bypass-approvals-and-sandbox' '--dangerously-bypass-hook-trust' '--' 'do the thing'",
		);
	});

	it("does not enhance ordinary manual launches", () => {
		expect(
			buildAgentCommandString(myFlickerConfig, "do the thing", [], RANDOM_ID),
		).toBe("'mfcli' 'do the thing'");
	});
});

describe("buildChatAgentMetadata", () => {
	it("explicitly enables yolo for full-access scheduled chat", () => {
		expect(buildChatAgentMetadata({ permissionMode: "full_access" })).toEqual({
			yolo: true,
		});
	});

	it("does not change permission state for ordinary chat launches", () => {
		expect(buildChatAgentMetadata({})).toBeUndefined();
	});
});
