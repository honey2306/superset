// Mock todos data — feels like real Superset content.
// Times computed relative to a fixed "now" so the design stays stable.
const NOW = new Date("2026-08-09T09:12:00");

const TODOS = [
	{
		id: "t1",
		title: "回顾 ACP agent control-plane 的 review 意见",
		note: "PR #5741 已经有 3 条 comment,今晚前处理",
		mode: "manual",
		status: "notified",
		dueAt: new Date("2026-08-09T08:00:00"),
		project: null,
		agent: null,
	},
	{
		id: "t2",
		title: "跑一遍 e2e 测试并整理失败列表",
		note: null,
		mode: "auto",
		status: "pending",
		dueAt: new Date("2026-08-09T10:30:00"),
		project: { name: "superset", icon: "S" },
		agent: "claude-agent-acp",
		host: "MacBook Pro",
	},
	{
		id: "t3",
		title: "让 agent 起草 M6 的 exec plan",
		note: "参考 plans/acp-agent-control-plane.md 的结构",
		mode: "auto",
		status: "pending",
		dueAt: new Date("2026-08-09T14:00:00"),
		project: { name: "superset", icon: "S" },
		agent: "codex",
		host: "MacBook Pro",
	},
	{
		id: "t4",
		title: "整理本周 PR 汇报到 Slack",
		note: null,
		mode: "manual",
		status: "pending",
		dueAt: new Date("2026-08-09T17:30:00"),
		project: null,
		agent: null,
	},
	{
		id: "t5",
		title: "回一下 Linear SUPER-712 的问题",
		note: null,
		mode: "manual",
		status: "pending",
		dueAt: new Date("2026-08-10T09:00:00"),
		project: null,
		agent: null,
	},
	{
		id: "t6",
		title: "跑周报生成脚本",
		note: "对 last week 的 commits + PRs 做总结",
		mode: "auto",
		status: "pending",
		dueAt: new Date("2026-08-14T18:00:00"),
		project: { name: "mini-krow", icon: "K" },
		agent: "claude-agent-acp",
		host: "MacBook Pro",
	},
	{
		id: "t7",
		title: "看一下 terminal fusion 分支的 conflict",
		note: null,
		mode: "manual",
		status: "dispatch_failed",
		error: "target host offline",
		dueAt: new Date("2026-08-08T20:00:00"),
		project: { name: "superset", icon: "S" },
		agent: null,
	},
];

function statusOf(t) {
	if (t.status === "done") return "done";
	if (t.status === "dispatch_failed" || t.status === "skipped_offline")
		return "failed";
	if (t.dueAt < NOW) return "overdue";
	const sameDay =
		t.dueAt.getFullYear() === NOW.getFullYear() &&
		t.dueAt.getMonth() === NOW.getMonth() &&
		t.dueAt.getDate() === NOW.getDate();
	if (sameDay) return "today";
	const days = Math.round((t.dueAt - NOW) / (24 * 60 * 60 * 1000));
	if (days <= 7) return "week";
	return "later";
}

function fmtTime(d) {
	const hh = String(d.getHours()).padStart(2, "0");
	const mm = String(d.getMinutes()).padStart(2, "0");
	return `${hh}:${mm}`;
}

function fmtDay(d) {
	const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
	const sameDay =
		d.getFullYear() === NOW.getFullYear() &&
		d.getMonth() === NOW.getMonth() &&
		d.getDate() === NOW.getDate();
	if (sameDay) return "今天";
	const diff = Math.round((d - NOW) / (24 * 60 * 60 * 1000));
	if (diff === -1) return "昨天";
	if (diff === 1) return "明天";
	if (diff < 0) return `${-diff} 天前`;
	if (diff <= 7) return days[d.getDay()];
	return `${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtRelative(d) {
	const diff = d - NOW;
	const min = Math.round(diff / 60000);
	const abs = Math.abs(min);
	if (abs < 60) return diff < 0 ? `${abs}m 前` : `${abs}m 后`;
	if (abs < 60 * 24) {
		const h = Math.round(abs / 60);
		return diff < 0 ? `${h}h 前` : `${h}h 后`;
	}
	const days = Math.round(abs / (60 * 24));
	return diff < 0 ? `${days}d 前` : `${days}d 后`;
}

Object.assign(window, { NOW, TODOS, statusOf, fmtTime, fmtDay, fmtRelative });
