/**
 * 日记文本解析：把「角色日记」生成结果解析为结构化条目，供日记本样式渲染。
 * 日记模板输出形如 <diary datetime="...">…</diary>，内含多篇由 --- 分隔的日记，
 * 每篇有日期、**标题**、正文，可能有签名。AI 输出不严格，解析需容错。
 * 纯函数。
 */

export interface DiaryEntry {
  date: string;
  title: string;
  body: string;
}

export interface ParsedDiary {
  entries: DiaryEntry[];
  /** 结尾签名（若有） */
  signature: string;
  /** 解析失败时回退：原始文本（entries 为空时用它整段展示） */
  raw: string;
}

/** 剥掉 <diary ...> 外层标签与 markdown 围栏，取内部文本 */
function stripWrapper(text: string): string {
  let t = text.trim();
  t = t.replace(/^```(?:html|markdown)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const m = t.match(/<diary[^>]*>([\s\S]*?)<\/diary>/i);
  if (m) return m[1].trim();
  // 只有开标签没闭合
  t = t.replace(/<\/?diary[^>]*>/gi, '').trim();
  return t;
}

/** 从 datetime 属性或文本首行提取日期 */
function extractDate(block: string): { date: string; rest: string } {
  const lines = block.split('\n');
  // 常见：单独一行的日期（YYYY/MM/DD 或 [日期] 或 YYYY-MM-DD ...）
  for (let i = 0; i < Math.min(3, lines.length); i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^\[?\d{4}[-/年.]\d{1,2}[-/月.]\d{1,2}/.test(line) && line.replace(/\*\*/g, '').length < 40) {
      const date = line.replace(/^\[|\]$/g, '').trim();
      lines.splice(i, 1);
      return { date, rest: lines.join('\n').trim() };
    }
  }
  return { date: '', rest: block.trim() };
}

/** 提取首个 **标题** 作为条目标题 */
function extractTitle(block: string): { title: string; rest: string } {
  const m = block.match(/\*\*([^*\n]+)\*\*/);
  if (m) {
    const title = m[1].trim();
    const rest = block.replace(m[0], '').trim();
    return { title, rest };
  }
  return { title: '', rest: block };
}

export function parseDiary(text: string): ParsedDiary {
  const raw = text;
  const inner = stripWrapper(text);
  if (!inner) return { entries: [], signature: '', raw };

  // 按 --- 分隔线切分为块（--- 单独成行）
  const blocks = inner.split(/\n\s*-{3,}\s*\n/).map((b) => b.trim()).filter(Boolean);

  const entries: DiaryEntry[] = [];
  let signature = '';

  blocks.forEach((block, idx) => {
    // 末块若很短且像签名（—— xxx / 署名），单独拎出
    if (idx === blocks.length - 1 && block.length < 40 && /^[—\-–~]/.test(block)) {
      signature = block.replace(/^[—\-–~\s]+/, '').trim();
      return;
    }
    const { date, rest: r1 } = extractDate(block);
    const { title, rest: body } = extractTitle(r1);
    if (!date && !title && !body) return;
    entries.push({ date, title, body: body.trim() });
  });

  return { entries, signature, raw };
}
