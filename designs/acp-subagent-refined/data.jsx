// Shared data for the three SubAgent variants.
// Mirrors the fields consumed by AcpSubagentItem.tsx.

const SAMPLE = {
  agentType: "general-purpose",
  task:
    "分析 /Users/wufan/Code/Krow/krow-app 项目的依赖关系，包括：1. Rust 和前端的通信通道，2. IPC 命令边界，3. 状态同步策略",
  toolsTotal: 6,
  toolsDone: 4,
  toolsActive: 2,
  status: "running",
  elapsed: "0:42",
};

const SAMPLE_COMPLETED = {
  agentType: "Explore",
  task: "查找 renderer 侧所有直接引用 electron.ipcRenderer 的位置并归类",
  toolsTotal: 12,
  toolsDone: 12,
  toolsActive: 0,
  status: "completed",
  elapsed: "1:34",
};

const SAMPLE_FAILED = {
  agentType: "Plan",
  task: "为 AcpTimeline 补充 subagent 展开态的动画规划",
  toolsTotal: 3,
  toolsDone: 1,
  toolsActive: 0,
  status: "failed",
  elapsed: "0:19",
};

Object.assign(window, { SAMPLE, SAMPLE_COMPLETED, SAMPLE_FAILED });
