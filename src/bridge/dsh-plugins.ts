/**
 * DSH 兼容层 - 渲染进程接线
 *
 * 把 Cuckoo 的运行时能力（发消息、会话、token 事件等）包装成 DSH 兼容层的宿主能力，
 * 拉取已启用插件的 dsh/*.js 源码并加载。
 *
 * 依赖方向：本模块属于 bridge 层，可依赖 overlay（发消息）。
 */
import { loadDshPlugins, unloadAllDshPlugins, loadUiPlugins, unloadAllUiPlugins } from '../plugins/dsh-compat/index.js';
import type { HostCapabilities } from '../plugins/dsh-compat/index.js';
import type { CuckooEventSource } from '../plugins/dsh-compat/index.js';
import { sendToChat } from '../overlay/chat-input.js';
import { getProviderByUrl } from '../providers/registry.js';
import { onInterceptedResponse, onStream, onTaskIdle } from './intercept/observer.js';

/** 从当前 URL 提取会话 id（对齐 events.ts 的内部实现，不依赖其导出） */
function currentSessionId(): string | null {
  try {
    const provider = getProviderByUrl(window.location.href);
    if (provider && typeof provider.extractSessionId === 'function') {
      return provider.extractSessionId(window.location.href) || null;
    }
  } catch (_) { /* ignore */ }
  return null;
}

/** 宿主能力实现 */
function buildHost(): HostCapabilities {
  return {
    sendToChat: (text: string) => sendToChat(text, 'dsh-plugin', 300),
    getCurrentSessionId: () => currentSessionId(),
    getProjectDir: () => {
      try {
        const el = document.getElementById('cuckoo-project-dir');
        return el ? (el.textContent || '').trim() || null : null;
      } catch (_) {
        return null;
      }
    },
    listSessions: () => {
      // 从 localStorage 的会话缓存读取（简化）
      try {
        const raw = localStorage.getItem('cuckoo-token-cache');
        if (!raw) return [];
        const obj = JSON.parse(raw);
        return Object.keys(obj).map((id) => ({ id }));
      } catch (_) {
        return [];
      }
    },
    listTools: () => {
      // 工具名由主进程提供，这里给常用列表（后续可 IPC 拉取）
      return ['read', 'write', 'edit', 'glob', 'grep', 'bash', 'pwsh', 'webFetch'];
    },
    getSetting: (key: string) => {
      try { const v = localStorage.getItem(key); return v === null ? undefined : v; } catch (_) { return undefined; }
    },
    setSetting: (key: string, value: any) => {
      try { localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); } catch (_) { /* ignore */ }
    },
    logPrefix: 'dsh-plugin',
  };
}

/** Cuckoo 事件源 → DSH 事件桥 */
function buildEventSource(): CuckooEventSource {
  return { onInterceptedResponse, onStream, onTaskIdle };
}

let initialized = false;

/**
 * 初始化 DSH 插件：拉源码 → 加载 → 绑定事件桥
 */
export async function initDshPlugins(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const api = (window as any).electronAPI;
  if (!api || typeof api.getDshPluginSources !== 'function') {
    console.warn('[dsh-plugin] electronAPI.getDshPluginSources 不可用，跳过');
    return;
  }

  let res: any;
  try {
    res = await api.getDshPluginSources();
  } catch (err: any) {
    console.error('[dsh-plugin] 拉取插件源码失败:', err && err.message ? err.message : err);
    return;
  }

  if (!res || !res.success || !Array.isArray(res.plugins) || res.plugins.length === 0) {
    console.log('[dsh-plugin] 没有已启用的 DSH 插件');
    return;
  }

  const host = buildHost();
  const eventSource = buildEventSource();
  const result = loadDshPlugins(res.plugins, host, eventSource);
  console.log('[dsh-plugin] 已加载 DSH 插件:', result.loaded.join(', ') || '(无)');
  if (result.failed.length > 0) {
    console.error('[dsh-plugin] DSH 插件加载失败:', result.failed.map((f) => f.name + ': ' + f.error).join(' | '));
  }

  // 加载 UI 扩展（同类插件，ui/*.js）
  await initUiPlugins(host, eventSource);
}

/** 加载 UI 扩展 */
async function initUiPlugins(host: HostCapabilities, eventSource: CuckooEventSource): Promise<void> {
  const api = (window as any).electronAPI;
  if (!api || typeof api.getUiPluginSources !== 'function') return;
  let res: any;
  try {
    res = await api.getUiPluginSources();
  } catch (err: any) {
    console.error('[dsh-plugin] 拉取 UI 插件源码失败:', err && err.message ? err.message : err);
    return;
  }
  if (!res || !res.success || !Array.isArray(res.plugins) || res.plugins.length === 0) {
    return;
  }
  const result = loadUiPlugins(res.plugins, host, eventSource);
  console.log('[dsh-plugin] 已加载 UI 插件:', result.loaded.join(', ') || '(无)');
  if (result.failed.length > 0) {
    console.error('[dsh-plugin] UI 插件加载失败:', result.failed.map((f) => f.name + ': ' + f.error).join(' | '));
  }
}

export { unloadAllDshPlugins, unloadAllUiPlugins };
