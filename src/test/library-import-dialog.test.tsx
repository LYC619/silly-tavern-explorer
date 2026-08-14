import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryImportDialog } from '@/components/library/LibraryImportDialog';
import type { PreparedLibraryCharacterImport } from '@/lib/library-character-import';
import type { ManagedTagOption } from '@/lib/library-tag-preferences';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tagOptions: ManagedTagOption[] = [
  { raw: '人物/少女', category: '人物', label: '少女', builtIn: true, count: 2, visible: true },
  { raw: '历史/三国', category: '历史', label: '三国', builtIn: false, count: 1, visible: true },
  { raw: '评价/精品', category: '评价', label: '精品', builtIn: true, count: 1, visible: true },
];

function prepared(fileName: string, kind: PreparedLibraryCharacterImport['kind']): PreparedLibraryCharacterImport {
  return {
    fileName,
    kind,
    character: {
      id: fileName,
      name: fileName.replace(/\.[^.]+$/, ''),
      card: { spec: 'chara_card_v2', data: { name: fileName } },
      tags: [],
      status: '未开始',
      createdAt: 1,
      updatedAt: 1,
    },
  };
}

let container: HTMLDivElement;
let root: Root;

function setInputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function buttonByText(label: string): HTMLButtonElement {
  const button = [...document.body.querySelectorAll('button')]
    .find((item) => item.textContent?.includes(label)) as HTMLButtonElement | undefined;
  if (!button) throw new Error(`button not found: ${label}`);
  return button;
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('LibraryImportDialog', () => {
  it('在受限窗口中先说明普通图片会转成空白卡，并隐藏评价档位选项', async () => {
    await act(async () => root.render(
      <LibraryImportDialog
        open
        onOpenChange={() => undefined}
        items={[prepared('封面.png', 'blank-image')]}
        failures={[]}
        tagOptions={tagOptions}
        busy={false}
        onConfirm={() => undefined}
      />,
    ));

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.className).toContain('max-h-[calc(100vh-2rem)]');
    expect(dialog?.textContent).toContain('1 张普通图片将创建为空白角色卡');
    expect(dialog?.textContent).toContain('少女');
    expect(dialog?.textContent).toContain('三国');
    expect(dialog?.textContent).not.toContain('精品');
  });

  it('单文件导入可选择现有标签并填写一个自定义标签', async () => {
    const onConfirm = vi.fn();
    await act(async () => root.render(
      <LibraryImportDialog
        open
        onOpenChange={() => undefined}
        items={[prepared('角色.png', 'character-card')]}
        failures={[]}
        tagOptions={tagOptions}
        busy={false}
        onConfirm={onConfirm}
      />,
    ));

    await act(async () => buttonByText('少女').click());
    const input = document.body.querySelector<HTMLInputElement>('input[placeholder="如：历史/三国，或 收藏"]')!;
    await act(async () => setInputValue(input, '历史/明朝'));
    await act(async () => buttonByText('导入 1 张角色卡').click());

    expect(onConfirm).toHaveBeenCalledWith({
      applyTags: true,
      tags: ['人物/少女'],
      customTag: '历史/明朝',
      type: undefined,
    });
  });

  it('导入时可为角色选择一个互斥类型', async () => {
    const onConfirm = vi.fn();
    await act(async () => root.render(
      <LibraryImportDialog
        open
        onOpenChange={() => undefined}
        items={[prepared('角色.png', 'character-card')]}
        failures={[]}
        tagOptions={tagOptions}
        busy={false}
        onConfirm={onConfirm}
      />,
    ));

    expect(document.body.textContent).toContain('类型');
    expect(buttonByText('人物')).toHaveAttribute('aria-pressed', 'false');
    await act(async () => buttonByText('剧情').click());
    expect(buttonByText('剧情')).toHaveAttribute('aria-pressed', 'true');
    expect(buttonByText('人物')).toHaveAttribute('aria-pressed', 'false');
    await act(async () => buttonByText('导入 1 张角色卡').click());

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ type: '剧情' }));
  });

  it('批量导入可关闭统一打标签而不阻止导入', async () => {
    const onConfirm = vi.fn();
    await act(async () => root.render(
      <LibraryImportDialog
        open
        onOpenChange={() => undefined}
        items={[prepared('甲.png', 'blank-image'), prepared('乙.png', 'blank-image')]}
        failures={['坏文件.png：不是有效的 PNG 文件']}
        tagOptions={tagOptions}
        busy={false}
        onConfirm={onConfirm}
      />,
    ));

    const toggle = document.body.querySelector<HTMLButtonElement>('[role="switch"][aria-label="统一为全部导入角色添加标签"]')!;
    await act(async () => toggle.click());
    expect(document.body.querySelector('[data-library-import-type]')?.closest('.pointer-events-none')).toBeNull();
    await act(async () => buttonByText('剧情').click());
    await act(async () => buttonByText('导入 2 张角色卡').click());

    expect(document.body.textContent).toContain('1 个文件无法导入');
    expect(onConfirm).toHaveBeenCalledWith({ applyTags: false, tags: [], customTag: undefined, type: '剧情' });
  });
});
