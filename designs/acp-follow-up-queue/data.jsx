// data.jsx — 三种变体共用的会话/队列 mock 数据

const CONVERSATION = [
	{
		role: "user",
		body: "帮我把 ACP 的 composer 状态迁到 host-service，之前 renderer 里那份 store 我们要留一层薄壳做 fallback。",
	},
	{
		role: "assistant",
		body: "好，我先看下 acp-session-client 里现在维护的 composer state — 主要是草稿、slash 输入态、和 in-flight 的一次性 sendId。这几个字段迁到 host-service 后，renderer 只保留纯 UI 派生（例如是否弹 slash 面板）。开始拉文件。",
	},
	{
		role: "user",
		body: "顺便把重复的 send 保护也一起搬过去，别再让 renderer 自己去 dedupe。",
	},
	{
		role: "assistant",
		body: "读到了 acp-session-client.ts:184-233 里的乐观发送分支：本地生成 sendId、写入队列、再走 tRPC。搬去 host-service 的话，dedupe 应该由 stream.ts 里的写入路径接管，renderer 只把用户意图丢过去。让我确认下…",
		streaming: true,
	},
];

const QUEUE = [
	{
		id: "q1",
		text: "同时确认下 stream.ts 里 restore 逻辑对 pending 消息的行为，别在重启后丢了。",
		status: "queued",
	},
	{
		id: "q2",
		text: "然后把 renderer 那份 useAcpSession lifecycle 测试补齐。",
		status: "queued",
	},
	{
		id: "q3",
		text: "如果 send 期间 host 断连，队列应该在 renderer 侧展示 offline 提示。",
		status: "queued",
	},
];

const DRAFT_PLACEHOLDER = "问点什么，或 / 触发命令 · 消息会自动排到队列尾部";

Object.assign(window, { CONVERSATION, QUEUE, DRAFT_PLACEHOLDER });
