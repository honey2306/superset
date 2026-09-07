const skills = [
  {
    name: "diagnose",
    description: "复杂 Bug 与性能回退的结构化诊断流程",
    time: "刚刚",
    body: `# Diagnose

先复现，再缩小问题范围。不要根据表象直接修改代码。

## 工作流

1. 记录最小复现路径和可观察证据
2. 明确当前假设，以及能证伪它的检查
3. 定位根因后再实现修复
4. 添加回归测试并复跑原始路径

## 交付

区分已验证事实、推断和仍未确认的风险。`,
  },
  {
    name: "prototype",
    description: "用最小可运行原型回答产品或状态问题",
    time: "昨天",
    body: `# Prototype

构建足以回答当前问题的最小原型，不提前生产化。

默认只做一个聚焦方向；只有比较本身是问题时才提供多个版本。`,
  },
  {
    name: "handoff",
    description: "把当前工作压缩成可继续执行的交接文档",
    time: "9月 3日",
    body: `# Handoff

记录目标、已完成工作、关键决策、变更文件、验证结果和明确的下一步。`,
  },
  {
    name: "grill-me",
    description: "通过聚焦访谈压力测试计划和设计",
    time: "8月 29日",
    body: `# Grill me

围绕真正影响执行的决策提问。问题应有边界，避免泛泛而谈。`,
  },
  {
    name: "caveman",
    description: "极简但保持技术准确的沟通模式",
    time: "8月 20日",
    body: `# Caveman

仅在用户明确要求时启用。压缩表达，不损失技术准确性。`,
  },
];

const nav = document.getElementById("skillNav");
const search = document.getElementById("searchInput");
const count = document.getElementById("skillCount");
const title = document.getElementById("titleInput");
const description = document.getElementById("descriptionInput");
const body = document.getElementById("bodyInput");
const pathName = document.getElementById("pathName");
const filePath = document.getElementById("filePath");
const saveState = document.getElementById("saveState");
const toast = document.getElementById("toast");
const moreMenu = document.getElementById("moreMenu");
const confirmLayer = document.getElementById("confirmLayer");
const editMode = document.getElementById("editMode");
const previewMode = document.getElementById("previewMode");
const markdownPreview = document.getElementById("markdownPreview");
let selected = skills[0];
let dirty = false;

function icon(id) {
  return `<svg><use href="#${id}"></use></svg>`;
}

function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderInlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function renderMarkdown(source) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const rendered = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (/^```/.test(line)) {
      const language = line.slice(3).trim();
      const codeLines = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) codeLines.push(lines[index++]);
      rendered.push(`<pre data-language="${escapeHtml(language)}"><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    } else if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^#+/)[0].length;
      rendered.push(`<h${level}>${renderInlineMarkdown(line.slice(level + 1))}</h${level}>`);
    } else if (/^>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ""));
      rendered.push(`<blockquote>${renderInlineMarkdown(quote.join(" "))}</blockquote>`);
      continue;
    } else if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        const item = lines[index++].replace(/^[-*]\s+/, "");
        const task = item.match(/^\[([ xX])\]\s+(.*)$/);
        items.push(task ? `<li><input type="checkbox" disabled ${task[1].toLowerCase() === "x" ? "checked" : ""}>${renderInlineMarkdown(task[2])}</li>` : `<li>${renderInlineMarkdown(item)}</li>`);
      }
      rendered.push(`<ul>${items.join("")}</ul>`);
      continue;
    } else if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) items.push(`<li>${renderInlineMarkdown(lines[index++].replace(/^\d+\.\s+/, ""))}</li>`);
      rendered.push(`<ol>${items.join("")}</ol>`);
      continue;
    } else if (/^---+$/.test(line.trim())) {
      rendered.push("<hr>");
    } else if (line.trim()) {
      const paragraph = [line.trim()];
      index += 1;
      while (index < lines.length && lines[index].trim() && !/^(#{1,3}\s|>|[-*]\s+|\d+\.\s+|```|---+$)/.test(lines[index])) paragraph.push(lines[index++].trim());
      rendered.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
      continue;
    }
    index += 1;
  }
  return rendered.join("");
}

