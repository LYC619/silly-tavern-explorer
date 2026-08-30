/**
 * 世界书悬浮预览（0830 反馈条目 10）。
 *
 * 原来是浏览器原生 `title`：字号由系统定，高分屏上小到看不清。换成 Radix tooltip 后
 * 有两个容易悄悄坏掉的地方，这里各钉一条：
 *
 * 1. 触发器用 asChild 直接接管 `<td>`。要是哪天改成在外面包一层 div/button，
 *    `<tr>` 的直接子节点就不再是单元格，整张表的列宽会当场散架——而且看起来
 *    只是「有点乱」，不会报错。
 * 2. 内容必须传送到表格外。留在 `<tr>` 里浏览器会把它提到 `<table>` 前面，
 *    tooltip 飘到列表顶上，同样不报错。
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EntryListRow } from '@/components/worldbook/EntryListRow';
import type { WorldBookEntry } from '@/types/worldbook';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ENTRY = {
  uid: 1,
  key: ['魔法', '咏唱'],
  keysecondary: ['禁咒'],
  comment: '魔法体系',
  content: '这个世界的魔法需要咏唱，咏唱越长威力越大。\n禁咒需要三人以上同时咏唱。',
  constant: false,
  vectorized: false,
  enabled: true,
  position: 0,
  depth: 4,
  order: 100,
  probability: 100,
} as unknown as WorldBookEntry;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderRow(entry: WorldBookEntry = ENTRY) {
  await act(async () => {
    root.render(
      <table><tbody>
        <EntryListRow
          entry={entry}
          entryKey="1"
          selected={false}
          onClick={() => {}}
          onToggleEnabled={() => {}}
        />
      </tbody></table>,
    );
  });
}

describe('世界书列表行的悬浮预览', () => {
  it('单元格仍是 <tr> 的直接子节点，没被包一层', async () => {
    await renderRow();

    const row = container.querySelector('tr')!;
    const children = Array.from(row.children).map((el) => el.tagName);
    expect(children.every((tag) => tag === 'TD')).toBe(true);
  });

  it('关键词那格显示的是关键词，不是正文', async () => {
    await renderRow();

    // 修之前这格挂的是 title={entry.content}：显示关键词、悬浮出正文，对不上
    const cells = Array.from(container.querySelectorAll('td')).map((td) => td.textContent);
    expect(cells).toContain('魔法, 咏唱');
    expect(cells.some((text) => text?.includes('咏唱越长威力越大'))).toBe(false);
  });

  it('不再留原生 title，避免和 tooltip 同时冒出来', async () => {
    await renderRow();

    const withTitle = Array.from(container.querySelectorAll('td[title]'));
    expect(withTitle).toEqual([]);
  });

  it('正文为空的条目不套 tooltip，也不报错', async () => {
    await renderRow({ ...ENTRY, content: '', comment: '', key: [], keysecondary: [] } as WorldBookEntry);

    const row = container.querySelector('tr')!;
    expect(Array.from(row.children).every((el) => el.tagName === 'TD')).toBe(true);
    expect(row.textContent).toContain('(无标题)');
  });
});
