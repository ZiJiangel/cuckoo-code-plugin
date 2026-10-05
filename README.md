# Cuckoo Code · 插件系统改造版

> 这是 [Cuckoo Code](https://github.com/wangyongpeng90/cuckoo-code) 的一个 **fork**，专注**对标 DSH（DeepSeek Harness）的插件系统**。
> **原版的功能说明（安装、工具、Skill/Agent/Rules、MCP、Provider 等）请看[原作者仓库](https://github.com/wangyongpeng90/cuckoo-code)。**

---

## 这个 fork 改了什么

在原版「插件市场（装/卸/启停）」之上，新增了一套**插件运行时**，让插件**能跑代码、能扩展 Cuckoo**。

### 1. 插件运行时（`src/plugins/runtime/`）
- 入口三形态：函数 / 对象 / 类（`extends Service`）
- 5 种事件派发：`emit` / `parallel` / `serial` / `bail` / `waterfall`
- 服务：`provide` / `inject` / `get`（依赖就绪后回调、服务移除自动卸载）
- 生命周期：`ctx.effect` / `ctx.scope`（可逆副作用、卸载清理）
- 配置：`cordis.patch.yml` + `apply(ctx, config)`
- 两条扩展线：`dsh/`（可执行插件）、`ui/`（UI 插件）

### 2. ctx 能力（插件 API）
| 类别 | API |
|------|-----|
| 事件 | `ctx.on / emit / parallel / serial / bail / waterfall` |
| 服务 | `ctx.provide / inject / get` |
| 生命周期 | `ctx.effect / scope` |
| 资源 | `ctx.assets.read / url` |
| UI | `ctx.ui.overlay`（覆盖层）/ `ctx.ui.shell`（界面挂载）/ `ctx.ui.mount` |
| HTTP | `ctx.webServer.serve`（本地静态资源服务） |
| 命令 | `ctx.command.register` |
| 工具 | `ctx.tools.register`（给 AI 加工具） |
| token | `ctx.tokens.*` |
| 配置 | `plugin.json` 的 `config` schema + 用户值 |

### 3. 覆盖层视图（安全 UI 方案）
- Cuckoo 主进程新增**透明置顶视图**（`overlayView`），插件 UI 住这里
- **不注入 AI 页面、不 hook 网络** → 不污染第三方页面、无封号风险
- API：`ctx.ui.overlay.init / eval / html`

### 4. Cuckoo 界面挂载
- 插件 UI 集成进 Cuckoo 壳页面（侧边栏 / 状态栏 / 工具栏）
- API：`ctx.ui.shell.addSidebarPanel / addStatusItem / addToolbarButton`

### 5. 其他
- 飞书 AI 回复走**交互卡片**（Markdown 可渲染）
- 便携数据目录（`Cuckoo-Data` 与 exe 同级，可分享）

---

## 插件怎么写

```js
export const name = 'my-plugin'
export const inject = ['agents']
export function apply(ctx, config) {
  // 监听事件
  ctx.on('agent/assistant-stream', (p) => ctx.log(p.frame && p.frame.text))
  // 挂 UI 到覆盖层
  ctx.ui.overlay.init().then(() => {
    ctx.ui.overlay.eval('document.body.innerHTML = \'<div>hi</div>\'')
  })
  // 暴露本地 HTTP 资源
  ctx.webServer.serve('/assets', 'assets')
  // 注册命令
  ctx.command.register({ id: 'hello', title: '打招呼', run: () => 'hi' })
  // 清理
  ctx.effect(() => () => { /* cleanup */ })
}
```

**完整规范见** [`docs/plugin-system.md`](docs/plugin-system.md)。

---

## 插件目录结构

```
my-plugin/
├── plugin.json        # 清单（id / name / config schema）
├── dsh/               # 宿主侧插件（可选）
├── ui/                # UI 插件（可选）
├── assets/            # 资源（模型 / 图片 / 脚本）
└── cordis.patch.yml   # 配置声明（可选）
```

---

## 原版功能

安装、工具系统、Skill / Agent / Rules、MCP、自定义 Provider、多窗口、纯净对话模式等 —— **请看[原作者仓库](https://github.com/wangyongpeng90/cuckoo-code)**。

---

## 许可

沿用原版 **GPL-3.0**。原版版权归 [wangyongpeng90](https://github.com/wangyongpeng90)。
