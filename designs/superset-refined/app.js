(() => {
  const prototype = document.querySelector('.prototype');
  const appShell = document.querySelector('#appShell');
  const toast = document.querySelector('#toast');
  const toastText = document.querySelector('#toastText');
  const composerInput = document.querySelector('#composerInput');
  const conversation = document.querySelector('.conversation');
  const composerSpacer = document.querySelector('.composer-spacer');
  let toastTimer;

  const fileDiffs = {
    sidebar: {
      parent: 'apps/desktop/src',
      name: 'Sidebar.tsx',
      count: '+52 −12',
      lines: [
        ['context', '118', 'const activeProject = useProjectContext()'],
        ['removed', '119', '- return <Sidebar project={project} />'],
        ['added', '119', '+ return <Sidebar density="calm" project={project} />'],
        ['context', '120', ' '],
        ['added', '121', '+ <ProjectTree collapseEmptyGroups />'],
      ],
    },
    workspace: {
      parent: 'apps/desktop/src',
      name: 'WorkspaceShell.tsx',
      count: '+61 −10',
      lines: [
        ['context', '41', 'const reviewOpen = useReviewPanel()'],
        ['removed', '42', '- <WorkspaceGrid gap={0}>'],
        ['added', '42', '+ <WorkspaceGrid gap="quiet">'],
        ['context', '43', '  <Conversation />'],
        ['added', '44', '+ <ReviewPanel collapsedPath />'],
      ],
    },
    tokens: {
      parent: 'apps/desktop/src/styles',
      name: 'tokens.css',
      count: '+29 −6',
      lines: [
        ['context', '12', ':root {'],
        ['removed', '13', '- --surface-active: #393041;'],
        ['added', '13', '+ --surface-active: color-mix(in srgb, var(--accent) 12%, var(--surface));'],
        ['context', '14', '  --radius-control: 6px;'],
        ['added', '15', '+ --text-reading: 15px;'],
      ],
    },
  };

  const showToast = (message) => {
    toastText.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2200);
  };

  const setTheme = (theme) => {
    prototype.dataset.theme = theme;
    document.querySelectorAll('[data-theme-choice]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.themeChoice === theme);
    });
    try {
      window.localStorage.setItem('superset-refined-theme', theme);
    } catch {
      // Local storage is optional in the static prototype.
    }
    showToast(`已切换到 ${theme === 'graphite' ? '石墨' : theme === 'paper' ? '暖白' : '灰紫'}`);
  };

  document.querySelectorAll('[data-theme-choice]').forEach((button) => {
    button.addEventListener('click', () => setTheme(button.dataset.themeChoice));
  });

  document.querySelector('#modelSelect').addEventListener('change', (event) => {
    showToast(`已切换模型：${event.target.value}`);
  });

  try {
    const savedTheme = window.localStorage.getItem('superset-refined-theme');
    if (savedTheme && ['graphite', 'paper', 'plum'].includes(savedTheme)) {
      prototype.dataset.theme = savedTheme;
      document.querySelectorAll('[data-theme-choice]').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.themeChoice === savedTheme);
      });
    }
  } catch {
    // Local storage is optional in the static prototype.
  }

  const activateView = (viewName) => {
    appShell.classList.toggle('global-view', viewName !== 'workspace');
    document.querySelectorAll('[data-view]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.view === viewName);
    });
    document.querySelectorAll('[data-view-panel]').forEach((panel) => {
      panel.classList.toggle('is-visible', panel.dataset.viewPanel === viewName);
    });
    if (viewName === 'workspace') {
      showToast('已回到当前工作区');
    } else {
      const labels = { automations: '自动化', todos: '待办', memory: '项目记忆' };
      showToast(`已打开${labels[viewName]}`);
    }
  };

  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => activateView(button.dataset.view));
  });

  document.querySelectorAll('[data-project-toggle]').forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const group = toggle.closest('[data-project-group]');
      const isOpen = group.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    });
  });

  const toggleReview = () => {
    appShell.classList.toggle('review-collapsed');
    if (!appShell.classList.contains('review-collapsed')) {
      appShell.classList.remove('focus-mode');
    }
    showToast(appShell.classList.contains('review-collapsed') ? '已收起变更预览' : '已展开变更预览');
  };

  const toggleFocus = () => {
    appShell.classList.toggle('focus-mode');
    appShell.classList.remove('review-collapsed');
    showToast(appShell.classList.contains('focus-mode') ? '已进入专注模式' : '已退出专注模式');
  };

  document.querySelector('#toggleReview').addEventListener('click', toggleReview);
  document.querySelector('#closeReview').addEventListener('click', toggleReview);
  document.querySelector('#toggleFocus').addEventListener('click', toggleFocus);

  const renderDiff = (fileKey) => {
    const file = fileDiffs[fileKey];
    if (!file) return;
    document.querySelector('#diffParent').textContent = file.parent;
    document.querySelector('#diffName').textContent = file.name;
    document.querySelector('.diff-file-count').textContent = file.count;
    document.querySelector('#diffPreview').innerHTML = file.lines
      .map(([kind, lineNumber, code]) => `<div class="diff-line ${kind}"><span>${lineNumber}</span><code>${escapeHtml(code)}</code></div>`)
      .join('');
  };

  const escapeHtml = (value) => value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

  document.querySelectorAll('[data-file]').forEach((fileButton) => {
    fileButton.addEventListener('click', () => {
      document.querySelectorAll('[data-file]').forEach((button) => button.classList.remove('is-selected'));
      fileButton.classList.add('is-selected');
      renderDiff(fileButton.dataset.file);
      showToast(`正在查看 ${fileDiffs[fileButton.dataset.file].name}`);
    });
  });

  const conversationScroller = document.querySelector('.conversation-scroller');
  const terminalView = document.querySelector('#terminalView');
  const sessionContext = document.querySelector('#sessionContext');
  const conversationDate = document.querySelector('#conversationDate');
  const conversationWorkspace = document.querySelector('#conversationWorkspace');
  const sessionPresets = {
    refresh: { context: '正在协作 · UI refresh', date: '今天 16:42', workspace: '工作区 · Superset' },
    sidebar: { context: '正在协作 · Sidebar hierarchy', date: '昨天 11:08', workspace: '工作区 · Superset' },
    terminal: { context: '本地终端 · Superset', date: '刚刚', workspace: '终端 · ~/Code/superset' },
  };

  const initialAssistant = document.querySelector('.assistant-message .message-body').innerHTML;
  const initialUser = document.querySelector('.user-message .message-body p').textContent;
  const activateSession = (sessionKey) => {
    const preset = sessionPresets[sessionKey] || sessionPresets.refresh;
    sessionContext.textContent = preset.context;
    conversationDate.textContent = preset.date;
    conversationWorkspace.textContent = preset.workspace;
    const terminalActive = sessionKey === 'terminal';
    conversationScroller.style.display = terminalActive ? 'none' : 'block';
    terminalView.classList.toggle('is-visible', terminalActive);
    document.querySelector('.composer-wrap').style.display = terminalActive ? 'none' : '';
    document.querySelector('.assistant-message .message-body').innerHTML = sessionKey === 'sidebar'
      ? '<div class="message-heading"><strong>Codex</strong><span>昨天 11:08</span></div><p>项目导航已整理成两层：项目与工作区。当前工作区保留淡色底，其他项目用留白区分。</p><p>右侧继续保留文件审阅上下文；进入专注模式后，两侧导航一起收起。</p>'
      : initialAssistant;
    document.querySelector('.user-message .message-body p').textContent = sessionKey === 'sidebar' ? '把侧栏层级整理得更清楚一些。' : initialUser;
    document.querySelectorAll('.session-tab').forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.session === sessionKey)));
    document.querySelector('.composer-context > span:nth-child(2)').textContent = 'Superset · ' + (sessionKey === 'sidebar' ? 'Sidebar hierarchy' : 'UI refresh');
  };

  document.querySelectorAll('.session-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.session-tab').forEach((item) => item.classList.remove('is-active'));
      tab.classList.add('is-active');
      activateSession(tab.dataset.session);
      showToast(`已切换到 ${tab.textContent.trim().replace('×', '')}`);
    });
  });

  document.querySelectorAll('.toolbar-tabs, .memory-toolbar').forEach((toolbar) => {
    toolbar.querySelectorAll('.toolbar-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        toolbar.querySelectorAll('.toolbar-tab').forEach((item) => item.classList.remove('is-active'));
        tab.classList.add('is-active');
        if (toolbar.classList.contains('toolbar-tabs')) {
          const label = tab.textContent.trim();
          document.querySelectorAll('.automation-row').forEach(row => {
            row.hidden = !label.startsWith('全部') && !label.startsWith(row.querySelector('.row-status').textContent.trim());
          });
        }
      });
    });
  });

  document.querySelectorAll('.todo-row input').forEach((input) => {
    input.addEventListener('change', () => {
      input.closest('.todo-row').classList.toggle('is-done', input.checked);
      const total = document.querySelectorAll('.todo-row input').length;
      const done = document.querySelectorAll('.todo-row input:checked').length;
      document.querySelectorAll('.todo-summary strong')[0].textContent = total - done;
      document.querySelectorAll('.todo-summary strong')[1].textContent = done;
      document.querySelector('[data-view="todos"] .nav-count').textContent = total - done;
      showToast(input.checked ? '已完成一项待办' : '已恢复一项待办');
    });
  });

  const memorySearch = document.querySelector('.memory-search input');
  memorySearch.addEventListener('input', () => {
    const query = memorySearch.value.trim().toLowerCase();
    document.querySelectorAll('.memory-item').forEach((item) => {
      item.style.display = !query || item.textContent.toLowerCase().includes(query) ? 'flex' : 'none';
    });
  });

  const appendUserMessage = (value) => {
    const message = document.createElement('article');
    message.className = 'message user-message';
    message.innerHTML = `<div class="message-avatar user-avatar">W</div><div class="message-body"><div class="message-heading"><strong>你</strong><span>刚刚</span></div><p></p></div>`;
    message.querySelector('p').textContent = value;
    conversation.insertBefore(message, composerSpacer);
    return message;
  };

  const appendAssistantReply = () => {
    const reply = document.createElement('article');
    reply.className = 'message assistant-message';
    reply.innerHTML = '<div class="message-avatar assistant-avatar"><svg class="icon"><use href="#i-spark"></use></svg></div><div class="message-body"><div class="message-heading"><strong>Codex</strong><span>刚刚</span></div><p>本地演示：已收到这条消息。这里不会连接真实 agent，只用于预览会话追加后的阅读节奏。</p></div>';
    conversation.insertBefore(reply, composerSpacer);
    window.requestAnimationFrame(() => {
      conversationScroller.scrollTo({ top: conversationScroller.scrollHeight, behavior: 'smooth' });
    });
  };

  const sendMessage = () => {
    const value = composerInput.value.trim();
    if (!value) {
      composerInput.focus();
      showToast('先输入一点内容');
      return;
    }
    appendUserMessage(value);
    composerInput.value = '';
    showToast('本地演示：消息已加入当前会话');
    window.setTimeout(appendAssistantReply, 620);
    window.setTimeout(() => conversationScroller.scrollTo({ top: conversationScroller.scrollHeight, behavior: 'smooth' }), 50);
  };

  document.querySelector('#sendMessage').addEventListener('click', sendMessage);
  composerInput.addEventListener('keydown', (event) => {
    if (event.isComposing || event.key === 'Enter' && !event.shiftKey) {
      if (event.isComposing) return;
      event.preventDefault();
      sendMessage();
    }
  });

  document.querySelectorAll('.workspace-switch, .branch-select, .composer-link').forEach((button) => {
    button.addEventListener('click', () => showToast('示例交互：此控件在真实应用中会打开选择器'));
  });

  document.querySelectorAll('.primary-button').forEach((button) => {
    button.addEventListener('click', () => showToast('示例交互：已准备创建流程'));
  });

  document.querySelectorAll('button.control-chip').forEach(button => {
    button.addEventListener('click', () => {
      const label = button.querySelector('span');
      label.textContent = label.textContent === '高推理' ? '标准推理' : '高推理';
      showToast('本地演示：' + label.textContent);
    });
  });
  document.querySelectorAll('button').forEach(button => {
    if (!button.dataset.view && !button.dataset.session && !button.dataset.file && !button.dataset.projectToggle && !button.dataset.themeChoice && !button.id && !button.matches('.control-chip, .toolbar-tab, .workspace-switch, .branch-select, .composer-link, .primary-button')) {
      button.addEventListener('click', () => showToast('设计预览：此入口尚未连接业务流程'));
    }
  });
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      showToast('命令菜单示例 · ⌘ K');
    }
  });
})();
