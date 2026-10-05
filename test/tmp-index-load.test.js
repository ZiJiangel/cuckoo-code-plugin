
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { esmToCjs } from '../src/plugins/runtime/loader.js';
import { loadPluginSource } from '../src/plugins/runtime/loader.js';

describe('真实插件 index.js 的加载', () => {
  it('esmToCjs 转换后含 exports.apply', () => {
    const src = fs.readFileSync('D:/OBject/cuckoo-rework/插件-鲸鱼娘桌宠/ui/index.js', 'utf-8');
    const cjs = esmToCjs(src);
    console.log('--- 转换后前 15 行 ---');
    console.log(cjs.split('\n').slice(0, 15).join('\n'));
    console.log('--- 含 exports.apply? ---', cjs.includes('exports.apply'));
    console.log('--- 含 exports.inject? ---', cjs.includes('exports.inject'));
    console.log('--- 含 exports.name? ---', cjs.includes('exports.name'));
  });
});
