/**
 * 便携数据根解析（纯 node，无 electron 依赖）
 *
 * 约定：运行时数据默认放在 **exe 同级的 Cuckoo-Data/** 下，
 * 免安装版解压到哪，数据就跟到哪（可分享）。
 *
 * 优先级：
 *   1. 环境变量 CUCKOO_DATA_ROOT（整个数据根）
 *   2. exe 同级的 Cuckoo-Data/
 *   3. 回退：用户主目录下的 .cuckoo-rework（极端场景）
 */
import path from 'node:path';
import os from 'node:os';

/** 便携数据根 */
function getPortableDataRoot(): string {
  const override = process.env.CUCKOO_DATA_ROOT;
  if (override) return override;
  try {
    // 免安装版：exe 在解压目录，数据放同级
    const exeDir = path.dirname(process.execPath);
    return path.join(exeDir, 'Cuckoo-Data');
  } catch {
    return path.join(os.homedir(), '.cuckoo-rework');
  }
}

/** 用户配置根（skills/plugins/mcp/rules） */
function getUserHome(): string {
  return path.join(getPortableDataRoot(), 'home');
}

export { getPortableDataRoot, getUserHome };