function setMarkdownMode(mode) {
  const isPreview = mode === "preview";
  if (isPreview) markdownPreview.innerHTML = renderMarkdown(body.value);
  body.hidden = isPreview;
  markdownPreview.hidden = !isPreview;
  editMode.classList.toggle("is-active", !isPreview);
  previewMode.classList.toggle("is-active", isPreview);
  editMode.setAttribute("aria-selected", String(!isPreview));
  previewMode.setAttribute("aria-selected", String(isPreview));
}

function renderList() {
  const query = search.value.trim().toLowerCase();
  const visible = skills.filter((skill) => `${skill.name} ${skill.description}`.toLowerCase().includes(query));
  count.textContent = String(visible.length);
  nav.innerHTML = visible.map((skill) => `
    <button type="button" class="skill-item ${skill.name === selected.name ? "is-active" : ""}" data-name="${skill.name}">
      <span class="skill-copy"><strong>${skill.name}</strong><span>${skill.description}</span></span>
      <span class="skill-time">${skill.time}</span>
    </button>`).join("");
  nav.querySelectorAll(".skill-item").forEach((item) => {
    item.addEventListener("click", () => selectSkill(item.dataset.name));
  });
}

function selectSkill(name) {
  const next = skills.find((skill) => skill.name === name);
  if (!next) return;
  selected = next;
  title.value = next.name;
  description.value = next.description;
  body.value = next.body;
  pathName.textContent = next.name;
  filePath.textContent = `~/.agents/skills/${next.name}/SKILL.md`;
  dirty = false;
  updateSaveState();
  renderList();
  autoSizeDescription();
}

function updateSaveState() {
  saveState.classList.toggle("is-dirty", dirty);
  saveState.innerHTML = `<i></i>${dirty ? "未保存" : "已保存"}`;
}

function markDirty() {
  dirty = true;
  pathName.textContent = title.value || "untitled-skill";
  filePath.textContent = `~/.agents/skills/${title.value || "untitled-skill"}/SKILL.md`;
  updateSaveState();
}

function autoSizeDescription() {
  description.style.height = "auto";
  description.style.height = `${Math.max(32, description.scrollHeight)}px`;
}

function showToast(label) {
  toast.querySelector("span").textContent = label;
  toast.classList.add("is-visible");
  window.setTimeout(() => toast.classList.remove("is-visible"), 1800);
}

search.addEventListener("input", renderList);
[title, body].forEach((input) => input.addEventListener("input", markDirty));
description.addEventListener("input", () => { autoSizeDescription(); markDirty(); });
document.getElementById("saveButton").addEventListener("click", () => {
  dirty = false;
  selected.name = title.value.trim() || "untitled-skill";
  selected.description = description.value.trim();
  selected.body = body.value;
  selected.time = "刚刚";
  updateSaveState();
  renderList();
  showToast(`已保存 ${selected.name}`);
});
document.getElementById("newSkill").addEventListener("click", () => {
  const next = { name: "untitled-skill", description: "描述这个 Skill 应该在什么时候使用", time: "新建", body: "# Untitled skill\n\n写下 Agent 应遵循的步骤和约束。" };
  skills.unshift(next);
  selected = next;
  selectSkill(next.name);
  title.focus();
  title.select();
});
document.getElementById("moreButton").addEventListener("click", () => { moreMenu.hidden = !moreMenu.hidden; });
editMode.addEventListener("click", () => setMarkdownMode("edit"));
previewMode.addEventListener("click", () => setMarkdownMode("preview"));
document.getElementById("deleteButton").addEventListener("click", () => {
  moreMenu.hidden = true;
  document.getElementById("deleteName").textContent = title.value;
  confirmLayer.hidden = false;
});
document.getElementById("cancelDelete").addEventListener("click", () => { confirmLayer.hidden = true; });
document.getElementById("confirmDelete").addEventListener("click", () => {
  confirmLayer.hidden = true;
  showToast(`已删除 ${title.value}`);
});
confirmLayer.addEventListener("click", (event) => { if (event.target === confirmLayer) confirmLayer.hidden = true; });
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    document.getElementById("saveButton").click();
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    search.focus();
  }
});

renderList();
selectSkill("diagnose");
