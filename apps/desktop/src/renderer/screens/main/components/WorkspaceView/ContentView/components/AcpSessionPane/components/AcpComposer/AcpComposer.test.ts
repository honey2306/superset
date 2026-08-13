import { describe, expect, test } from "bun:test";
import {
	acpCommandsToComposerCommands,
	createAcpComposerDraftStore,
	isAcpImageAttachment,
	resolveAcpConfigCommand,
	resolveCanEnqueue,
	resolveCanSendNow,
	resolveCanSubmit,
	resolveComposerDisabled,
	resolveComposerMode,
	resolveShowCancel,
	shouldClearSubmittedDraft,
	shouldRestoreSubmittedDraft,
	toAcpImageContentBlock,
} from "./acpComposerState";

describe("acpCommandsToComposerCommands", () => {
	test("preserves ACP presentation fields without adding local commands", () => {
		const result = acpCommandsToComposerCommands([
			{
				name: "review",
				description: "Review the current change",
				input: { hint: "[scope]" },
			},
		] as Parameters<typeof acpCommandsToComposerCommands>[0]);

		expect(result).toEqual([
			{
				name: "review",
				aliases: [],
				description: "Review the current change",
				argumentHint: "[scope]",
				kind: "custom",
			},
		]);
	});

	test("merges config commands ahead of ACP catalog and deduplicates case-insensitively", () => {
		const result = acpCommandsToComposerCommands(
			[
				{ name: "MODEL", description: "Remote model command" },
				{ name: "diagnose", description: "Run the diagnose skill" },
			],
			[
				{
					id: "model",
					name: "Model",
					category: "model",
					type: "select",
					currentValue: "opus",
					options: [{ value: "opus", name: "Opus 4.6" }],
				},
			],
		);

		expect(result.map(({ name, kind }) => ({ name, kind }))).toEqual([
			{ name: "model", kind: "builtin" },
			{ name: "diagnose", kind: "custom" },
		]);
		expect(result[0]?.argumentOptions).toEqual(["Opus 4.6"]);
	});

	test("flattens grouped select options and creates boolean options", () => {
		const result = acpCommandsToComposerCommands(
			[],
			[
				{
					id: "model",
					name: "Model",
					category: "model",
					type: "select",
					currentValue: "opus",
					options: [
						{
							group: "claude",
							name: "Claude",
							options: [{ value: "opus", name: "Opus 4.6" }],
						},
					],
				},
				{
					id: "fast",
					name: "Fast",
					category: "model_config",
					type: "boolean",
					currentValue: false,
				},
			],
		);

		expect(result.map((command) => command.argumentOptions)).toEqual([
			["Opus 4.6"],
			["On", "Off"],
		]);
	});
});

describe("resolveAcpConfigCommand", () => {
	const commands = acpCommandsToComposerCommands(
		[],
		[
			{
				id: "mode",
				name: "Mode",
				category: "mode",
				type: "select",
				currentValue: "agent",
				options: [
					{ value: "agent", name: "Agent" },
					{ value: "plan", name: "Plan" },
				],
			},
			{
				id: "model",
				name: "Model",
				category: "model",
				type: "select",
				currentValue: "opus",
				options: [{ value: "opus", name: "Opus 4.6" }],
			},
		],
	);

	test("resolves mode and multi-word config labels case-insensitively", () => {
		expect(resolveAcpConfigCommand("/MODE plan", commands, false)).toEqual({
			type: "set_mode",
			value: "plan",
		});
		expect(resolveAcpConfigCommand("/model opus 4.6", commands, false)).toEqual(
			{
				type: "set_config_option",
				configId: "model",
				value: "opus",
			},
		);
	});

	test("also accepts raw values", () => {
		expect(resolveAcpConfigCommand("/model OPUS", commands, false)).toEqual({
			type: "set_config_option",
			configId: "model",
			value: "opus",
		});
	});

	test("does not intercept ordinary text or commands with attachments", () => {
		expect(
			resolveAcpConfigCommand("model Opus 4.6", commands, false),
		).toBeNull();
		expect(
			resolveAcpConfigCommand("/model Opus 4.6", commands, true),
		).toBeNull();
	});

	test("rejects an unknown option for a local command", () => {
		expect(() =>
			resolveAcpConfigCommand("/model Unknown", commands, false),
		).toThrow("Unknown option: Unknown");
	});
});

