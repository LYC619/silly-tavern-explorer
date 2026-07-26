/**
 * 文件库命名纯函数：把记录标题变成安全的文件/文件夹名，并处理重名。
 * 过滤字符集与 obsidian-export.downloadMarkdown 保持一致（\/:*?"<>|），
 * 另去掉控制字符、Windows 不接受的结尾点/空格与保留名。
 */

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f]', 'g');

/** 标题 → 安全文件名（不含扩展名）。空/全非法字符时回退 fallback */
export function safeName(title: string, fallback = '未命名'): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(CONTROL_CHARS, '')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, 80);
  if (!cleaned || RESERVED.test(cleaned)) return fallback;
  return cleaned;
}

/** 在已占用名集合里找不冲突的名字：名、名·2、名·3…（比较不区分大小写，Windows 文件系统语义） */
export function ensureUnique(name: string, taken: Iterable<string>): string {
  const lower = new Set([...taken].map((t) => t.toLowerCase()));
  if (!lower.has(name.toLowerCase())) return name;
  for (let i = 2; ; i++) {
    const candidate = `${name}·${i}`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
}
