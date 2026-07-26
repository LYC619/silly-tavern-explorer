/**
 * 文件库 MD 记录的 frontmatter 读写（2.0 阶段7.2）。
 *
 * 形如：
 * ---
 * title: "总结·卷一"
 * volumeNumber: 1
 * genParams: {"model":"..."}
 * ---
 * 正文…
 *
 * 与 obsidian-export 的纯展示用 YAML 不同，这里要求可无损回读：
 * 每行 `key: <JSON值>`，值一律是合法 JSON（字符串带引号、嵌套对象单行 JSON）——
 * 同时也是合法 YAML 标量/流式写法，Obsidian 等工具能正常识别。
 */

const FENCE = '---';

/** 序列化：undefined 字段跳过；键按传入顺序输出 */
export function serializeFrontmatter(fields: Record<string, unknown>, body: string): string {
  const lines: string[] = [FENCE];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    lines.push(`${key}: ${JSON.stringify(value)}`);
  }
  lines.push(FENCE, '', body);
  return lines.join('\n');
}

export interface ParsedFrontmatter {
  fields: Record<string, unknown>;
  body: string;
}

/**
 * 解析。没有 frontmatter（不以 --- 开头）时 fields 为空、整个文本作 body。
 * 解析不了的行跳过（人为手改坏一行不至于整文件读不出）。
 */
export function parseFrontmatter(text: string): ParsedFrontmatter {
  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized.startsWith(FENCE + '\n')) return { fields: {}, body: text };
  const end = normalized.indexOf('\n' + FENCE, FENCE.length);
  if (end < 0) return { fields: {}, body: text };
  const head = normalized.slice(FENCE.length + 1, end);
  const afterFence = normalized.slice(end + 1 + FENCE.length);
  const body = afterFence.replace(/^\n+/, '');
  const fields: Record<string, unknown> = {};
  for (const line of head.split('\n')) {
    const idx = line.indexOf(': ');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const raw = line.slice(idx + 2).trim();
    try {
      fields[key] = JSON.parse(raw);
    } catch {
      fields[key] = raw; // 用户手改成裸字符串也认
    }
  }
  return { fields, body };
}
