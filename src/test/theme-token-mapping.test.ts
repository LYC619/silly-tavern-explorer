import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const themes = read('src/themes.css');
const index = read('src/index.css');

const THEMES = ['cocoa', 'ink', 'midnight', 'cream'] as const;

function themeBlock(css: string, theme: string): string {
  const match = css.match(new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`missing theme block: ${theme} `);
  return match[1];
}

function declaration(block: string, name: string): string | undefined {
  return block.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))?.[1]?.trim();
}

function sourceFiles(dir = resolve(process.cwd(), 'src'), out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'test') sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const relative = (file: string) => file.replace(resolve(process.cwd()), '').replace(/\\/g, '/');

/**
 * shadcn 自带的颜色变量。项目代码不用这些名字，它们只在 themes.css 的
 * 「shadcn 适配层」里出现一次，映射到项目变量的 HSL 三元组。
 */
const MAPPED_SHADCN_VARS = [
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--accent-foreground',
  '--sidebar-background',
  '--sidebar-foreground',
  '--sidebar-accent',
  '--sidebar-accent-foreground',
];

/** 有意不走映射的，理由写在 themes.css 文件头，别顺手接上。 */
const UNMAPPED_SHADCN_VARS = ['--border', '--input', '--sidebar-border', '--destructive'];

const ALL_SHADCN_VARS = [
  ...MAPPED_SHADCN_VARS,
  ...UNMAPPED_SHADCN_VARS,
  '--primary',
  '--ring',
  '--sidebar-primary',
  '--sidebar-ring',
  '--primary-foreground',
  '--destructive-foreground',
];

describe('主题 token 与 shadcn 适配层', () => {
  it.each(THEMES)('%s 的 shadcn 颜色变量全部映射到项目变量，不自带取值', (theme) => {
    const block = themeBlock(themes, theme);
    for (const name of MAPPED_SHADCN_VARS) {
      const value = declaration(block, name);
      expect(value, `${theme} 缺 ${name} 的映射`).toBeTruthy();
      expect(value, `${theme} 的 ${name} 应写成 var(--xxx-hsl)，实际是 ${value}`)
        .toMatch(/^var\(--[a-z-]+-hsl\)$/);
    }
  });

  it.each(THEMES)('%s 映射指向的三元组在本主题里有定义', (theme) => {
    const block = themeBlock(themes, theme);
    const root = themes.match(/:root\s*\{([\s\S]*?)\n\}/)![1];
    for (const name of MAPPED_SHADCN_VARS) {
      const target = declaration(block, name)!.slice(4, -1);
      const triplet = declaration(block, target) ?? declaration(root, target);
      expect(triplet, `${theme} 的 ${name} 指向了未定义的 ${target}`).toBeTruthy();
      expect(triplet, `${target} 应是裸 HSL 三元组，实际是 ${triplet}`)
        .toMatch(/^-?[\d.]+ [\d.]+% [\d.]+%$/);
    }
  });

  /**
   * 这条是本轮的起因：midnight 的 --text-muted 上一轮为了 AA 抬到了 #8f99b0，
   * 但 index.css 里手抄的那份 --muted-foreground 还留在 #7a8497，于是所有走
   * shadcn text-muted-foreground 的文字都没跟上。同源之后不可能再漏。
   */
  it.each(THEMES)('%s 的 muted 前景与项目的次要文字同源', (theme) => {
    const block = themeBlock(themes, theme);
    expect(declaration(block, '--muted-foreground')).toBe('var(--text-muted-hsl)');
    expect(declaration(block, '--text-muted')).toBe('hsl(var(--text-muted-hsl))');
  });

  it('index.css 不再逐主题重复定义 shadcn 颜色', () => {
    const offenders: string[] = [];
    for (const theme of THEMES) {
      const block = index.match(new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([\\s\\S]*?)\\n  \\}`))?.[1];
      if (!block) continue;
      for (const name of ALL_SHADCN_VARS) {
        if (declaration(block, name)) offenders.push(`${theme} ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('项目代码不直接引用 shadcn 变量名', () => {
    const pattern = new RegExp(`var\\(\\s*(${ALL_SHADCN_VARS.join('|')})\\s*[,)]`, 'g');
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(pattern)) {
        const line = source.slice(0, match.index!).split('\n').length;
        offenders.push(`${relative(file)}:${line} ${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('index.css 的组件/工具类层不引用 shadcn 变量名', () => {
    const layers = index.slice(index.indexOf('@layer components'));
    const pattern = new RegExp(`var\\(\\s*(${ALL_SHADCN_VARS.join('|')})\\s*[,)/ ]`, 'g');
    const offenders = [...layers.matchAll(pattern)].map((match) => match[1]);
    expect(offenders).toEqual([]);
  });

  /** 三元组是事实源，项目变量必须包一层 hsl() 取用，不能各写一份字面值。 */
  it.each(THEMES)('%s 的底色与文字档位都由三元组派生', (theme) => {
    const block = themeBlock(themes, theme);
    const derived: Record<string, string> = {
      '--bg-canvas': 'canvas',
      '--bg-chrome': 'chrome',
      '--bg-elevated': 'elevated',
      '--bg-elevated-strong': 'elevated-strong',
      '--text-primary': 'text-primary',
      '--text-body': 'text-body',
      '--text-muted': 'text-muted',
    };
    for (const [name, triplet] of Object.entries(derived)) {
      expect(declaration(block, name), `${theme} 的 ${name}`).toBe(`hsl(var(--${triplet}-hsl))`);
    }
  });
});
