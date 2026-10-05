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

/** 注入/更新某插件的 <style>（data-plugin 标记，便于卸载清理） */
function applyShellStyle(pluginId: string, css: string): void {
  if (!pluginId || typeof css !== 'string') return;
  let tag = document.querySelector('style[data-plugin-style="' + pluginId + '"]') as any;
  if (!tag) {
    tag = document.createElement('style');
    tag.setAttribute('data-plugin-style', pluginId);
    document.head.appendChild(tag);
  }
  tag.textContent = css;
}

/** 移除某插件的 <style> */
function removeShellStyle(pluginId: string): void {
  if (!pluginId) return;
  const tag = document.querySelector('style[data-plugin-style="' + pluginId + '"]');
  if (tag && tag.parentNode) tag.parentNode.removeChild(tag);
}

export function initPluginShell(): void {
  const wlog: any = (window as any);
  wlog.__shellMountLog = wlog.__shellMountLog || { received: [], pulled: null };
  try {
    const apiAny: any = api as any;
    // 插件注入壳页面 CSS（对标 DSH styles.insert）
    if (apiAny && typeof apiAny.onPluginShellStyle === 'function') {
      apiAny.onPluginShellStyle((m: any) => {
        try { if (m && m.pluginId) applyShellStyle(m.pluginId, m.css); } catch (_) {}
      });
    }
    if (apiAny && typeof apiAny.onPluginShellStyleRemove === 'function') {
      apiAny.onPluginShellStyleRemove((m: any) => {
        try { if (m && m.pluginId) removeShellStyle(m.pluginId); } catch (_) {}
      });
    }
    // 插件背景图（基座负责对齐）
    const applyBg = (data: any) => {
      let tag = document.getElementById('ck-plugin-bg') as any;
      if (!data || !data.url) { if (tag) tag.remove(); return; }
      if (!tag) { tag = document.createElement('style'); tag.id = 'ck-plugin-bg'; document.head.appendChild(tag); }
      const overlay = data.overlay || 'rgba(10,12,20,0.5)';
      const w = data.winW || window.innerWidth, h = data.winH || window.innerHeight;
      tag.textContent = 'body { background: linear-gradient(' + overlay + ',' + overlay + '), url(' + data.url + ') no-repeat fixed !important;' +
        'background-size: auto, ' + w + 'px ' + h + 'px !important;' +
        'background-position: 0 0, 0 0 !important; }' +
        '.shell { background: transparent !important; }';
    };
    if (apiAny && typeof apiAny.onShellBackground === 'function') apiAny.onShellBackground(applyBg);
    if (apiAny && typeof apiAny.getShellBackground === 'function') {
      apiAny.getShellBackground().then((r: any) => { if (r && r.success) applyBg(r.background); }).catch(() => {});
    }
    if (apiAny && typeof apiAny.listPluginShellStyles === 'function') {
      apiAny.listPluginShellStyles().then((r: any) => {
        if (!r || !r.success || !Array.isArray(r.styles)) return;
        for (const s of r.styles) { try { applyShellStyle(s.pluginId, s.css); } catch (_) {} }
      }).catch(() => {});
    }
    if (apiAny && typeof apiAny.onPluginShellMount === 'function') {
      apiAny.onPluginShellMount((m: MountSpec) => {
        try {
          wlog.__shellMountLog.received.push(m && m.target + ':' + (m && m.id));
          if (!m || !m.target) return;
          if (m.target === 'statusbar') mountStatusbar(m);
          else if (m.target === 'toolbar') mountToolbar(m);
          else if (m.target === 'sidebar') mountSidebar(m);
        } catch (_) {}
      });
    }
    if (apiAny && typeof apiAny.listPluginShellMounts === 'function') {
      apiAny.listPluginShellMounts().then((r: any) => {
        wlog.__shellMountLog.pulled = r;
        if (!r || !r.success || !Array.isArray(r.mounts)) return;
        for (const m of r.mounts) {
          try {
            if (m.target === 'statusbar') mountStatusbar(m);
            else if (m.target === 'toolbar') mountToolbar(m);
            else if (m.target === 'sidebar') mountSidebar(m);
          } catch (_) {}
        }
      }).catch(() => {});
    }
  } catch (_) {}
}
