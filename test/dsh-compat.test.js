/**
 * DSH 兼容层单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../src/plugins/dsh-compat/events.js';
import { createContext } from '../src/plugins/dsh-compat/context.js';
import { loadPluginModule, safeLoad } from '../src/plugins/dsh-compat/loader.js';

/** 一个假的宿主能力 */
function fakeHost() {
  return {
    sent: [],
    async sendToChat(text) { this.sent.push(text); return true; },
    getCurrentSessionId: () => 'session-1',
    getProjectDir: () => 'D:/proj',
    listSessions: () => [{ id: 'session-1', title: 't' }],
    listTools: () => ['read', 'write'],
    getSetting: () => undefined,
    setSetting: () => {},
  };
}

describe('EventBus - 5 种派发模式', () => {
  let bus;
  beforeEach(() => { bus = new EventBus(); });

  it('emit 同步广播', () => {
    let got = null;
    bus.on('x', (v) => { got = v; });
    bus.emit('x', 42);
    expect(got).toBe(42);
  });

  it('parallel 并发收集返回值', async () => {
    bus.on('x', async () => 1);
    bus.on('x', async () => 2);
    const r = await bus.parallel('x');
    expect(r).toEqual([1, 2]);
  });

  it('serial 返回第一个非空', async () => {
    bus.on('x', async () => undefined);
    bus.on('x', async () => 'first');
    bus.on('x', async () => 'second');
    const r = await bus.serial('x');
    expect(r).toBe('first');
  });

  it('bail 同步版 serial', () => {
    bus.on('x', () => undefined);
    bus.on('x', () => 'found');
    const r = bus.bail('x');
    expect(r).toBe('found');
  });

  it('waterfall 环绕中间件', async () => {
    bus.on('x', async (val, next) => { return next(val + 1); });
    bus.on('x', async (val, next) => { return next(val * 2); });
    const r = await bus.waterfall('x', 1);
    // (1+1)*2 = 4
    expect(r).toBe(4);
  });

  it('on 返回 disposer 可取消', () => {
    let count = 0;
    const d = bus.on('x', () => { count++; });
    bus.emit('x');
    d();
    bus.emit('x');
    expect(count).toBe(1);
  });

  it('once 只触发一次', () => {
    let count = 0;
    bus.once('x', () => { count++; });
    bus.emit('x');
    bus.emit('x');
    expect(count).toBe(1);
  });
});

describe('createContext - 服务', () => {
  it('agents.followup 调用 sendToChat', async () => {
    const host = fakeHost();
    const ctx = createContext('test', host);
    const agent = ctx.agents.get();
    const ok = await agent.followup({ role: 'user', content: '你好' });
    expect(ok).toBe(true);
    expect(host.sent).toEqual(['你好']);
  });

  it('sessions.current 返回会话与项目', () => {
    const ctx = createContext('test', fakeHost());
    const cur = ctx.sessions.current();
    expect(cur.id).toBe('session-1');
    expect(cur.projectDir).toBe('D:/proj');
  });

  it('tools.list 返回工具名', () => {
    const ctx = createContext('test', fakeHost());
    expect(ctx.tools.list()).toContain('read');
  });

  it('settings 读写', () => {
    let store = {};
    const host = fakeHost();
    host.getSetting = (k) => store[k];
    host.setSetting = (k, v) => { store[k] = v; };
    const ctx = createContext('test', host);
    ctx.settings.set('foo', 'bar');
    expect(ctx.settings.get('foo')).toBe('bar');
  });
});

describe('loadPluginModule - 入口契约', () => {
  it('加载命名导出插件', () => {
    const activated = [];
    const mod = {
      name: 'my-plugin',
      inject: ['agents'],
      apply(ctx) { activated.push(ctx.name); },
    };
    const p = loadPluginModule(mod, fakeHost());
    expect(p.name).toBe('my-plugin');
    expect(activated).toEqual(['my-plugin']);
  });

  it('缺 apply 时报错', () => {
    const r = safeLoad(() => loadPluginModule({ name: 'x' }, fakeHost()));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/apply/);
  });

  it('inject 不存在的服务时报错', () => {
    const mod = { name: 'x', inject: ['not-exist'], apply() {} };
    const r = safeLoad(() => loadPluginModule(mod, fakeHost()));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not-exist/);
  });

  it('裸 default 导出被拒', () => {
    const mod = { default: () => {} };
    const r = safeLoad(() => loadPluginModule(mod, fakeHost()));
    expect(r.ok).toBe(false);
  });
});
