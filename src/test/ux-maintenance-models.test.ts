import { describe, expect, it } from 'vitest';
import { THEMES, themeSwatchBackground } from '@/lib/theme';
import { NAV_AREAS, findNavArea } from '@/lib/navigation-model';
import {
  EDITOR_TOOL_COPY,
  HOME_RECENT_STORY_VISIBLE_COUNT,
  homeRecentStoryMaxHeightRem,
  storyWorkspaceViewForEditorFocus,
} from '@/lib/home-layout';
import { shouldAutoCollapse } from '@/hooks/use-sidenav-state';
import {
  activateVaultProfile,
  createEmptyVaultRegistry,
  upsertVaultProfile,
} from '@/lib/vault/vault-registry';

describe('维护阶段 UX 规则模型', () => {
  it('主题缩略图保留可辨识的特征色，而不是三个近黑圆点', () => {
    expect(new Set(THEMES.slice(0, 3).map((theme) => theme.swatchAccent)).size).toBe(3);
    for (const theme of THEMES) {
      expect(themeSwatchBackground(theme)).toContain('linear-gradient');
    }
  });

  it('导航按四个一级区域组织，并包含要求的子界面', () => {
    expect(NAV_AREAS.map((area) => area.key)).toEqual(['home', 'characters', 'editor', 'assets']);
    const labels = NAV_AREAS.flatMap((area) => area.children.map((item) => item.label));
    expect(labels).toEqual(expect.arrayContaining(['聊天处理', '总结', '故事树', '角色卡', '预设', '正则', '其他']));
    expect(findNavArea('/assets', '?tab=worldbook')?.key).toBe('assets');
    expect(findNavArea('/library', '')?.key).toBe('characters');
  });

  it('离开首页才触发自动折叠，非首页之间切换不强制覆盖用户选择', () => {
    expect(shouldAutoCollapse('/', '/library')).toBe(true);
    expect(shouldAutoCollapse('/', '/settings')).toBe(true);
    expect(shouldAutoCollapse('/library', '/settings')).toBe(false);
    expect(shouldAutoCollapse('/', '/')).toBe(false);
  });

  it('首页故事区只保证三条首屏空间，更多内容交给内部滚动', () => {
    expect(HOME_RECENT_STORY_VISIBLE_COUNT).toBe(3);
    expect(homeRecentStoryMaxHeightRem()).toBe(11.5);
    expect(EDITOR_TOOL_COPY.chat).toContain('聊天');
    expect(EDITOR_TOOL_COPY.chat).toContain('正则');
  });

  it('多库注册按路径去重，激活只改变活动库标识', () => {
    const first = createEmptyVaultRegistry();
    const one = upsertVaultProfile(first, 'D:/demo', '演示库');
    const duplicate = upsertVaultProfile(one.registry, 'D:/demo/', '改名');
    expect(duplicate.registry.vaults).toHaveLength(1);
    expect(duplicate.profile.id).toBe(one.profile.id);
    const second = upsertVaultProfile(duplicate.registry, 'D:/private', '私人库');
    const active = activateVaultProfile(second.registry, second.profile.id);
    expect(active.activeId).toBe(second.profile.id);
    expect(active.vaults).toHaveLength(2);
  });

  it('总结和故事树入口能把用户带入对应故事工作台视图', () => {
    expect(storyWorkspaceViewForEditorFocus('summary')).toBe('volume');
    expect(storyWorkspaceViewForEditorFocus('story-tree')).toBe('tree');
    expect(storyWorkspaceViewForEditorFocus(null)).toBeNull();
  });
});
