/**
 * DSH 兼容层 - UI 扩展运行时
 *
 * 加载插件的 ui/*.js，把 UI 扩展注入页面。
 *
 * UI 扩展契约（DSH 风格）：
 *   export const name = 'my-ui'
 *   export const inject = ['agents']
 *   export function apply(ctx, config) { ... }
 *
 * UI 上下文 ctx 在普通 ctx 基础上，额外提供：
 *   ctx.ui.mount(el)     - 把 DOM 挂到页面
 *   ctx.ui.root()        - 取根容器
 *   ctx.ui.css(text)     - 注入样式
 *   ctx.ui.onResize(cb)  - 监听窗口尺寸
 *
 * 这样桌宠这类 UI 插件就能：用 ctx.on(...) 感知 agent 状态 + 用 ctx.ui.mount 画界面。
 */
import { loadPluginSource, safeLoad } from './loader.js';
import { serviceRegistry } from './service-registry.js';
import type { LoadedPlugin } from './loader.js';
import type { HostCapabilities } from './context.js';
import { registerContext, unregisterContext, bindCuckooEvents } from './bridge.js';
import type { CuckooEventSource } from './bridge.js';

/** UI 扩展的根容器 id 前缀 */
const UI_ROOT_PREFIX = 'cuckoo-plugin-ui-';

/** 已加载的 UI 插件 */
const loaded: LoadedPlugin[] = [];
let unbindEvents: (() => void) | null = null;

/** 待加载的 UI 插件 */
export interface PendingUiPlugin {
  name: string;
  source: string;
}

/** UI 能力对象 */
interface UiFacade {
  mount(el: any): void;
  root(): any;
  css(text: string): void;
  onResize(cb: (w: number, h: number) => void): () => void;
}

/** 给某个 ctx 扩展 UI 能力 */
function attachUi(ctx: any, pluginName: string): void {
  const rootId = UI_ROOT_PREFIX + pluginName;
  let rootEl: any = null;

  const ensureRoot = (): any => {
    if (rootEl && rootEl.isConnected) return rootEl;
    rootEl = document.getElementById(rootId);
    if (!rootEl) {
      rootEl = document.createElement('div');
      rootEl.id = rootId;
      rootEl.style.cssText = 'position:fixed;z-index:2147483000;pointer-events:none;';
      // 子元素默认可交互（桌宠需要），由插件自行覆盖
      document.body.appendChild(rootEl);
    }
    return rootEl;
  };

  const ui: UiFacade = {
    mount(el: any) {
      if (!el) return;
      const root = ensureRoot();
      el.style.pointerEvents = 'auto';
      root.appendChild(el);
    },
    root() {
      return ensureRoot();
    },
    css(text: string) {
      if (typeof text !== 'string' || !text) return;
      const style = document.createElement('style');
      style.setAttribute('data-plugin', pluginName);
      style.textContent = text;
      document.head.appendChild(style);
    },
    onResize(cb: (w: number, h: number) => void) {
      if (typeof cb !== 'function') return () => {};
      const handler = () => cb(window.innerWidth, window.innerHeight);
      window.addEventListener('resize', handler);
      return () => window.removeEventListener('resize', handler);
    },
  };

  ctx.ui = ui;
  // 记录清理器：卸载时移除根容器
  const disposers: Array<() => void> = (ctx as any).__disposers || [];
  disposers.push(() => {
    try {
      const el = document.getElementById(rootId);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    } catch (_) { /* ignore */ }
  });
}

/**
 * 加载一组 UI 扩展
 */
export function loadUiPlugins(plugins: PendingUiPlugin[], host: HostCapabilities, eventSource?: CuckooEventSource): { loaded: string[]; failed: Array<{ name: string; error: string }> } {
  const okNames: string[] = [];
  const failures: Array<{ name: string; error: string }> = [];

  for (const p of plugins) {
    const result = safeLoad(() => loadPluginSource(p.source, host, p.name, undefined, serviceRegistry));
    if (result.ok && result.plugin) {
      attachUi(result.plugin.ctx, result.plugin.name);
      loaded.push(result.plugin);
      registerContext(result.plugin.ctx);
      okNames.push(result.plugin.name);
    } else {
      failures.push({ name: p.name, error: result.error || '未知错误' });
      console.error('[dsh-compat] 加载 UI 插件失败 (' + p.name + '):', result.error);
    }
  }

  if (eventSource && !unbindEvents) {
    unbindEvents = bindCuckooEvents(eventSource);
  }

  return { loaded: okNames, failed: failures };
}

/** 卸载所有已加载的 UI 插件 */
export function unloadAllUiPlugins(): void {
  for (const p of loaded) {
    try {
      unregisterContext(p.ctx);
      p.dispose();
    } catch (err) {
      console.error('[dsh-compat] 卸载 UI 插件失败 (' + p.name + '):', err);
    }
  }
  loaded.length = 0;
  if (unbindEvents) {
    unbindEvents();
    unbindEvents = null;
  }
}

export { safeLoad, attachUi };
