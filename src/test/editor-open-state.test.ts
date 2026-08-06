import { afterEach, describe, expect, it } from 'vitest';
import { getEditorOpen, setEditorOpenState } from '@/lib/editor-open-state';

afterEach(() => setEditorOpenState(false));

describe('编辑区展开状态', () => {
  it('模块状态在 AppLayout 重挂后仍保留', () => {
    setEditorOpenState(true);
    expect(getEditorOpen()).toBe(true);
  });
});
