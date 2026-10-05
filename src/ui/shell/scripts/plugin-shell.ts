/**
 * 插件界面挂载：接收主进程 'shell-plugin-mount'，往壳页面挂插件 UI。
 * 支持的挂载点：statusbar（状态栏项）、toolbar（工具栏按钮）、sidebar（侧边栏页）。
 */
import { api } from './shared.js';

interface MountSpec {
  pluginId: string;
  target: 'statusbar' | 'toolbar' | 'sidebar';
  id: string;
  spec: any;
}

const mountedStatus = new Set<string>();
const mountedToolbar = new Set<string>();

function mountStatusbar(m: MountSpec): void {
  const key = m.pluginId + ':' + m.id;
  if (mountedStatus.has(key)) return;
  mountedStatus.add(key);
  const bar = document.querySelector('.statusbar');
  if (!bar) return;
  const el = document.createElement('div');
  el.className = 'sb-item';
  el.setAttribute('data-plugin', m.pluginId);
  el.setAttribute('data-plugin-id', m.id);
  if (m.spec && m.spec.title) el.title = String(m.spec.title);
  el.innerHTML = '<span class="sb-label">' + escapeHtml((m.spec && m.spec.text) || '') + '</span>';
  // 插到末尾（sb-spacer 之前）
  const spacer = bar.querySelector('.sb-spacer');
  if (spacer && spacer.parentNode === bar) bar.insertBefore(el, spacer);
  else bar.appendChild(el);
}

function mountToolbar(m: MountSpec): void {
  const key = m.pluginId + ':' + m.id;
  if (mountedToolbar.has(key)) return;
  mountedToolbar.add(key);
  const bar = document.querySelector('.toolbar');
  if (!bar) return;
  const btn = document.createElement('button');
  btn.className = 'nav-btn';
  btn.setAttribute('data-plugin', m.pluginId);
  btn.setAttribute('data-plugin-id', m.id);
  if (m.spec && m.spec.title) btn.title = String(m.spec.title);
  btn.textContent = (m.spec && m.spec.label) || m.id;
  btn.addEventListener('click', () => {
    try {
      const cb = (window as any).__cuckooPluginToolbarCbs && (window as any).__cuckooPluginToolbarCbs[key];
      if (typeof cb === 'function') cb();
    } catch (_) {}
  });
  bar.appendChild(btn);
}

function mountSidebar(m: MountSpec): void {
  // 侧边栏页（最小可用：往侧边栏尾部加一个面板）
  const key = m.pluginId + ':' + m.id;
  const bar = document.getElementById('ck-sidebar');
  if (!bar) return;
  if (bar.querySelector('[data-plugin-panel="' + key + '"]')) return;
  const panel = document.createElement('div');
  panel.className = 'ck-panel';
  panel.setAttribute('data-plugin-panel', key);
  panel.style.display = 'none';
  panel.innerHTML = (m.spec && m.spec.html) || '<div style="padding:12px;color:var(--ck-text-dim);font-size:12px">' + escapeHtml((m.spec && m.spec.title) || m.id) + '</div>';
  bar.appendChild(panel);
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export function initPluginShell(): void {
  try {
    const apiAny: any = api as any;
    if (apiAny && typeof apiAny.onPluginShellMount === 'function') {
      apiAny.onPluginShellMount((m: MountSpec) => {
        try {
          if (!m || !m.target) return;
          if (m.target === 'statusbar') mountStatusbar(m);
          else if (m.target === 'toolbar') mountToolbar(m);
          else if (m.target === 'sidebar') mountSidebar(m);
        } catch (_) {}
      });
    }
  } catch (_) {}
}
