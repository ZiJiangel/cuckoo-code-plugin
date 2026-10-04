/**
 * DSH 兼容层 - 类型定义
 *
 * 目标：在 Cuckoo 里模拟 DSH（DeepSeek Harness）的插件标准，
 * 让 DSH 风格插件（export const name / inject / apply(ctx)）能简单迁移过来。
 *
 * 参考 DSH 标准：
 *  - 入口契约：命名导出 name + inject + apply(ctx, config)
 *  - 服务：ctx.agents / ctx.tools / ctx.sessions ...
 *  - 事件：5 种派发模式 emit / parallel / serial / bail / waterfall
 *  - 事件域：session/event、agent/*、功能事件
 */

/** 插件可消费/提供的服务名 */
export type ServiceName = 'agents' | 'tools' | 'sessions' | 'settings' | 'logs';

/** 插件入口：函数式 */
export type DshPluginFn = (ctx: DshContext, config?: any) => void | Promise<void>;

/** 插件入口：对象式 */
export interface DshPluginObject {
  name: string;
  inject?: ServiceName[];
  apply: DshPluginFn;
}

/** 插件模块（一个 DSH 插件文件导出这些） */
export interface DshPluginModule {
  name?: string;
  inject?: ServiceName[];
  apply?: DshPluginFn;
  default?: DshPluginFn;
  [key: string]: any;
}

/** 事件监听器 */
export type EventListener = (...args: any[]) => any;

/** 事件派发模式 */
export type DispatchMode = 'emit' | 'parallel' | 'serial' | 'bail' | 'waterfall';

/** agent 服务（对应 DSH 的 ctx.agents） */
export interface AgentsService {
  /** 取当前会话的 agent 句柄（简化版） */
  get(sessionId?: string): AgentHandle | null;
  /** 列出所有会话 */
  list(): Array<{ id: string; title?: string }>;
}

/** agent 句柄 */
export interface AgentHandle {
  id: string;
  /** 向该 agent 追加一条用户消息（对应 DSH 的 followup） */
  followup(msg: { role: 'user'; content: string }): Promise<boolean>;
}

/** tools 服务（对应 DSH 的 ctx.tools） */
export interface ToolsService {
  /** 列出可用工具名 */
  list(): string[];
}

/** sessions 服务 */
export interface SessionsService {
  current(): { id: string | null; projectDir: string | null };
  list(): Array<{ id: string; title?: string }>;
}

/** settings 服务 */
export interface SettingsService {
  get(key: string): any;
  set(key: string, value: any): void;
}

/** 上下文对象（对应 DSH 的 ctx） */
export interface DshContext {
  /** 插件名 */
  readonly name: string;
  /** 记录日志 */
  log(...args: any[]): void;

  // ===== 服务 =====
  agents: AgentsService;
  tools: ToolsService;
  sessions: SessionsService;
  settings: SettingsService;

  // ===== 事件 =====
  on(event: string, listener: EventListener): () => void;
  once(event: string, listener: EventListener): () => void;
  off(event: string, listener: EventListener): void;

  emit(event: string, ...args: any[]): void;
  parallel(event: string, ...args: any[]): Promise<any[]>;
  serial(event: string, ...args: any[]): Promise<any>;
  bail(event: string, ...args: any[]): any;
  waterfall(event: string, ...args: any[]): Promise<any>;
}

/** 加载结果 */
export interface LoadResult {
  ok: boolean;
  pluginName?: string;
  error?: string;
}

export {};
