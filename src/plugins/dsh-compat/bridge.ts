/**
 * DSH 兼容层 - 事件桥
 *
 * 把 Cuckoo 已有的事件源，转成 DSH 标准事件名派发给插件：
 *   Cuckoo onInterceptedResponse → DSH 'session/event' + 'agent/turn-end'
 *   Cuckoo onStream             → DSH 'agent/assistant-stream'
 *   Cuckoo onTaskIdle           → DSH 'agent/task-idle'
 *
 * 每个已加载的插件上下文都持有自己的 EventBus，
 * 这里维护"活跃插件列表"，事件到来时逐个派发。
 */
import type { DshContext } from './types.js';

/** 活跃插件上下文集合 */
const activeContexts = new Set<DshContext>();

export function registerContext(ctx: DshContext): void {
  activeContexts.add(ctx);
}

export function unregisterContext(ctx: DshContext): void {
  activeContexts.delete(ctx);
}

export function clearContexts(): void {
  activeContexts.clear();
}

export function getActiveContexts(): DshContext[] {
  return Array.from(activeContexts);
}

/** 向所有活跃插件派发 emit 事件 */
function broadcast(event: string, ...args: any[]): void {
  for (const ctx of activeContexts) {
    const bus = (ctx as any).__bus;
    if (bus && typeof bus.emit === 'function') {
      try {
        bus.emit(event, ...args);
      } catch (err) {
        console.error('[dsh-compat] 派发事件失败 (' + event + '):', err);
      }
    }
  }
}

/**
 * 绑定 Cuckoo 事件源（由 bridge/entry 在初始化时调用）
 * @param src Cuckoo 的事件订阅接口
 */
export interface CuckooEventSource {
  onInterceptedResponse(cb: (text: string, meta: any) => void): () => void;
  onStream(cb: (ev: { think?: string; text?: string; finished?: boolean }) => void): () => void;
  onTaskIdle(cb: () => void): () => void;
}

export function bindCuckooEvents(src: CuckooEventSource): () => void {
  const d1 = src.onInterceptedResponse((text, meta) => {
    const tokenUsage = meta && meta.tokenUsage ? meta.tokenUsage : null;
    // DSH 标准事件：session/event（持久事实）+ agent/turn-end（控制）
    broadcast('session/event', {
      type: 'assistant/message',
      text,
      tokenUsage,
      raw: meta,
    });
    broadcast('agent/turn-end', { text, tokenUsage });
  });

  const d2 = src.onStream((ev) => {
    // DSH 标准事件：agent/assistant-stream（逐字流）
    broadcast('agent/assistant-stream', {
      frame: { think: ev.think || '', text: ev.text || '', finished: !!ev.finished },
    });
  });

  const d3 = src.onTaskIdle(() => {
    broadcast('agent/task-idle', {});
  });

  return () => {
    d1(); d2(); d3();
  };
}

export { broadcast };
