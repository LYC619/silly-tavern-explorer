import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TagManagerDialog } from '@/components/library/TagManagerDialog';
import { normalizeLibraryTagPreferences, type LibraryTagPreferences } from '@/lib/library-tag-preferences';
import type { ArchiveCharacter } from '@/types/archive';
import type { STCharacterCard } from '@/lib/png-parser';

const mocks = vi.hoisted(() => ({
  updateCharacter: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/lib/archive-db', () => ({
  CHARACTER_TYPES: ['人物', '剧情', '玩法', '综合', '同人'],
  updateCharacter: mocks.updateCharacter,
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const card = { spec: 'chara_card_v2', data: { name: '测试角色' } } as unknown as STCharacterCard;

function character(tags: string[], id = 'c1', extra: Partial<ArchiveCharacter> = {}): ArchiveCharacter {
  return {
    id,
    name: '测试角色',
    card,
    tags,
    status: '未开始',
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  };
}

function pointerEvent(type: string, pointerId = 7, clientX = 24, clientY = 24): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    button: { value: 0 },
    clientX: { value: clientX },
    clientY: { value: clientY },
  });
  return event;
}

let container: HTMLDivElement;
let root: Root;

async function flushUi() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function setInputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function buttonByLabel(label: string): HTMLButtonElement {
  const button = document.body.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`button not found: ${label}`);
  return button;
}

function buttonByText(label: string): HTMLButtonElement {
  const button = [...document.body.querySelectorAll('button')]
    .find((item) => item.textContent?.includes(label)) as HTMLButtonElement | undefined;
  if (!button) throw new Error(`button not found: ${label}`);
  return button;
}

async function click(button: HTMLButtonElement) {
  await act(async () => {
    button.click();
    await flushUi();
  });
}

