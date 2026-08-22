/**
 * 无立绘角色的渐变占位图。
 *
 * 名称哈希 → 13 套预置渐变之一（样式在 index.css 的 `.art-placeholder-N`），
 * 同一个角色每次进来都落在同一套配色上。原先 Library.tsx 与 Home.tsx
 * 各抄了一份逐字符相同的 hashName，`art-placeholder-${...}` 散在三处。
 */

/** 预置渐变的套数，与 CSS 里的 `.art-placeholder-1 … -13` 一一对应 */
const PLACEHOLDER_VARIANTS = 13;

export function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

/** 占位图的完整 class，直接铺在定位容器上 */
export function placeholderArtClass(name: string): string {
  return `art art-placeholder-${(hashName(name) % PLACEHOLDER_VARIANTS) + 1}`;
}
