/**
 * Cuckoo 插件系统 - 主题服务（全局单例）
 *
 * 全应用共享一份 ThemeRuntime；插件通过 ctx.theme 访问它。
 * ThemeRuntime 用私有 EventBus 管理内部监听；本模块订阅它的 theme/change，
 * 再经 bridge 的 broadcast 转发给所有插件（跨插件可见）。
 *
 * 分层理由：
 *   - theme-runtime.ts 只管注册表/偏好/覆盖层，保持纯净可测
 *   - 本模块负责"提升为全局单例 + 桥接全局广播"
 */
import { EventBus } from './events.js';
import { ThemeRuntime } from './theme-runtime.js';
import type { ThemeService } from './theme-runtime.js';
import { broadcast } from './compat/bridge.js';

let singleton: ThemeRuntime | null = null;

/**
 * 取（或懒创建）全局主题服务单例。
 * 首次创建时订阅其事件，把 theme/change 转发为全局广播。
 */
export function getThemeService(): ThemeService {
  if (singleton) return singleton;
  const bus = new EventBus();
  // 桥接：本 bus 的 theme/change → 全局广播（所有插件的 ctx.on 都能收到）
  bus.on('theme/change', (snapshot: any) => {
    try { broadcast('theme/change', snapshot); } catch (_) { /* ignore */ }
  });
  singleton = new ThemeRuntime(bus);
  return singleton;
}

/** 复位单例（仅测试用） */
export function resetThemeService(): void {
  singleton = null;
}

export type { ThemeService, ThemeSnapshot } from './theme-runtime.js';