async function renderDialog({
  preferences,
  characters = [],
  selectedCharacters = [],
  onPreferencesChange,
}: {
  preferences: LibraryTagPreferences;
  characters?: ArchiveCharacter[];
  selectedCharacters?: ArchiveCharacter[];
  onPreferencesChange: (next: LibraryTagPreferences) => Promise<void>;
}) {
  await act(async () => {
    root.render(
      <TagManagerDialog
        open
        onOpenChange={() => undefined}
        characters={characters}
        selectedCharacters={selectedCharacters}
        preferences={preferences}
        onPreferencesChange={onPreferencesChange}
        onChanged={() => undefined}
      />,
    );
    await flushUi();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  Reflect.deleteProperty(document, 'elementFromPoint');
});

describe('TagManagerDialog', () => {
  it('使用更大的受限工作区，并可新增尚未分配给角色的标签定义', async () => {
    const onPreferencesChange = vi.fn(async (_next: LibraryTagPreferences) => undefined);
    await renderDialog({ preferences: normalizeLibraryTagPreferences(undefined), onPreferencesChange });

    expect(document.body.querySelector('[role="dialog"]')?.className).toContain('max-w-4xl');
    const input = document.body.querySelector<HTMLInputElement>('input[placeholder="输入标签名称"]');
    expect(input).not.toBeNull();
    await act(async () => {
      setInputValue(input!, '机械生命');
      await flushUi();
    });
    await click(buttonByText('新增标签'));

    expect(onPreferencesChange).toHaveBeenCalledTimes(1);
    expect(onPreferencesChange.mock.calls[0][0].customTags).toContain('人物/机械生命');
  });

  it('内置标签也能通过复选框控制侧栏显隐', async () => {
    const onPreferencesChange = vi.fn(async (_next: LibraryTagPreferences) => undefined);
    await renderDialog({ preferences: normalizeLibraryTagPreferences(undefined), onPreferencesChange });

    await click(buttonByLabel('隐藏标签 人物/少女'));

    expect(onPreferencesChange.mock.calls[0][0].hidden).toContain('人物/少女');
  });

  it('可以创建自定义一级标签组，再在组内创建子标签', async () => {
    const onPreferencesChange = vi.fn(async (_next: LibraryTagPreferences) => undefined);
    await renderDialog({ preferences: normalizeLibraryTagPreferences(undefined), onPreferencesChange });

    const categoryInput = document.body.querySelector<HTMLInputElement>('input[placeholder="如：历史"]');
    expect(categoryInput).not.toBeNull();
    await act(async () => {
      setInputValue(categoryInput!, '历史');
      await flushUi();
    });
    await click(buttonByLabel('新增一级标签'));
    expect(onPreferencesChange.mock.calls.at(-1)?.[0].customCategories).toContain('历史');
  });

  it('提供键盘可用的上下移动控制', async () => {
    const preferences = normalizeLibraryTagPreferences({
      version: 1,
      customTags: [],
      order: ['人物/少女', '人物/成女'],
      hidden: [],
    });
    const onPreferencesChange = vi.fn(async (_next: LibraryTagPreferences) => undefined);
    await renderDialog({ preferences, onPreferencesChange });

    await click(buttonByLabel('下移标签 人物/少女'));

    expect(onPreferencesChange.mock.calls[0][0].order.slice(0, 2)).toEqual(['人物/成女', '人物/少女']);
  });

  it('为一级和二级标签提供独立的可拖拽手柄', async () => {
    const preferences = normalizeLibraryTagPreferences({
      version: 1,
      customCategories: ['历史'],
      customTags: ['历史/三国'],
      categoryOrder: ['历史'],
      order: ['历史/三国'],
      hidden: [],
    });
    await renderDialog({ preferences, onPreferencesChange: vi.fn(async () => undefined) });

    expect(document.body.querySelector('[data-tag-category-drag-handle="历史"]')).not.toBeNull();
    await click(buttonByText('历史'));
    expect(document.body.querySelector('[data-managed-tag-drag-handle="历史/三国"]')).not.toBeNull();
  });

  it('一级标签手柄捕获指针，移动时标记目标并在释放后保存一次', async () => {
    const preferences = normalizeLibraryTagPreferences({
      version: 1,
      customCategories: ['历史'],
      customTags: [],
      categoryOrder: ['历史'],
      order: [],
      hidden: [],
    });
    const onPreferencesChange = vi.fn(async (_next: LibraryTagPreferences) => undefined);
    await renderDialog({ preferences, onPreferencesChange });

    const handle = document.body.querySelector<HTMLElement>('[data-tag-category-drag-handle="历史"]');
    const target = document.body.querySelector<HTMLElement>('[data-tag-category-row="人物"]');
    expect(handle).not.toBeNull();
    expect(target).not.toBeNull();
    const elementFromPoint = vi.fn(() => target);
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: elementFromPoint });
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.defineProperties(handle!, {
      setPointerCapture: { configurable: true, value: setPointerCapture },
      hasPointerCapture: { configurable: true, value: () => true },
      releasePointerCapture: { configurable: true, value: releasePointerCapture },
    });
    Object.defineProperty(target!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 60, bottom: 100, left: 0, right: 200, width: 200, height: 40, x: 0, y: 60, toJSON: () => ({}) }),
    });

    await act(async () => {
      handle!.dispatchEvent(pointerEvent('pointerdown'));
      window.dispatchEvent(pointerEvent('pointermove', 7, 40, 92));
      await flushUi();
    });
    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(document.body.querySelector<HTMLElement>('[data-tag-category-row="人物"]')
      ?.dataset.pointerDropEdge).toBe('after');
    expect([...document.body.querySelectorAll<HTMLElement>('[data-tag-category-row]')]
      .slice(0, 2).map((item) => item.dataset.tagCategoryRow)).toEqual(['人物', '历史']);
    expect(onPreferencesChange).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(pointerEvent('pointerup', 7, 40, 92));
      await flushUi();
    });

    expect(elementFromPoint).toHaveBeenCalled();
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
    expect(onPreferencesChange).toHaveBeenCalledTimes(1);
    expect(onPreferencesChange.mock.calls[0][0].categoryOrder[0]).toBe('人物');
  });

  it('二级标签拖到目标下半部时实时移位并显示后插入线，释放后只保存一次', async () => {
    const preferences = normalizeLibraryTagPreferences({
      version: 1,
      customCategories: ['历史'],
      customTags: ['历史/三国', '历史/明朝', '历史/清代'],
      categoryOrder: ['历史'],
      order: ['历史/三国', '历史/明朝', '历史/清代'],
      hidden: [],
    });
    const onPreferencesChange = vi.fn(async (_next: LibraryTagPreferences) => undefined);
    await renderDialog({ preferences, onPreferencesChange });
    await click(buttonByText('历史'));

    const handle = document.body.querySelector<HTMLElement>('[data-managed-tag-drag-handle="历史/三国"]');
    const target = document.body.querySelector<HTMLElement>('[data-managed-tag="历史/明朝"]');
    expect(handle).not.toBeNull();
    expect(target).not.toBeNull();
    const elementFromPoint = vi.fn(() => target);
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: elementFromPoint });
    Object.defineProperties(handle!, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: () => true },
      releasePointerCapture: { configurable: true, value: vi.fn() },
    });
    Object.defineProperty(target!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 100, bottom: 140, left: 0, right: 300, width: 300, height: 40, x: 0, y: 100, toJSON: () => ({}) }),
    });

    await act(async () => {
      handle!.dispatchEvent(pointerEvent('pointerdown'));
      window.dispatchEvent(pointerEvent('pointermove', 7, 90, 132));
      await flushUi();
    });
    const visibleOrder = [...document.body.querySelectorAll<HTMLElement>('[data-managed-tag]')]
      .map((item) => item.dataset.managedTag);
    expect(visibleOrder).toEqual(['历史/明朝', '历史/三国', '历史/清代']);
    expect(document.body.querySelector<HTMLElement>('[data-managed-tag="历史/明朝"]')
      ?.dataset.pointerDropEdge).toBe('after');
    expect(onPreferencesChange).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(pointerEvent('pointerup', 7, 90, 132));
      await flushUi();
    });

    expect(elementFromPoint).toHaveBeenCalled();
    expect(onPreferencesChange).toHaveBeenCalledTimes(1);
    expect(onPreferencesChange.mock.calls[0][0].order.slice(0, 2)).toEqual(['历史/明朝', '历史/三国']);
  });

  it('类型作为特殊互斥字段提供给标签管理，分配时修复旧的类型普通标签', async () => {
    const owner = character(['类型/剧情', '人物/少女'], 'c1');
    mocks.updateCharacter.mockImplementation(async (_id, updater) => updater(owner));
    await renderDialog({
      preferences: normalizeLibraryTagPreferences(undefined),
      characters: [owner],
      selectedCharacters: [owner],
      onPreferencesChange: vi.fn(async () => undefined),
    });

    await click(buttonByText('类型'));
    await click(buttonByLabel('选择类型 人物'));
    await click(buttonByText('添加到已选 1 张卡'));

    expect(mocks.updateCharacter).toHaveBeenCalledTimes(1);
    const result = mocks.updateCharacter.mock.calls[0][1](owner);
    expect(result.type).toBe('人物');
    expect(result.tags).toEqual(['人物/少女']);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: '已为 1 张卡设置类型「人物」' }));
  });

  it('选中一个标签后可批量添加给角色库中当前选中的卡', async () => {
    const first = character([], 'c1');
    const second = character(['剧情/悬疑'], 'c2');
    const byId = new Map([[first.id, first], [second.id, second]]);
    mocks.updateCharacter.mockImplementation(async (id, updater) => updater(byId.get(id)!));

    await renderDialog({
      preferences: normalizeLibraryTagPreferences(undefined),
      characters: [first, second],
      selectedCharacters: [first, second],
      onPreferencesChange: vi.fn(async () => undefined),
    });

    await click(buttonByLabel('选择标签 人物/少女'));
    await click(buttonByText('添加到已选 2 张卡'));

    expect(mocks.updateCharacter).toHaveBeenCalledTimes(2);
    for (const [, updater] of mocks.updateCharacter.mock.calls) {
      const result = updater(first);
      expect(result.tags).toContain('人物/少女');
    }
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: '已为 2 张卡添加「少女」' }));
  });

  it('删除正在使用的自定义标签前显示影响数量，确认后才移除角色标签', async () => {
    const owner = character(['人物/魔女']);
    const preferences = normalizeLibraryTagPreferences({
      version: 1,
      customTags: ['人物/魔女'],
      order: ['人物/魔女'],
      hidden: [],
    });
    const onPreferencesChange = vi.fn(async (_next: LibraryTagPreferences) => undefined);
    mocks.updateCharacter.mockImplementation(async (_id, updater) => updater(owner));
    await renderDialog({ preferences, characters: [owner], onPreferencesChange });

    await click(buttonByLabel('删除标签 人物/魔女'));
    expect(document.body.textContent).toContain('将从 1 张角色卡上移除');
    expect(mocks.updateCharacter).not.toHaveBeenCalled();

    await click(buttonByText('确认删除'));
    expect(mocks.updateCharacter).toHaveBeenCalledTimes(1);
    expect(onPreferencesChange.mock.calls.at(-1)?.[0].customTags).not.toContain('人物/魔女');
  });
});
