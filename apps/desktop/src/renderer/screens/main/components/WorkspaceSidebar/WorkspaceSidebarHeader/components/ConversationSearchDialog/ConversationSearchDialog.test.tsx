import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import type { SessionScopedState } from "@superset/session-protocol";
import { ensureHappyDom } from "test-utils/happy-dom-env";

const onOpenChange = mock((_open: boolean) => undefined);
let resolveNavigation: (() => void) | null = null;
const navigateToWorkspace = mock(
	() =>
		new Promise<void>((resolve) => {
			resolveNavigation = resolve;
		}),
);

const session: SessionScopedState = {
	sessionId: "session-1",
	epoch: "epoch-1",
	workspaceId: "workspace-1",
	harness: "claude-agent-acp",
	status: "idle",
	title: "Previous conversation",
	currentMode: null,
	configOptions: [],
	availableCommands: null,
	pendingPermissions: [],
	queuedPrompts: [],
	cwd: "/repo",
	lastSeq: 0,
	lastStopReason: null,
	lastError: null,
	createdAt: 1,
	updatedAt: 2,
};

mock.module("renderer/providers/I18nProvider", () => ({
	useTranslation: () => ({
		locale: "en-US",
		t: (key: string) => key,
	}),
}));

mock.module(
	"renderer/routes/_local/providers/LocalHostServiceProvider",
	() => ({
		useMaybeLocalHostService: () => ({
			activeHostUrl: "http://localhost:1234",
		}),
	}),
);

mock.module(
	"renderer/routes/_local/providers/WorkspaceCatalogProvider/selectors",
	() => ({
		useCatalogWorkspaces: () => ({
			workspaces: [{ id: "workspace-1", name: "Workspace one" }],
		}),
	}),
);

mock.module("renderer/lib/acp-session-client", () => ({
	createDesktopAcpSessionClient: () => ({
		list: async () => ({
			items: [session],
			nextCursor: null,
			enabled: true,
		}),
	}),
}));

mock.module(
	"renderer/routes/_local/_dashboard/utils/workspace-navigation",
	() => ({ navigateToWorkspace }),
);

mock.module("@tanstack/react-router", () => ({
	useNavigate: () => mock(() => undefined),
}));

let cleanup: typeof import("@testing-library/react/pure").cleanup;
let fireEvent: typeof import("@testing-library/react/pure").fireEvent;
let render: typeof import("@testing-library/react/pure").render;
let screen: typeof import("@testing-library/react/pure").screen;
let waitFor: typeof import("@testing-library/react/pure").waitFor;
let ConversationSearchDialog: typeof import("./ConversationSearchDialog").ConversationSearchDialog;

describe("ConversationSearchDialog", () => {
	beforeAll(async () => {
		await ensureHappyDom();
		({ cleanup, fireEvent, render, screen, waitFor } = await import(
			"@testing-library/react/pure"
		));
		({ ConversationSearchDialog } = await import("./ConversationSearchDialog"));
	});

	beforeEach(() => {
		onOpenChange.mockClear();
		navigateToWorkspace.mockClear();
		resolveNavigation = null;
	});

	afterEach(() => cleanup());

	test("keeps the dialog open until the selected conversation navigation completes", async () => {
		render(<ConversationSearchDialog open onOpenChange={onOpenChange} />);

		const result = await screen.findByText("Previous conversation");
		fireEvent.click(result);

		expect(navigateToWorkspace).toHaveBeenCalledTimes(1);
		expect(onOpenChange).not.toHaveBeenCalled();

		resolveNavigation?.();
		await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
	});

	test("uses active-theme semantic colors for the portalled surface", async () => {
		render(<ConversationSearchDialog open onOpenChange={onOpenChange} />);
		await screen.findByText("Previous conversation");

		const dialog = document.querySelector<HTMLElement>(
			'[data-slot="dialog-content"]',
		);
		const command = document.querySelector<HTMLElement>(
			'[data-slot="command"]',
		);

		expect(dialog?.classList.contains("!bg-popover")).toBe(true);
		expect(dialog?.classList.contains("!border-border")).toBe(true);
		expect(command?.classList.contains("!bg-popover")).toBe(true);
		expect(command?.classList.contains("!text-popover-foreground")).toBe(true);
	});
});
