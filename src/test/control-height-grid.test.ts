import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function sourceFiles(dir = resolve(process.cwd(), 'src'), out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'test') sourceFiles(full, out);
    else if (entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const relative = (file: string) => file.replace(resolve(process.cwd()), '').replace(/\\/g, '/');

/** 从 `<Tag` 起，按引号/花括号配平找到开标签结束的 `>`。`onClick={() => x}` 里的 `>` 不算。 */
function openTag(src: string, start: number): { attrs: string; end: number } | null {
  let i = start;
  let depth = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const c = src[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\') i++;
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return { attrs: src.slice(start, i), end: i };
    i++;
  }
  return null;
}

interface Site {
  file: string;
  line: number;
  tag: string;
  attrs: string;
  size: string | null;
  height: string | null;
}

function controlSites(tags: string[]): Site[] {
  const sites: Site[] = [];
  for (const file of sourceFiles()) {
    const src = readFileSync(file, 'utf8');
    for (const tag of tags) {
      const re = new RegExp(`<${tag}\\b`, 'g');
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const open = openTag(src, m.index);
        if (!open) continue;
        sites.push({
          file: relative(file),
          line: src.slice(0, m.index).split('\n').length,
          tag,
          attrs: open.attrs,
          size: open.attrs.match(/size=["'](\w+)["']/)?.[1] ?? null,
          height: open.attrs.match(/(?<![\w-])h-(\d+(?:\.\d+)?)(?![\w-])/)?.[1] ?? null,
        });
      }
    }
  }
  return sites;
}

/**
 * 高度栅格 28 / 32 / 36 = h-7 / h-8 / h-9。三个数字同时管按钮和输入框，
 * 同一行里的控件才可能等高。24px（h-6）以下不在栅格里：那是上一轮
 * tap-target 兜底热区想遮住的问题，本轮直接把视觉尺寸也抬上来。
 */
const GRID = new Set(['7', '8', '9']);

describe('控件高度栅格', () => {
  it('Input 不在行内写死高度，改用 size 档', () => {
    const offenders = controlSites(['Input'])
      .filter((site) => site.height !== null)
      .map((site) => `${site.file}:${site.line} h-${site.height}`);
    expect(offenders).toEqual([]);
  });

  it('Input 的 size 只用 sm / md / lg', () => {
    const offenders = controlSites(['Input'])
      .filter((site) => site.size !== null && !['sm', 'md', 'lg'].includes(site.size))
      .map((site) => `${site.file}:${site.line} size=${site.size}`);
    expect(offenders).toEqual([]);
  });

  it('Button 不在行内写死高度，交给 size 变体', () => {
    const offenders = controlSites(['Button'])
      .filter((site) => site.height !== null && site.height !== '9')
      .map((site) => `${site.file}:${site.line} h-${site.height}`);
    expect(offenders).toEqual([]);
  });

  it('纯图标按钮不再自己定高宽', () => {
    const offenders = controlSites(['Button'])
      .filter((site) => site.size === 'icon')
      .filter((site) => site.height !== null || /(?<![\w-])w-\d/.test(site.attrs))
      .map((site) => `${site.file}:${site.line}`);
    expect(offenders).toEqual([]);
  });

  /**
   * SelectTrigger / Toggle 是独立控件，和输入框、按钮并排出现，必须同栅格。
   * TabsTrigger 不在此列：它嵌在 TabsList 里，list 自己是 h-8，trigger 比它矮
   * 一档是 shadcn 的内缩样式，不是「一个 24px 的控件」。
   */
  it('其余独立控件的行内高度落在栅格上', () => {
    const offenders = controlSites(['SelectTrigger', 'Toggle'])
      .filter((site) => site.height !== null && !GRID.has(site.height))
      .map((site) => `${site.file}:${site.line} <${site.tag}> h-${site.height}`);
    expect(offenders).toEqual([]);
  });

  it('Input 三档与按钮高度一一对齐', () => {
    const input = read('src/components/ui/input.tsx');
    expect(input).toMatch(/sm:\s*"h-7\b/);
    expect(input).toMatch(/md:\s*"h-8\b/);
    expect(input).toMatch(/lg:\s*"h-9\b/);
    expect(input).toMatch(/defaultVariants:\s*\{\s*size:\s*"md"/);

    // 配方在 button-variants.ts（组件与非组件分家，见那个文件的注释）
    const button = read('src/components/ui/button-variants.ts');
    expect(button, '带文字按钮 32px').toMatch(/default:\s*"h-8\b/);
    expect(button, '紧凑的带文字按钮也是 32px').toMatch(/sm:\s*"h-8\b/);
    expect(button, '表单主体区域 36px').toMatch(/lg:\s*"h-9\b/);
    expect(button, '纯图标按钮 28px').toMatch(/icon:\s*"h-7 w-7"/);
  });

  /**
   * 移动端 Safari 会在字号小于 16px 的输入框获焦时整页放大，所以三档都得
   * 先给 text-base，再用 md: 断点压到桌面端的紧凑字号。
   */
  it('Input 三档都留了移动端 16px 字号', () => {
    const input = read('src/components/ui/input.tsx');
    for (const tier of ['sm', 'md', 'lg']) {
      const line = input.match(new RegExp(`${tier}:\\s*"([^"]+)"`))![1];
      expect(line, `${tier} 档缺 text-base`).toContain('text-base');
      expect(line, `${tier} 档缺 md: 断点`).toMatch(/md:text-(xs|sm)/);
    }
  });
});