describe("shouldClearSubmittedDraft", () => {
	test("clears only the unchanged submitted draft", () => {
		expect(shouldClearSubmittedDraft("review this", "review this")).toBe(true);
	});

	test("preserves the submitted draft after failure or concurrent editing", () => {
		expect(shouldClearSubmittedDraft("review this", "review this again")).toBe(
			false,
		);
	});
});

describe("ACP session drafts", () => {
	test("keeps an unsent draft per session across composer remounts", () => {
		const drafts = createAcpComposerDraftStore();
		drafts.set("myflicker", "DRAFT_PERSIST_20260807");

		expect(drafts.get("myflicker")).toBe("DRAFT_PERSIST_20260807");
		expect(drafts.get("pi")).toBe("");
	});

	test("clears a submitted or permanently closed session draft", () => {
		const drafts = createAcpComposerDraftStore();
		drafts.set("session-1", "unsent message");
		drafts.clear("session-1");

		expect(drafts.get("session-1")).toBe("");
	});
});

describe("shouldRestoreSubmittedDraft", () => {
	test("restores a failed optimistic submission only while the editor is empty", () => {
		expect(shouldRestoreSubmittedDraft("", true)).toBe(true);
		expect(shouldRestoreSubmittedDraft("new message", true)).toBe(false);
		expect(shouldRestoreSubmittedDraft("", false)).toBe(false);
	});
});

describe("isAcpImageAttachment", () => {
	test("accepts only image attachment media types for ACP image blocks", () => {
		expect(isAcpImageAttachment({ mediaType: "image/png" })).toBe(true);
		expect(isAcpImageAttachment({ mediaType: "application/pdf" })).toBe(false);
		expect(isAcpImageAttachment({})).toBe(false);
	});
});

describe("toAcpImageContentBlock", () => {
	test("preserves a real one-pixel PNG payload for ACP image attachments", async () => {
		// 1×1 transparent PNG. Keeping this inline makes the paste/encode path
		// deterministic and avoids a filesystem fixture in the shared worktree.
		const png = Uint8Array.from(
			atob(
				"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9jAAAAABJRU5ErkJggg==",
			),
			(byte) => byte.charCodeAt(0),
		);
		const image = await toAcpImageContentBlock(
			{ url: "blob:one-pixel", mediaType: "image/png" },
			async () => new Response(png),
		);

		expect(image).toEqual({
			type: "image",
			data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9jAAAAABJRU5ErkJggg==",
			mimeType: "image/png",
		});
	});

	test("encodes raw base64 without a data URI prefix and preserves MIME type", async () => {
		const image = await toAcpImageContentBlock(
			{ url: "blob:clipboard-image", mediaType: "image/png" },
			async () => new Response(Uint8Array.from([0, 1, 2, 255])),
		);

		expect(image).toEqual({
			type: "image",
			data: "AAEC/w==",
			mimeType: "image/png",
		});
	});

	test("throws when the pasted image cannot be fetched", async () => {
		await expect(
			toAcpImageContentBlock(
				{ url: "blob:missing", mediaType: "image/webp" },
				async () => new Response(null, { status: 500 }),
			),
		).rejects.toThrow("Failed to read pasted image");
	});

	test("propagates pasted image fetch failures", async () => {
		await expect(
			toAcpImageContentBlock(
				{ url: "blob:network-error", mediaType: "image/jpeg" },
				async () => Promise.reject(new Error("network failed")),
			),
		).rejects.toThrow("network failed");
	});

	test("throws when pasted image data cannot be read", async () => {
		const unreadableResponse = {
			ok: true,
			arrayBuffer: async () => Promise.reject(new Error("read failed")),
		} as Response;
		await expect(
			toAcpImageContentBlock(
				{ url: "blob:unreadable", mediaType: "image/gif" },
				async () => unreadableResponse,
			),
		).rejects.toThrow("read failed");
	});
});

