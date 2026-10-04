/**
 * DSH 兼容层单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../src/plugins/dsh-compat/events.js';
import { createContext } from '../src/plugins/dsh-compat/context.js';
import { loadPluginModule, safeLoad } from '../src/plugins/dsh-compat/loader.js';
import { ServiceRegistryImpl } from '../src/plugins/dsh-compat/service-registry.js';
import { PluginHost } from '../src/plugins/dsh-compat/plugin-host.js';
import { registerContext, unregisterContext, bindCuckooEvents } from '../src/plugins/dsh-compat/bridge.js';

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

import { describe, it, expect } from 'vitest';
import { parseCordisPatch, hasPatchDeclared } from '../src/plugins/dsh-compat/patch.js';

describe('parseCordisPatch', () => {
  it('解析单个 insert', () => {
    const yml = `- insert:
    - id: dsh-market
      name: 'dshmarket'
`;
    const r = parseCordisPatch(yml);
    expect(r.ok).toBe(true);
    expect(r.inserts.length).toBe(1);
    expect(r.inserts[0].id).toBe('dsh-market');
    expect(r.inserts[0].name).toBe('dshmarket');
  });

  it('解析多个 insert + config', () => {
    const yml = `- insert:
    - id: a
      name: 'pkg-a'
      config:
        foo: 1
        bar: true
    - id: b
      name: 'pkg-b'
`;
    const r = parseCordisPatch(yml);
    expect(r.inserts.length).toBe(2);
    expect(r.inserts[0].id).toBe('a');
    expect(r.inserts[0].config.foo).toBe(1);
    expect(r.inserts[0].config.bar).toBe(true);
    expect(r.inserts[1].id).toBe('b');
  });

  it('空输入', () => {
    const r = parseCordisPatch('');
    expect(r.ok).toBe(true);
    expect(r.inserts.length).toBe(0);
  });

  it('非字符串报错', () => {
    const r = parseCordisPatch(null);
    expect(r.ok).toBe(false);
  });
});

describe('hasPatchDeclared', () => {
  it('识别 dsh.bundle.patch', () => {
    expect(hasPatchDeclared({ dsh: { bundle: { patch: './cordis.patch.yml' } } })).toBe(true);
    expect(hasPatchDeclared({ dsh: {} })).toBe(false);
    expect(hasPatchDeclared({})).toBe(false);
  });
});


describe('ctx.effect - 可逆副作用', () => {
  it('卸载时自动执行 cleanup', () => {
    let cleaned = false;
    const ctx = createContext('t', fakeHost());
    ctx.effect(() => () => { cleaned = true; });
    ctx.__dispose();
    expect(cleaned).toBe(true);
  });

  it('无返回值时安全', () => {
    const ctx = createContext('t', fakeHost());
    expect(() => ctx.effect(() => {})).not.toThrow();
  });
});

describe('ctx.provide/get/inject - 服务', () => {
  it('provide 后 get 可取到', () => {
    const ctx = createContext('t', fakeHost());
    ctx.provide('my-service', { hello: () => 'hi' });
    expect(ctx.get('my-service').hello()).toBe('hi');
  });

  it('inject 在服务就绪时回调', () => {
    const reg = new ServiceRegistryImpl();
    const ctxA = createContext('a', fakeHost(), reg);
    const ctxB = createContext('b', fakeHost(), reg);
    let ready = false;
    ctxB.inject(['shared'], () => { ready = true; });
    expect(ready).toBe(false);
    ctxA.provide('shared', { x: 1 });
    expect(ready).toBe(true);
  });
});


describe('PluginHost - 统一插件管理', () => {
  it('加载多个插件', () => {
    const host = new PluginHost(fakeHost());
    const r = host.loadAll([
      { name: 'p1', kind: 'dsh', source: `export const name = 'p1'; export function apply() {}` },
      { name: 'p2', kind: 'ui', source: `export const name = 'p2'; export function apply() {}` },
    ]);
    expect(r.loaded).toEqual(['p1', 'p2']);
    expect(host.stats()).toEqual({ total: 2, dsh: 1, ui: 1, failed: 0 });
  });

  it('加载失败被记录', () => {
    const host = new PluginHost(fakeHost());
    const r = host.loadAll([{ name: 'bad', kind: 'dsh', source: `export const name = 'bad';` }]);
    expect(r.loaded).toEqual([]);
    expect(r.failed.length).toBe(1);
    expect(host.stats().failed).toBe(1);
  });

  it('卸载插件', () => {
    const host = new PluginHost(fakeHost());
    host.load({ name: 'x', kind: 'dsh', source: `export const name = 'x'; export function apply() {}` });
    expect(host.list()).toEqual(['x']);
    expect(host.unload('x')).toBe(true);
    expect(host.list()).toEqual([]);
  });

  it('跨插件服务注入', () => {
    const host = new PluginHost(fakeHost());
    host.load({
      name: 'provider', kind: 'dsh',
      source: `export const name = 'provider'; export function apply(ctx) { ctx.provide('svc', { v: 42 }); }`,
    });
    let got = null;
    host.load({
      name: 'consumer', kind: 'dsh',
      source: `export const name = 'consumer'; export function apply(ctx) { got = ctx.get('svc'); }`,
    });
    // consumer 加载后能取到 provider 提供的服务
    const ctxC = host.getContext('consumer');
    expect(ctxC.get('svc').v).toBe(42);
  });

  it('重复加载同名插件被拒', () => {
    const host = new PluginHost(fakeHost());
    const src = `export const name = 'dup'; export function apply() {}`;
    expect(host.load({ name: 'dup', kind: 'dsh', source: src }).ok).toBe(true);
    expect(host.load({ name: 'dup', kind: 'dsh', source: src }).ok).toBe(false);
  });
});


describe('PluginHost - UI 插件能力', () => {
  it('UI 插件拿到 ctx.ui', () => {
    // 模拟 DOM
    global.document = {
      createElement: () => ({ id: '', style: {}, setAttribute: () => {}, appendChild: () => {}, isConnected: true }),
      getElementById: () => null,
      body: { appendChild: () => {} },
      head: { appendChild: () => {} },
    };
    const host = new PluginHost(fakeHost());
    host.load({
      name: 'ui-p', kind: 'ui',
      source: `export const name = 'ui-p'; export function apply(ctx) {}`,
    });
    // 直接检查该插件 ctx 上有无 ui 能力
    const c = host.getContext('ui-p');
    expect(!!(c.ui && c.ui.mount)).toBe(true);
  });
});


describe('事件桥 - bindCuckooEvents', () => {
  it('Cuckoo 事件转发为 DSH 事件名', () => {
    const received = [];
    const ctx = createContext('listener', fakeHost());
    registerContext(ctx);
    ctx.on('session/event', (rec) => received.push(['session', rec.type]));
    ctx.on('tool/result', (r) => received.push(['tool', r.success]));

    // 模拟 Cuckoo 事件源
    let respCb = null, toolCb = null;
    const src = {
      onInterceptedResponse: (cb) => { respCb = cb; return () => {}; },
      onStream: () => () => {},
      onTaskIdle: () => () => {},
      onToolCall: (cb) => { toolCb = cb; return () => {}; },
    };
    bindCuckooEvents(src);

    respCb('hello', { tokenUsage: { accumulatedTokens: 100 } });
    toolCb({ phase: 'end', code: 'read', success: true });

    expect(received).toContainEqual(['session', 'assistant/message']);
    expect(received).toContainEqual(['tool', true]);
    unregisterContext(ctx);
  });
});


describe('ctx.scope - 子作用域', () => {
  it('scope 内 effect 独立清理', () => {
    const ctx = createContext('t', fakeHost());
    let cleaned = false;
    const s = ctx.scope();
    s.effect(() => () => { cleaned = true; });
    expect(cleaned).toBe(false);
    s.dispose();
    expect(cleaned).toBe(true);
    expect(s.disposed).toBe(true);
  });

  it('父 dispose 时子 scope 一起销毁', () => {
    const ctx = createContext('t', fakeHost());
    let cleaned = false;
    const s = ctx.scope();
    s.effect(() => () => { cleaned = true; });
    ctx.__dispose();
    expect(cleaned).toBe(true);
  });

  it('scope 内事件监听 dispose 时移除', () => {
    const ctx = createContext('t', fakeHost());
    let count = 0;
    const s = ctx.scope();
    s.on('x', () => { count++; });
    ctx.emit('x');
    s.dispose();
    ctx.emit('x');
    expect(count).toBe(1);
  });
});
