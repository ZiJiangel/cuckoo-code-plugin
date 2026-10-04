/**
 * DSH 兼容层 - 模块入口
 *
 * 让 Cuckoo 支持 DSH（DeepSeek Harness）风格的插件：
 *   export const name = 'my-plugin'
 *   export const inject = ['agents']
 *   export function apply(ctx, config) { ... }
 *
 * 提供：
 *   - 入口契约解析（loader）
 *   - DSH 风格上下文（context）：服务 + 事件
 *   - 5 种事件派发（events）：emit / parallel / serial / bail / waterfall
 *   - Cuckoo→DSH 事件桥（bridge）
 */
export type {
  DshPluginFn, DshPluginObject, DshPluginModule, DshContext,
  AgentsService, AgentHandle, ToolsService, SessionsService, SettingsService,
  ServiceName, EventListener, DispatchMode, LoadResult, DshScope,
} from './types.js';

export { EventBus } from './events.js';
export { createContext } from './context.js';
export type { HostCapabilities } from './context.js';

export { loadPluginModule, loadPluginSource, safeLoad, resolveEntry, checkInject, esmToCjs } from './loader.js';
export type { LoadedPlugin } from './loader.js';

export {
  registerContext, unregisterContext, clearContexts, getActiveContexts,
  bindCuckooEvents, broadcast,
} from './bridge.js';
export type { CuckooEventSource } from './bridge.js';

export {
  loadDshPlugins, unloadAllDshPlugins, getLoadedDshPluginNames,
} from './runtime.js';
export type { PendingPlugin } from './runtime.js';

export { loadUiPlugins, unloadAllUiPlugins } from './ui-runtime.js';
export type { PendingUiPlugin } from './ui-runtime.js';

export { parseCordisPatch, hasPatchDeclared } from './patch.js';
export type { PatchInsert, PatchParseResult } from './patch.js';

export { ServiceRegistryImpl, serviceRegistry } from './service-registry.js';
export type { ServiceRegistryInternal } from './service-registry.js';

export { PluginHost, diagnose } from './plugin-host.js';
export type { PluginKind, PluginRecord, LoadFailure, PendingPluginSource } from './plugin-host.js';
