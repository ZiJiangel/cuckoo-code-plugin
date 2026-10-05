/**
 * 插件覆盖层 preload
 * 承载插件 UI（如桌宠），暴露 window.cuckooOverlay：宿主资源 + 事件桥。
 * 不能有顶层 await。
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { contextBridge, ipcRenderer } = require('electron');

const cuckooOverlay = {
  /** 读插件资源（base64），宿主主进程读文件，不经过任何页面网络 */
  readAsset: (pluginId: string, relPath: string) => ipcRenderer.invoke('plugin-read-asset', { pluginId, relPath }),
  /** 覆盖层就绪上报 */
  ready: (pluginId: string) => ipcRenderer.send('plugin-overlay-ready', { pluginId }),
  /** 订阅宿主事件（插件事件流） */
  onEvent: (cb: (payload: any) => void) => {
    ipcRenderer.on('plugin-overlay-event', (_e: any, payload: any) => cb(payload));
  },
  /** 向宿主发消息 */
  send: (channel: string, data: any) => ipcRenderer.send('plugin-overlay-msg', { channel, data }),
  /** 宿主 → 覆盖层 */
  onMessage: (cb: (payload: any) => void) => {
    ipcRenderer.on('plugin-overlay-msg', (_e: any, payload: any) => cb(payload));
  },
  /** 调试日志 */
  debugLog: (msg: string) => ipcRenderer.send('plugin-debug-log', { msg }),
};

try {
  contextBridge.exposeInMainWorld('cuckooOverlay', cuckooOverlay);
} catch (e) {
  (window as any).cuckooOverlay = cuckooOverlay;
}
