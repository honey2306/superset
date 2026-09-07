import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Switch } from "@superset/ui/switch";
import { Textarea } from "@superset/ui/textarea";
import { LuCheck, LuPlugZap } from "react-icons/lu";

export interface GlobalMcpEditorValue {
	originalName?: string;
	name: string;
	command: string;
	argsText: string;
	envText: string;
	enabled: boolean;
}

export function GlobalMcpEditor({
	value,
	isSaving,
	onChange,
	onSave,
}: {
	value: GlobalMcpEditorValue;
	isSaving: boolean;
	onChange(value: GlobalMcpEditorValue): void;
	onSave(): void;
}) {
	const canSave =
		value.name.trim().length > 0 && value.command.trim().length > 0;

	return (
		<div className="mx-auto flex min-h-full w-full max-w-[820px] flex-col px-8 pb-10 pt-14">
			<div className="mb-5 flex items-center gap-2 font-mono text-[9px] font-medium tracking-[0.12em] text-fg-faint">
				<span className="flex size-5 items-center justify-center rounded-ds-3 bg-accent-tint text-accent">
					<LuPlugZap className="size-3" />
				</span>
				GLOBAL MCP SERVER
			</div>

			<Input
				aria-label="MCP Server name"
				variant="ghost"
				value={value.name}
				placeholder="untitled-mcp"
				className="h-auto border-0 pb-0 font-mono text-[36px] font-semibold leading-tight tracking-[-0.05em] focus-visible:border-0"
				onChange={(event) => onChange({ ...value, name: event.target.value })}
			/>
			<div className="mt-3 flex items-center gap-2 text-[10px] text-fg-faint">
				<span>stdio transport</span>
				<span className="h-2.5 w-px bg-line" />
				<span>新建或恢复会话生效</span>
			</div>

			<div className="mt-10 flex items-center gap-3">
				<span className="font-mono text-[9px] font-medium tracking-[0.12em] text-fg-faint">
					STARTUP
				</span>
				<span className="h-px flex-1 bg-line" />
			</div>
			<label htmlFor="global-mcp-command" className="mt-5 block text-sm">
				<span className="font-medium">命令</span>
				<Input
					id="global-mcp-command"
					value={value.command}
					placeholder="npx"
					className="mt-2 font-mono text-xs"
					onChange={(event) =>
						onChange({ ...value, command: event.target.value })
					}
				/>
				<span className="mt-1.5 block text-xs text-fg-faint">
					启动 stdio MCP Server 的可执行命令。
				</span>
			</label>

			<div className="mt-6 grid gap-6 sm:grid-cols-2">
				<label htmlFor="global-mcp-args" className="block text-sm">
					<span className="font-medium">参数</span>
					<Textarea
						id="global-mcp-args"
						value={value.argsText}
						placeholder={"-y\n@modelcontextprotocol/server-filesystem\n/path"}
						className="mt-2 min-h-48 resize-y font-mono text-xs leading-6"
						onChange={(event) =>
							onChange({ ...value, argsText: event.target.value })
						}
					/>
					<span className="mt-1.5 block text-xs text-fg-faint">
						每行一个参数。
					</span>
				</label>
				<label htmlFor="global-mcp-env" className="block text-sm">
					<span className="font-medium">环境变量</span>
					<Textarea
						id="global-mcp-env"
						value={value.envText}
						placeholder="API_URL=https://example.com"
						className="mt-2 min-h-48 resize-y font-mono text-xs leading-6"
						onChange={(event) =>
							onChange({ ...value, envText: event.target.value })
						}
					/>
					<span className="mt-1.5 block text-xs text-fg-faint">
						每行一个 KEY=VALUE。内容仅当前用户可读；请谨慎保存密钥。
					</span>
				</label>
			</div>

			<div className="mt-8 flex items-center justify-between gap-4 border-y border-line py-4">
				<div>
					<p className="text-sm font-medium">启用 MCP Server</p>
					<p className="mt-1 text-xs text-fg-faint">
						停用后保留配置，但后续 Agent 会话不会加载。
					</p>
				</div>
				<Switch
					aria-label="启用 MCP Server"
					checked={value.enabled}
					onCheckedChange={(enabled) => onChange({ ...value, enabled })}
				/>
			</div>

			<div className="mt-auto flex items-center justify-between gap-4 border-t border-line pt-4 text-[10px] text-fg-faint">
				<span className="flex items-center gap-2">
					<span
						className={
							value.enabled
								? "size-1.5 rounded-full bg-success"
								: "size-1.5 rounded-full bg-fg-faint"
						}
					/>
					{value.enabled ? "将提供给后续会话" : "当前已停用"}
				</span>
				<Button
					variant="primary"
					size="sm"
					disabled={!canSave || isSaving}
					onClick={onSave}
				>
					<LuCheck className="size-3" />
					{isSaving ? "保存中…" : "保存"}
				</Button>
			</div>
		</div>
	);
}
