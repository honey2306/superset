import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
	LuEllipsis,
	LuPlugZap,
	LuPlus,
	LuSearch,
	LuTrash2,
} from "react-icons/lu";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import {
	GlobalMcpEditor,
	type GlobalMcpEditorValue,
} from "./components/GlobalMcpEditor";

interface GlobalMcpStdioServer {
	type: "stdio";
	name: string;
	command: string;
	args: string[];
	env: Record<string, string>;
	enabled: boolean;
}

interface GlobalMcpRemoteServer {
	type: "http" | "sse";
	name: string;
	url: string;
	headers: Record<string, string>;
	enabled: boolean;
}

type GlobalMcpServer = GlobalMcpStdioServer | GlobalMcpRemoteServer;

interface PendingSelection {
	selectedName: string | null;
	editor: GlobalMcpEditorValue;
}

const EMPTY_EDITOR: GlobalMcpEditorValue = {
	name: "untitled-mcp",
	transport: "stdio",
	command: "npx",
	argsText: "",
	envText: "",
	url: "",
	headersText: "",
	enabled: true,
};

function toEditorValue(server: GlobalMcpServer): GlobalMcpEditorValue {
	return {
		originalName: server.name,
		name: server.name,
		transport: server.type,
		command: server.type === "stdio" ? server.command : "",
		argsText: server.type === "stdio" ? server.args.join("\n") : "",
		envText: Object.entries(server.type === "stdio" ? server.env : {})
			.map(([name, value]) => `${name}=${value}`)
			.join("\n"),
		url: server.type === "stdio" ? "" : server.url,
		headersText: Object.entries(server.type === "stdio" ? {} : server.headers)
			.map(([name, value]) => `${name}=${value}`)
			.join("\n"),
		enabled: server.enabled,
	};
}

function parseKeyValues(text: string, label: string): Record<string, string> {
	const values: Record<string, string> = {};
	for (const [index, rawLine] of text.split("\n").entries()) {
		const line = rawLine.trim();
		if (!line) continue;
		const separator = line.indexOf("=");
		if (separator <= 0) {
			throw new Error(`${label}第 ${index + 1} 行应为 KEY=VALUE`);
		}
		const name = line.slice(0, separator).trim();
		if (!name) throw new Error(`${label}第 ${index + 1} 行缺少名称`);
		values[name] = line.slice(separator + 1);
	}
	return values;
}

function serverSummary(server: GlobalMcpServer): string {
	return server.type === "stdio"
		? [server.command, ...server.args].join(" ")
		: `${server.type.toUpperCase()} ${server.url}`;
}

