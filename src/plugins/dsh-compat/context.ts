/**
 * DSH 兼容层 - 上下文对象（ctx）
 *
 * 把 Cuckoo 已有的能力包装成 DSH 风格的服务 + 事件：
 *   ctx.agents   ← chat-input / 会话
 *   ctx.tools    ← 工具注册表
 *   ctx.sessions ← 会话列表
 *   ctx.on('session/event', ...)         ← onInterceptedResponse
 *   ctx.on('agent/assistant-stream', ...) ← onStream（逐字流）
 *
 * 注意：本模块运行在 **渲染进程（overlay 层）**，通过传入的能力对象与宿主交互，
 * 不直接 import 上层模块（遵守 docs/arch 依赖铁律）。
 */
import { EventBus } from './events.js';
import type {
  DshContext, AgentsService, AgentHandle, ToolsService, SessionsService, SettingsService,
} from './types.js';

/** 宿主能力（由 bridge/entry 注入，避免本模块反向依赖上层） */
export interface HostCapabilities {
  /** 发消息到当前会话（对应 chat-input.sendToChat） */
  sendToChat(text: string): Promise<boolean>;
  /** 当前会话 id（可空） */
  getCurrentSessionId(): string | null;
  /** 当前项目目录 */
  getProjectDir(): string | null;
  /** 列出会话 */
  listSessions(): Array<{ id: string; title?: string }>;
  /** 列出工具名 */
  listTools(): string[];
  /** 读 localStorage 配置 */
  getSetting(key: string): any;
  setSetting(key: string, value: any): void;
  /** 日志前缀 */
  logPrefix?: string;
}

/**
 * 创建一个 DSH 上下文的工厂
 */
function createContext(name: string, host: HostCapabilities): DshContext {
  const bus = new EventBus();
  const disposers: Array<() => void> = [];

  // ===== 服务：agents =====
  const agents: AgentsService = {
    get(_sessionId?: string): AgentHandle | null {
      const sid = host.getCurrentSessionId();
      return {
        id: sid || 'current',
        async followup(msg): Promise<boolean> {
          if (!msg || typeof msg.content !== 'string') return false;
          return host.sendToChat(msg.content);
        },
      };
    },
    list() {
      return host.listSessions();
    },
  };

  // ===== 服务：tools =====
  const tools: ToolsService = {
    list: () => host.listTools(),
  };

  // ===== 服务：sessions =====
  const sessions: SessionsService = {
    current: () => ({ id: host.getCurrentSessionId(), projectDir: host.getProjectDir() }),
    list: () => host.listSessions(),
  };

  // ===== 服务：settings =====
  const settings: SettingsService = {
    get: (key: string) => host.getSetting(key),
    set: (key: string, value: any) => host.setSetting(key, value),
  };

  const ctx: DshContext = {
    name,
    log: (...args: any[]) => console.log('[' + (host.logPrefix || 'dsh-plugin') + ':' + name + ']', ...args),

    agents,
    tools,
    sessions,
    settings,

    on(event, listener) {
      const d = bus.on(event, listener);
      disposers.push(d);
      return d;
    },
    once(event, listener) {
      const d = bus.once(event, listener);
      disposers.push(d);
      return d;
    },
    off(event, listener) {
      bus.off(event, listener);
    },

    emit: (event, ...args) => bus.emit(event, ...args),
    parallel: (event, ...args) => bus.parallel(event, ...args),
    serial: (event, ...args) => bus.serial(event, ...args),
    bail: (event, ...args) => bus.bail(event, ...args),
    waterfall: (event, value, ...args) => bus.waterfall(event, value, ...args),
  };

  // 暴露内部 bus 与清理器（供 loader 使用）
  (ctx as any).__bus = bus;
  (ctx as any).__disposers = disposers;
  (ctx as any).__dispose = () => {
    for (const d of disposers) {
      try { d(); } catch (_) { /* ignore */ }
    }
    disposers.length = 0;
    bus.clear();
  };

  return ctx;
}

export { createContext };
