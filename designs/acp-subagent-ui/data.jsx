const SCENARIOS = {
	running: {
		label: "Running",
		status: "running",
		elapsed: "00:24",
		children: [
			{ id: "search", kind: "search", title: 'rg "useAcpSession" apps/desktop', status: "completed", detail: "12 matches in 6 files", time: "0.8s" },
			{ id: "read", kind: "read", title: "AcpSessionPane.tsx", status: "completed", detail: "Read 461 lines", time: "0.3s" },
			{ id: "inspect", kind: "read", title: "fold.ts", status: "completed", detail: "Inspecting timeline normalization", time: "0.5s" },
			{ id: "test", kind: "execute", title: "bun run test --filter session-protocol", status: "in_progress", detail: "Running 59 tests…", time: "8.4s" }
		]
	},
	permission: {
		label: "Permission",
		status: "awaiting_approval",
		elapsed: "00:38",
		children: [
			{ id: "search", kind: "search", title: 'rg "useAcpSession" apps/desktop', status: "completed", detail: "12 matches in 6 files", time: "0.8s" },
			{ id: "read", kind: "read", title: "AcpSessionPane.tsx", status: "completed", detail: "Read 461 lines", time: "0.3s" },
			{ id: "edit", kind: "edit", title: "AcpToolCallItem.tsx", status: "pending", detail: "Needs permission to edit this file", time: "" }
		]
	},
	completed: {
		label: "Completed",
		status: "completed",
		elapsed: "01:12",
		children: [
			{ id: "search", kind: "search", title: 'rg "useAcpSession" apps/desktop', status: "completed", detail: "12 matches in 6 files", time: "0.8s" },
			{ id: "read", kind: "read", title: "AcpSessionPane.tsx", status: "completed", detail: "Read 461 lines", time: "0.3s" },
			{ id: "edit", kind: "edit", title: "AcpToolCallItem.tsx", status: "completed", detail: "+84 −12", time: "2.1s" },
			{ id: "test", kind: "execute", title: "bun run test --filter session-protocol", status: "completed", detail: "59 passed", time: "12.4s" }
		]
	},
	failed: {
		label: "Failed",
		status: "failed",
		elapsed: "00:46",
		children: [
			{ id: "search", kind: "search", title: 'rg "useAcpSession" apps/desktop', status: "completed", detail: "12 matches in 6 files", time: "0.8s" },
			{ id: "edit", kind: "edit", title: "AcpToolCallItem.tsx", status: "completed", detail: "+84 −12", time: "2.1s" },
			{ id: "test", kind: "execute", title: "bun run typecheck", status: "failed", detail: "TS2322: Type 'undefined' is not assignable", time: "9.7s" }
		]
	}
};

Object.assign(window, { SCENARIOS });
