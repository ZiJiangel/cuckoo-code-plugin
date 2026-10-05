/**
 * 主进程主题管理器（权威单例）
 *
 * 主题是应用级全局状态，权威放主进程：
 *   - 持有唯一的 ThemeRuntime（纯逻辑，从 plugins/runtime 复用）
 *   - 变化时广播给所有窗口（壳页面改 --ck-* 变量；AI 页面同步）
 *   - 渲染进程的 ctx.theme 通过 IPC 代理到这里
 *
 * 与渲染进程那份的关系：
 *   - plugins/runtime/theme-runtime.ts 是平台无关纯逻辑，两处共用
 *   - 本文件是主进程权威实例；渲染进程不自己建注册表
 */
import { ThemeRuntime } from '../../plugins/runtime/theme-runtime.js';
import type { ThemeSnapshot, ThemeDefinition, ThemeTokenOverrides } from '../../plugins/runtime/theme-runtime.js';
import * as windowState from '../window.js';

let runtime: ThemeRuntime | null = null;
/** 订阅者：窗口 webContents，变化时推快照 */
const subscribers = new Set<any>();

/** 取（或懒创建）主进程主题权威实例 */
function getTheme(): ThemeRuntime {
  if (runtime) return runtime;
  const bus = {
    on() { return () => {}; },
    once() { return () => {}; },
    off() {},
    emit(event: string, ...args: any[]) {
      if (event === 'theme/change') broadcastSnapshot(args[0] as ThemeSnapshot);
    },
    async parallel() { return []; },
    async serial() { return undefined; },
    bail() { return undefined; },
    async waterfall(v: any) { return v; },
    clear() {},
  };
  runtime = new ThemeRuntime(bus as any);
  return runtime;
}

/** 当前快照 */
function snapshot(): ThemeSnapshot {
  return getTheme().getTheme();
}

/** 把一个 webContents 加入订阅（返回退订函数） */
function subscribe(webContents: any): () => void {
  subscribers.add(webContents);
  return () => { subscribers.delete(webContents); };
}

/** 变化时推送快照给所有订阅者 + 所有窗口 */
function broadcastSnapshot(snap: ThemeSnapshot): void {
  // 订阅者（显式订阅的 webContents）
  for (const wc of subscribers) {
    try { wc.send('theme-changed', snap); } catch (_) { /* ignore */ }
  }
  // 所有窗口的壳页面 + AI 页面都推一份（保证一致）
  try {
    for (const ctx of windowState.getAllContexts()) {
      try { ctx.win && ctx.win.webContents && ctx.win.webContents.send('theme-changed', snap); } catch (_) {}
      try { ctx.view && ctx.view.webContents && ctx.view.webContents.send('theme-changed', snap); } catch (_) {}
    }
  } catch (_) { /* ignore */ }
}

// ===== 供 IPC 调用的操作 =====
function setTheme(id: string): ThemeSnapshot {
  getTheme().setTheme(id);
  return snapshot();
}
function register(definition: ThemeDefinition): string {
  const dispose = getTheme().register(definition);
  // 注册表以主进程为权威；这里返回一个 token，IPC 侧据此撤销
  return storeDisposer(dispose);
}
function overrideTokens(source: string, tokens: ThemeTokenOverrides): string {
  const dispose = getTheme().overrideTokens(source, tokens);
  return storeDisposer(dispose);
}
function list(): readonly ThemeDefinition[] {
  return getTheme().list();
}

// disposer 仓库：IPC 不能传函数，用字符串 token 映射
const disposers = new Map<string, () => void>();
let disposerSeq = 0;
function storeDisposer(fn: () => void): string {
  const id = 'd' + (disposerSeq++);
  disposers.set(id, fn);
  return id;
}
function dispose(token: string): boolean {
  const fn = disposers.get(token);
  if (!fn) return false;
  disposers.delete(token);
  try { fn(); } catch (_) { /* ignore */ }
  return true;
}

export {
  getTheme, snapshot, subscribe, broadcastSnapshot,
  setTheme, register, overrideTokens, list, dispose,
};