export function GlobalMcpPage() {
	const { activeHostUrl: hostUrl } = useLocalHostService();
	const queryClient = useQueryClient();
	const queryKey = ["global-mcp", hostUrl] as const;
	const [selectedName, setSelectedName] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [editor, setEditor] = useState<GlobalMcpEditorValue | null>(null);
	const [savedEditor, setSavedEditor] = useState<GlobalMcpEditorValue | null>(
		null,
	);
	const [pendingDeleteName, setPendingDeleteName] = useState<string | null>(
		null,
	);
	const [pendingSelection, setPendingSelection] =
		useState<PendingSelection | null>(null);
	const settings = useQuery({
		queryKey,
		enabled: hostUrl !== null,
		queryFn: async () => {
			if (!hostUrl) throw new Error("Host service is unavailable");
			return getHostServiceClientByUrl(hostUrl).settings.globalMcp.list.query();
		},
	});
	const servers = useMemo(
		() => (settings.data?.servers ?? []) as GlobalMcpServer[],
		[settings.data?.servers],
	);
	const visibleServers = useMemo(() => {
		const normalizedQuery = query.trim().toLocaleLowerCase();
		if (!normalizedQuery) return servers;
		return servers.filter((server) =>
			`${server.name} ${serverSummary(server)}`
				.toLocaleLowerCase()
				.includes(normalizedQuery),
		);
	}, [query, servers]);
	const isDirty =
		editor !== null && JSON.stringify(editor) !== JSON.stringify(savedEditor);

	useEffect(() => {
		if (editor || servers.length === 0) return;
		const selected =
			servers.find((server) => server.name === selectedName) ?? servers[0];
		if (!selected) return;
		const nextEditor = toEditorValue(selected);
		setSelectedName(selected.name);
		setEditor(nextEditor);
		setSavedEditor(nextEditor);
	}, [editor, selectedName, servers]);

	const save = useMutation({
		mutationFn: async (value: GlobalMcpEditorValue) => {
			if (!hostUrl) throw new Error("Host service is unavailable");
			return getHostServiceClientByUrl(
				hostUrl,
			).settings.globalMcp.upsert.mutate({
				...(value.originalName ? { originalName: value.originalName } : {}),
				server:
					value.transport === "stdio"
						? {
								type: "stdio" as const,
								name: value.name.trim(),
								command: value.command.trim(),
								args: value.argsText
									.split("\n")
									.filter((arg) => arg.length > 0),
								env: parseKeyValues(value.envText, "环境变量"),
								enabled: value.enabled,
							}
						: {
								type: value.transport,
								name: value.name.trim(),
								url: value.url.trim(),
								headers: parseKeyValues(value.headersText, "请求头"),
								enabled: value.enabled,
							},
			});
		},
		onSuccess: ({ server }) => {
			void queryClient.invalidateQueries({ queryKey });
			const nextEditor = toEditorValue(server as GlobalMcpServer);
			setSelectedName(server.name);
			setEditor(nextEditor);
			setSavedEditor(nextEditor);
			toast.success(`已保存 ${server.name}`);
		},
		onError: (error) => toast.error(`无法保存全局 MCP：${error.message}`),
	});
	const remove = useMutation({
		mutationFn: async (name: string) => {
			if (!hostUrl) throw new Error("Host service is unavailable");
			return getHostServiceClientByUrl(
				hostUrl,
			).settings.globalMcp.remove.mutate({ name });
		},
		onSuccess: (result, removedName) => {
			setPendingDeleteName(null);
			const remainingServers = result.servers as GlobalMcpServer[];
			const nextServer = remainingServers[0];
			if (nextServer) {
				const nextEditor = toEditorValue(nextServer);
				setSelectedName(nextServer.name);
				setEditor(nextEditor);
				setSavedEditor(nextEditor);
			} else {
				setSelectedName(null);
				setEditor(null);
				setSavedEditor(null);
			}
			queryClient.setQueryData(queryKey, {
				configPath: settings.data?.configPath ?? "",
				servers: remainingServers,
			});
			void queryClient.invalidateQueries({ queryKey });
			toast.success(`已删除 ${removedName}`);
		},
		onError: (error) => toast.error(`无法删除全局 MCP：${error.message}`),
	});

	const applySelection = ({
		selectedName: nextSelectedName,
		editor: nextEditor,
	}: PendingSelection) => {
		setSelectedName(nextSelectedName);
		setEditor(nextEditor);
		setSavedEditor(nextSelectedName ? nextEditor : null);
		setPendingSelection(null);
	};
	const requestSelection = (selection: PendingSelection) => {
		if (isDirty) {
			setPendingSelection(selection);
			return;
		}
		applySelection(selection);
	};
	const selectServer = (server: GlobalMcpServer) => {
		requestSelection({
			selectedName: server.name,
			editor: toEditorValue(server),
		});
	};
	const createServer = () => {
		requestSelection({ selectedName: null, editor: { ...EMPTY_EDITOR } });
	};

	return (
		<div className="flex h-full min-h-0 w-full bg-background">
			<aside className="flex w-[268px] min-w-[268px] flex-col border-r border-line bg-sidebar">
				<header className="flex h-[66px] items-center justify-between px-4">
					<div className="flex items-center gap-2.5 text-sm font-semibold">
						<span className="flex size-6 items-center justify-center rounded-ds-3 border border-line bg-surface text-accent">
							<LuPlugZap className="size-3.5" />
						</span>
						MCP Servers
					</div>
					<Button
						variant="ghost"
						size="icon"
						title="新建 MCP Server"
						onClick={createServer}
					>
						<LuPlus className="size-3.5" />
					</Button>
				</header>

				<div className="px-3 pb-4">
					<div className="relative">
						<LuSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-faint" />
						<Input
							value={query}
							placeholder="搜索"
							className="h-8 pl-8"
							onChange={(event) => setQuery(event.target.value)}
						/>
					</div>
				</div>
				<div className="flex items-center justify-between border-y border-line px-4 py-2 font-mono text-[9px] font-medium tracking-[0.08em] text-fg-faint">
					<span>全部</span>
					<span>{visibleServers.length}</span>
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto p-2">
					{visibleServers.map((server) => (
						<button
							key={server.name}
							type="button"
							className={cn(
								"grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded-ds-3 px-3 py-2.5 text-left transition-colors hover:bg-hover",
								selectedName === server.name && "bg-accent-tint",
							)}
							onClick={() => selectServer(server)}
						>
							<span className="min-w-0">
								<strong className="block truncate font-mono text-[11.5px] font-medium text-fg">
									{server.name}
								</strong>
								<span className="mt-1 block truncate font-mono text-[10.5px] text-fg-mute">
									{serverSummary(server)}
								</span>
							</span>
							<span
								className={cn(
									"mt-1 size-1.5 rounded-full bg-fg-faint",
									server.enabled && "bg-success",
								)}
							/>
						</button>
					))}
					{visibleServers.length === 0 && !settings.isLoading && (
						<p className="px-3 py-8 text-center text-xs text-fg-faint">
							没有匹配的 MCP Servers
						</p>
					)}
				</div>

				<footer className="flex h-11 items-center gap-2 border-t border-line px-4 text-[10px] text-fg-faint">
					<span className="size-1.5 rounded-full bg-success" />
					<span>全局可用</span>
					<span className="ml-auto truncate font-mono">
						{settings.data?.configPath ?? "~/.superset/global-mcp.json"}
					</span>
				</footer>
			</aside>

			<main className="flex min-h-0 min-w-0 flex-1 flex-col">
				<header className="flex h-[51px] items-center justify-between gap-4 border-b border-line px-5">
					<div className="flex min-w-0 items-center gap-2 text-[10.5px] text-fg-faint">
						<span>Global</span>
						<span>/</span>
						<strong className="truncate font-mono font-medium text-fg-mute">
							{editor?.name || "untitled-mcp"}
						</strong>
					</div>
					<div className="flex items-center gap-1.5">
						<span
							className={cn(
								"mr-1 flex items-center gap-1.5 text-[10px] text-fg-faint",
								isDirty && "text-warning",
							)}
						>
							<span
								className={cn(
									"size-1.5 rounded-full bg-success",
									isDirty && "bg-warning",
								)}
							/>
							{isDirty ? "未保存" : "已保存"}
						</span>
						{editor?.originalName && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="ghost" size="icon-sm">
										<LuEllipsis className="size-3.5" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="min-w-48">
									<DropdownMenuItem
										variant="destructive"
										onSelect={() =>
											setPendingDeleteName(editor.originalName ?? null)
										}
									>
										<LuTrash2 /> 删除 MCP Server
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						)}
					</div>
				</header>

				<div className="min-h-0 flex-1 overflow-y-auto">
					{settings.isError ? (
						<div className="mx-auto mt-12 max-w-xl select-text cursor-text rounded-ds-4 border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
							{settings.error.message}
						</div>
					) : editor ? (
						<GlobalMcpEditor
							value={editor}
							isSaving={save.isPending}
							onChange={setEditor}
							onSave={() => save.mutate(editor)}
						/>
					) : !settings.isLoading ? (
						<div className="flex h-full flex-col items-center justify-center gap-3 text-center">
							<LuPlugZap className="size-6 text-fg-faint" />
							<div>
								<h2 className="text-sm font-medium">还没有全局 MCP</h2>
								<p className="mt-1 text-xs text-fg-mute">
									创建后，新建或恢复的 Agent 会话会自动加载它。
								</p>
							</div>
							<Button size="sm" variant="secondary" onClick={createServer}>
								<LuPlus className="size-3.5" /> 新建 MCP Server
							</Button>
						</div>
					) : null}
				</div>
			</main>

			<AlertDialog
				open={pendingSelection !== null}
				onOpenChange={(open) => !open && setPendingSelection(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>放弃未保存的更改？</AlertDialogTitle>
						<AlertDialogDescription>
							当前 MCP Server 的修改尚未保存。继续后这些修改将丢失。
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>继续编辑</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={() =>
								pendingSelection && applySelection(pendingSelection)
							}
						>
							放弃更改
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={pendingDeleteName !== null}
				onOpenChange={(open) => !open && setPendingDeleteName(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>删除全局 MCP？</AlertDialogTitle>
						<AlertDialogDescription>
							“{pendingDeleteName}”将不再提供给后续 Agent 会话。
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>取消</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={remove.isPending}
							onClick={() =>
								pendingDeleteName && remove.mutate(pendingDeleteName)
							}
						>
							删除
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
