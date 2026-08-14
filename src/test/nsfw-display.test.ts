import { beforeEach, describe, expect, it } from 'vitest';
import {
  getHideUnusedLibraryTags,
  getNsfwBlur,
  setHideUnusedLibraryTags,
} from '@/lib/local-settings';
import { shouldBlurNsfw } from '@/lib/nsfw-display';

describe('NSFW 卡面展示规则', () => {
  beforeEach(() => localStorage.clear());

  it('默认设置开启时 NSFW 图片模糊，非 NSFW 或已揭示图片不模糊', () => {
    expect(getNsfwBlur()).toBe(true);
    expect(shouldBlurNsfw(true, getNsfwBlur(), false)).toBe(true);
    expect(shouldBlurNsfw(false, getNsfwBlur(), false)).toBe(false);
    expect(shouldBlurNsfw(true, getNsfwBlur(), true)).toBe(false);
  });

  it('关闭全局设置时三处图片都不应模糊', () => {
    localStorage.setItem('ste-nsfw-blur', '0');
    expect(shouldBlurNsfw(true, getNsfwBlur(), false)).toBe(false);
  });
});

describe('角色库标签显示偏好', () => {
  beforeEach(() => localStorage.clear());

  it('默认显示未使用标签，并可持久化隐藏选项', () => {
    expect(getHideUnusedLibraryTags()).toBe(false);
    setHideUnusedLibraryTags(true);
    expect(getHideUnusedLibraryTags()).toBe(true);
    setHideUnusedLibraryTags(false);
    expect(getHideUnusedLibraryTags()).toBe(false);
  });
});
