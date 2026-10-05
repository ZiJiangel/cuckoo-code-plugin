# Cuckoo 插件系统 · 设计规范

> 版本：v1（2026-10-05）
> 定位：**Cuckoo 自己的插件体系**。接口规范与能力**参考 DSH（DeepSeek Harness）**，但**不是兼容层** —— 这是 Cuckoo 原生的插件能力。
> 目标：让第三方（含 DSH 生态）插件能以**清晰、稳定、可测试**的方式扩展 Cuckoo。

---

## 一、总览

Cuckoo 的插件系统分两层：

| 层 | 目录 | 职责 |
|----|------|------|
| **插件管理** | `src/plugins/*.ts`（原版） | 扫描、安装、卸载、市场、启停 |
| **插件运行时** | `src/plugins/runtime/`（新增） | 加载、上下文、事件、服务、UI、工具、生命周期 |

**两层职责独立**：管理负责"装进来"，运行时负责"跑起来"。原版管理逻辑**零改动**（只多扫 `dsh/` `ui/` 两条目录）。

---

## 二、插件形态规范

Cuckoo 插件是**一个目录**，至少包含：

```
my-plugin/
├── plugin.json        # 清单（必需）
├── dsh/               # 宿主侧插件（可选，Node/主进程能力）
│   └── index.js
├── ui/                # UI 插件（可选，AI 页面内注入）
│   └── index.js
├── assets/            # 插件资源（可选，模型/图片/脚本）
└── cordis.patch.yml   # 配置声明（可选）
```

### plugin.json（清单）

```json
{
  "id": "my-plugin",
  "name": "我的插件",
  "version": "1.0.0",
  "description": "一句话说明",
  "author": "you",
  "minAppVersion": "0.8.8"
}
```

- `id`：唯一标识，同时是**目录名**（`listInstalledPlugins` 按目录名 + `id` 匹配）
- `name`：显示名（可中文）
- **id 与目录名必须一致**（否则 `plugin-read-asset` 找不到）

---

## 三、入口契约（三种形态）

插件入口文件（`dsh/index.js` 或 `ui/index.js`）导出：

### 形态 1：函数式（最简）

```js
export default function apply(ctx, config) {
  ctx.log('hello')
}
```

### 形态 2：对象式

```js
export const name = 'my-plugin'
export const inject = ['agents']
export function apply(ctx, config) {
  // ...
}
```

### 形态 3：类式（有状态插件，继承 Service）

```js
import { Service } from 'cuckoo:plugin'

export default class MyPlugin extends Service {
  constructor(ctx, config) {
    super(ctx, 'my-plugin')
  }
  start() { /* 挂载逻辑 */ }
  stop()  { /* 清理逻辑 */ }
}
```

**共同点**：
- `name`（可选，缺省用目录名）
- `inject`（可选，声明依赖的服务名）
- `apply(ctx, config)`（必需，除了类式）

---

## 四、ctx API 参考

### 4.1 基础

| API | 说明 |
|-----|------|
| `ctx.name` | 插件名（只读） |
| `ctx.log(...args)` | 带插件前缀的日志 |

### 4.2 服务（消费）

| API | 说明 |
|-----|------|
| `ctx.agents` | `.get(sessionId?)` / `.current()` / `.list()` |
| `ctx.tools` | `.list()` / `.register(def)` |
| `ctx.sessions` | `.current()` / `.list()` / `.get(id)` |
| `ctx.settings` | `.get(k)` / `.set(k, v)` |

### 4.3 事件（5 种派发）

| API | 说明 |
|-----|------|
| `ctx.on(ev, fn)` | 监听（返回 disposer） |
| `ctx.once(ev, fn)` | 一次性监听 |
| `ctx.off(ev, fn)` | 取消监听 |
| `ctx.emit(ev, ...args)` | 广播，不等返回 |
| `ctx.parallel(ev, ...args)` | 并行，返回结果数组 |
| `ctx.serial(ev, ...args)` | 串行，返回最后一个结果 |
| `ctx.bail(ev, ...args)` | 短路：第一个非 undefined 结果即停 |
| `ctx.waterfall(ev, value, ...args)` | 瀑布：每个监听器加工 value |

### 4.4 可逆副作用（核心）

| API | 说明 |
|-----|------|
| `ctx.effect(fn)` | 注册副作用；`fn` 可返回 cleanup，卸载时自动调用 |
| `ctx.scope()` | 创建子作用域，独立生命周期 |

```js
ctx.effect(() => {
  const timer = setInterval(tick, 1000)
  return () => clearInterval(timer)   // 卸载时清理
})
```

### 4.5 服务提供 / 注入

| API | 说明 |
|-----|------|
| `ctx.provide(name, impl)` | 向本上下文注册服务 |
| `ctx.get(name)` | 取服务 |
| `ctx.inject(names, cb)` | 依赖就绪时回调 |

```js
// 提供
ctx.provide('myService', { hello: () => 'hi' })

// 注入
export const inject = ['myService']
export function apply(ctx) {
  ctx.myService.hello()
}
```

### 4.6 UI（仅 ui 类插件）

| API | 说明 |
|-----|------|
| `ctx.ui.mount(el)` | 挂载 DOM 到 AI 页面 |
| `ctx.ui.root()` | 取根容器 |
| `ctx.ui.css(text)` | 注入样式 |
| `ctx.ui.onResize(cb)` | 监听尺寸变化 |
| `ctx.ui.injectScript(text)` | 注入脚本（页内） |
| `ctx.ui.injectScriptSrc(src)` | 注入外部脚本 |
| `ctx.ui.injectMainWorld(code)` | **注入到主世界**（跨 contextIsolation） |

