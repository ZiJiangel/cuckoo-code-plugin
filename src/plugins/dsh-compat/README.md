# @cuckoo/dsh-compat

Cuckoo 的 **DSH（DeepSeek Harness）插件兼容层**。

让 Cuckoo 支持 DSH 风格的插件：

```js
export const name = 'my-plugin'
export const inject = ['agents']
export function apply(ctx, config) {
  ctx.on('session/event', (rec) => { ... })
}
```

## 特点

- **零外部依赖**：所有 import 都是相对的，模块自包含
- **对标 DSH**：入口契约、5 种事件派发、服务、事件域全部对齐
- **可独立复用**：可单独抽出用于其他 Electron/Web 项目

## 模块结构

| 文件 | 职责 |
|------|------|
| `types.ts` | 类型定义（DshContext / 服务 / 事件） |
| `events.ts` | EventBus：5 种派发（emit/parallel/serial/bail/waterfall） |
| `context.ts` | `createContext`：宿主能力 → DSH ctx（含 effect/provide/inject） |
| `loader.ts` | 入口契约解析 + 加载（含 ESM→CJS 转换） |
| `bridge.ts` | Cuckoo 事件 → DSH 事件名桥 |
| `runtime.ts` | DSH 插件运行时 |
| `ui-runtime.ts` | UI 扩展运行时（`ctx.ui.mount` 等） |
| `patch.ts` | `cordis.patch.yml` 解析 |
| `service-registry.ts` | 服务注册表（provide/get/inject） |
| `plugin-host.ts` | `PluginHost`：统一生命周期管理 |
| `index.ts` | 模块入口 |

## 核心 API

### PluginHost（推荐）
```ts
import { PluginHost } from './dsh-compat/index.js'

const host = new PluginHost(hostCapabilities)
host.loadAll([
  { name: 'p1', source: '...', kind: 'dsh' },
  { name: 'p2', source: '...', kind: 'ui' },
])
host.stats()   // { total, dsh, ui, failed }
host.unload('p1')
```

### 底层 API
```ts
import { loadPluginSource, createContext, EventBus, parseCordisPatch } from './dsh-compat/index.js'
```

## ctx API（给插件用）

### 服务
- `ctx.agents` — `.get()` / `.list()`
- `ctx.tools` — `.list()`
- `ctx.sessions` — `.current()` / `.list()`
- `ctx.settings` — `.get(k)` / `.set(k,v)`

### 事件
- `ctx.on(ev, fn)` / `ctx.once` / `ctx.off`
- `ctx.emit` / `parallel` / `serial` / `bail` / `waterfall`

### 服务提供/注入
- `ctx.provide(name, impl)`
- `ctx.get(name)`
- `ctx.inject([names], cb)`

### 可逆副作用
- `ctx.effect(fn)` — fn 返回 cleanup

### UI（仅 ui 类插件）
- `ctx.ui.mount(el)` / `css(text)` / `root()` / `onResize(cb)`

## 标准事件（对齐 DSH）

| 事件 | 载荷 |
|------|------|
| `session/event` | `{ type, text, tokenUsage }` |
| `agent/assistant-stream` | `{ frame: { think, text, finished } }` |
| `agent/task-idle` | `{}` |
| `tool/call` | `{ code }` |
| `tool/result` | `{ code, success, output, error }` |
| `agent/error` | `{ ... }` |

## 测试

模块自带单元测试（见 `test/dsh-compat.test.js`），31 个用例覆盖：
- EventBus 5 种派发
- createContext 服务
- effect / provide / inject
- 入口契约校验
- cordis.patch.yml 解析
- PluginHost 生命周期
- 事件桥
