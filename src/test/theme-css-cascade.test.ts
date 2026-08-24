import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const MAPPED_THEME_VARS = [
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
  // These are intentionally not project-token mappings, but each theme still
  // supplies its own flattened value and therefore they must follow the same
  // cascade rule as the mapped variables.
  '--border',
  '--input',
  '--sidebar-border',
];

function firstRootBlock(css: string): string {
  const block = css.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1];
  if (!block) throw new Error('missing :root block');
  return block;
}

function componentFiles(dir = resolve(process.cwd(), 'src'), out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'test') componentFiles(full, out);
    else if (entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

describe('主题 token 的 CSS 级联顺序', () => {
  it('主题映射的兜底只在 themes.css 中，不能被 index.css 的 :root 覆盖', () => {
    const themesRoot = firstRootBlock(read('src/themes.css'));
    const indexRoot = firstRootBlock(read('src/index.css'));

    for (const name of MAPPED_THEME_VARS) {
      expect(themesRoot, `themes.css 缺少 ${name} 的兜底`).toMatch(new RegExp(`${name}:`));
      expect(indexRoot, `index.css 不应重新声明 ${name}`).not.toMatch(new RegExp(`${name}:`));
    }
  });

  it('不使用 Tailwind 无法生成的 arbitrary var 透明度边框类', () => {
    const offenders: string[] = [];
    const unsupported = /border-\[(?:color:)?var\(--[^)]*\)\]\/\d+/;
    for (const file of componentFiles()) {
      const source = readFileSync(file, 'utf8');
      if (unsupported.test(source)) offenders.push(file.replace(resolve(process.cwd()), ''));
    }
    expect(offenders).toEqual([]);
  });
});