describe("resolveComposerDisabled", () => {
	test("disabled when isLoading", () => {
		expect(
			resolveComposerDisabled({
				status: "idle",
				isLoading: true,
				isAdmitting: false,
			}),
		).toBe(true);
	});

	test("disabled when isAdmitting", () => {
		expect(
			resolveComposerDisabled({
				status: "idle",
				isLoading: false,
				isAdmitting: true,
			}),
		).toBe(true);
	});

	test("disabled when status is offline", () => {
		expect(
			resolveComposerDisabled({
				status: "offline",
				isLoading: false,
				isAdmitting: false,
			}),
		).toBe(true);
	});

	test("disabled when status is dead", () => {
		expect(
			resolveComposerDisabled({
				status: "dead",
				isLoading: false,
				isAdmitting: false,
			}),
		).toBe(true);
	});

	test("disabled when status is starting", () => {
		expect(
			resolveComposerDisabled({
				status: "starting",
				isLoading: false,
				isAdmitting: false,
			}),
		).toBe(true);
	});

	test("disabled when status is undefined (no session yet)", () => {
		expect(
			resolveComposerDisabled({
				status: undefined,
				isLoading: false,
				isAdmitting: false,
			}),
		).toBe(true);
	});

	test("enabled when status is idle and not loading/admitting", () => {
		expect(
			resolveComposerDisabled({
				status: "idle",
				isLoading: false,
				isAdmitting: false,
			}),
		).toBe(false);
	});

	test("enabled when status is running (can still compose while agent works)", () => {
		expect(
			resolveComposerDisabled({
				status: "running",
				isLoading: false,
				isAdmitting: false,
			}),
		).toBe(false);
	});

	test("enabled when status is awaiting_permission", () => {
		expect(
			resolveComposerDisabled({
				status: "awaiting_permission",
				isLoading: false,
				isAdmitting: false,
			}),
		).toBe(false);
	});
});

describe("resolveShowCancel", () => {
	test("shows cancel when running", () => {
		expect(resolveShowCancel("running")).toBe(true);
	});

	test("shows cancel when awaiting_permission", () => {
		expect(resolveShowCancel("awaiting_permission")).toBe(true);
	});

	test("does not show cancel when idle", () => {
		expect(resolveShowCancel("idle")).toBe(false);
	});

	test("does not show cancel when offline", () => {
		expect(resolveShowCancel("offline")).toBe(false);
	});

	test("does not show cancel when undefined", () => {
		expect(resolveShowCancel(undefined)).toBe(false);
	});
});

describe("resolveCanSubmit", () => {
	test("can submit when idle", () => {
		expect(resolveCanSubmit("idle")).toBe(true);
	});

	test("cannot submit when running", () => {
		expect(resolveCanSubmit("running")).toBe(false);
	});

	test("cannot submit when awaiting_permission", () => {
		expect(resolveCanSubmit("awaiting_permission")).toBe(false);
	});

	test("cannot submit when offline", () => {
		expect(resolveCanSubmit("offline")).toBe(false);
	});

	test("cannot submit when dead", () => {
		expect(resolveCanSubmit("dead")).toBe(false);
	});

	test("cannot submit when starting", () => {
		expect(resolveCanSubmit("starting")).toBe(false);
	});

	test("cannot submit when undefined", () => {
		expect(resolveCanSubmit(undefined)).toBe(false);
	});
});

describe("resolveComposerMode", () => {
	test("streaming while running", () => {
		expect(resolveComposerMode("running")).toBe("streaming");
	});
	test("streaming while awaiting_permission", () => {
		expect(resolveComposerMode("awaiting_permission")).toBe("streaming");
	});
	test("idle otherwise", () => {
		expect(resolveComposerMode("idle")).toBe("idle");
		expect(resolveComposerMode("offline")).toBe("idle");
		expect(resolveComposerMode("starting")).toBe("idle");
		expect(resolveComposerMode(undefined)).toBe("idle");
	});
});

describe("resolveCanEnqueue", () => {
	test("true when session accepts work", () => {
		expect(resolveCanEnqueue("idle")).toBe(true);
		expect(resolveCanEnqueue("running")).toBe(true);
		expect(resolveCanEnqueue("awaiting_permission")).toBe(true);
	});
	test("false when session cannot", () => {
		expect(resolveCanEnqueue("starting")).toBe(false);
		expect(resolveCanEnqueue("offline")).toBe(false);
		expect(resolveCanEnqueue("dead")).toBe(false);
		expect(resolveCanEnqueue(undefined)).toBe(false);
	});
});

describe("resolveCanSendNow", () => {
	test("only while a turn is in flight", () => {
		expect(resolveCanSendNow("running")).toBe(true);
		expect(resolveCanSendNow("awaiting_permission")).toBe(true);
	});
	test("otherwise the normal Send path already fires", () => {
		expect(resolveCanSendNow("idle")).toBe(false);
		expect(resolveCanSendNow("offline")).toBe(false);
		expect(resolveCanSendNow(undefined)).toBe(false);
	});
});