> **关键**：`contextIsolation: true` 下，preload 与主世界隔离。
> 需要在 AI 页面主世界运行的代码（如 `window.fetch` 拦截、DOM 操作），
> **必须用 `ctx.ui.injectMainWorld`**，不能用 preload 的 `window`。

### 4.7 资源（仅 ui 类插件）

| API | 说明 |
|-----|------|
| `ctx.assets.read(relPath)` | 读插件目录文件，返回 `Uint8Array` |
| `ctx.assets.url(relPath)` | 读文件并返回 blob URL |

路径**相对插件目录**，例：`ctx.assets.read('assets/pet.js')`。

### 4.8 token 统计

| API | 说明 |
|-----|------|
| `ctx.tokens.context()` | 当前上下文 token |
| `ctx.tokens.cumulative()` | 对话累计 token |
| `ctx.tokens.today()` | 今日累计 token |
| `ctx.tokens.windowCumulative()` | 窗口累计 token |
| `ctx.tokens.total()` | 系统总累计 token |

---

## 五、标准事件清单

| 事件 | 载荷 | 何时触发 |
|------|------|---------|
| `session/event` | `{ type, text, tokenUsage }` | 会话有持久事实（轮次/消息） |
| `agent/assistant-stream` | `{ frame: { think, text, finished } }` | AI 逐字流 |
| `agent/turn-end` | `{ text, tokenUsage }` | 一轮结束 |
| `agent/task-idle` | `{}` | 任务空闲 |
| `tool/call` | `{ code }` | 工具被调用 |
| `tool/result` | `{ code, success, output, error }` | 工具返回 |
| `agent/error` | `{ ... }` | AI 出错 |

> 兼容说明：事件名**沿用 DSH 的命名习惯**（`域/事件`），便于生态迁移。
> Cuckoo 内部事件（`onInterceptedResponse` 等）由 `bridge.ts` 翻译成上述名。

---

## 六、生命周期契约

```
加载 → 解析入口 → 等待 inject 依赖 → apply(ctx, config) → 运行
                                                            ↓
                                                         卸载
                                                            ↓
                                            执行所有 effect 的 cleanup（逆序）
```

**约定**：
1. `apply` 里注册的一切（监听、effect、定时器）**必须**通过 `ctx` 的 API 注册，**不要**自己裸写 `setInterval` 不清理
2. `ctx.effect(fn)` 的 `fn` **应返回 cleanup 函数**（除非确实无需清理）
3. `inject` 的服务名若不存在，`apply` 会**推迟**（等依赖就绪）
   - **例外**：内置服务（`agents` / `tools` / `sessions` / `settings`）**不等待**，直接视为就绪
4. 卸载时**逆序执行** cleanup（后注册的先清理）

---

## 七、错误处理约定

| 场景 | 表现 |
|------|------|
| 入口语法错误 | `loadPluginSource` 返回 `{ ok: false, error }`，**不抛** |
| `apply` 抛异常 | `PluginHost` 捕获，记录到 `diagnose()`，**不影响其他插件** |
| 资源读取失败 | `ctx.assets.read` **抛异常**（调用方自行 try/catch） |
| `injectMainWorld` 失败 | 静默（写 `plugin-debug.log`） |

**调试**：
- `window.electronAPI.pluginDebugLog(msg)` —— 渲染进程 → 主进程写 `plugin-debug.log`
- `PluginHost.diagnose()` —— 列出所有加载失败原因

---

## 八、完整示例：一个最小 UI 插件

**目录结构**：
```
hello-plugin/
├── plugin.json
└── ui/
    └── index.js
```

**plugin.json**：
```json
{
  "id": "hello-plugin",
  "name": "你好插件",
  "version": "1.0.0"
}
```

**ui/index.js**：
```js
export const name = 'hello-plugin'

export function apply(ctx) {
  ctx.log('你好插件加载')

  // 挂一个悬浮窗
  const el = document.createElement('div')
  el.textContent = 'Hello from Cuckoo!'
  el.style.cssText = 'position:fixed;right:20px;top:20px;z-index:9999;padding:12px;background:#333;color:#fff;border-radius:8px'
  ctx.ui.mount(el)

  // 监听 AI 回复
  ctx.on('agent/assistant-stream', (payload) => {
    ctx.log('AI 正在说：', payload.frame && payload.frame.text)
  })

  // 读 token 统计
  const timer = setInterval(() => {
    ctx.log('今日 token：', ctx.tokens.today())
  }, 5000)

  // 可逆副作用：卸载时清理
  ctx.effect(() => () => {
    clearInterval(timer)
    el.remove()
  })
}
```

---

## 九、扩展点汇总

| 能力 | API | 典型用途 |
|------|-----|---------|
| 事件监听 | `ctx.on` | 响应 AI 状态变化 |
| 服务提供 | `ctx.provide` | 插件间协作 |
| UI 挂载 | `ctx.ui.mount` | 悬浮窗、面板 |
| 主世界注入 | `ctx.ui.injectMainWorld` | 拦截网络、改页面 |
| 资源读取 | `ctx.assets.read` | 加载模型/图片 |
| 工具注册 | `ctx.tools.register` | 给 AI 加新工具 |
| token 统计 | `ctx.tokens.*` | 显示用量 |
| 配置 | `cordis.patch.yml` | 用户可调参数 |

---

## 十、参考实现

- **模块源码**：`src/plugins/runtime/`
- **运行时说明**：`src/plugins/runtime/README.md`
- **参考插件**：鲸鱼娘桌宠（`Cuckoo-Data/home/plugins/whale-girl-pet/`）
- **测试**：`test/plugin-system.test.js`

---

_本规范是 Cuckoo 插件系统的正式文档。新增能力必须同步更新本文档。_
