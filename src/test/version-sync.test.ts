import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// vitest 从项目根运行，直接按根相对路径读源文件（不 import 组件，避免拉起整棵依赖）
const root = process.cwd();
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

/**
 * 版本号有三处手工同步：package.json / GlobalSettings 的 APP_VERSION / sw.js 的 CACHE_VERSION。
 * 历史上正是它们各自漂移（README/package/APP_VERSION 三个不同值）。这里钉死三者一致，
 * 发布时漏改任何一处都会红。
 */
describe('版本号单一来源一致性', () => {
  const pkgVersion = JSON.parse(read('package.json')).version as string; // 如 "0.18.0"
  const appVersion = read('src/components/GlobalSettings.tsx').match(/APP_VERSION\s*=\s*'([^']+)'/)?.[1];
  const swVersion = read('public/sw.js').match(/CACHE_VERSION\s*=\s*'([^']+)'/)?.[1];

  it('package.json 版本号格式正常', () => {
    expect(pkgVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('APP_VERSION 与 package.json 一致（带 v 前缀）', () => {
    expect(appVersion).toBe(`v${pkgVersion}`);
  });

  it('Service Worker CACHE_VERSION 与 package.json 一致（带 v 前缀）', () => {
    expect(swVersion).toBe(`v${pkgVersion}`);
  });
});
