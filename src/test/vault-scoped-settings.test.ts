/**
 * 按库隔离的偏好与 API 配置作用域（发布前一轮）。
 *
 * 背景：客户端整个应用跑在同一个 webview origin 上，localStorage 天然跨库共享。
 * 这组测试盯的是「换库之后不该看见上一个库的东西」，尤其是指向库内实体的键。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cfg = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  isTauri: vi.fn(() => true),
}));

vi.mock('@/lib/vault/tauri-fs', () => ({
  isTauri: cfg.isTauri,
  getAppConfig: vi.fn(async (key: string) => cfg.store.get(key) ?? null),
  setAppConfig: vi.fn(async (key: string, value: unknown) => { cfg.store.set(key, value); }),
}));

import { getCurrentVaultId, scopedGet, scopedKey, scopedSet, setCurrentVaultId } from '@/lib/vault/vault-scope';
import { isTourCompleted, resetAllTours, setTourCompleted } from '@/lib/tour-steps';
import { getEditorStoryId, setEditorStoryId } from '@/lib/editor-story-context';
import {
  getApiConfigScope,
  hydrateApiProfilesFromSystem,
  mirrorApiProfilesToSystem,
  setApiConfigScope,
} from '@/lib/vault/sensitive-config';

const PROFILES_KEY = 'st-beautifier-api-profiles';
const ACTIVE_KEY = 'st-beautifier-api-active-profile';

const profilesJson = (name: string) => JSON.stringify([{ id: 'p1', name, apiKey: `sk-${name}`, apiUrl: 'u', model: 'm' }]);

beforeEach(() => {
  localStorage.clear();
  cfg.store.clear();
  cfg.isTauri.mockReturnValue(true);
  setCurrentVaultId(null);
});

describe('偏好键的库作用域', () => {
  it('没有当前库时用原键名，保证网页版和旧数据照常可读', () => {
    expect(scopedKey('ste-current-editor-story-id')).toBe('ste-current-editor-story-id');
    expect(getCurrentVaultId()).toBeNull();
  });

  it('有当前库时带库后缀，两个库互不可见', () => {
    setCurrentVaultId('vault-aaa');
    scopedSet('k', 'A 的值');
    setCurrentVaultId('vault-bbb');
    expect(scopedGet('k')).toBeNull();
    scopedSet('k', 'B 的值');

    setCurrentVaultId('vault-aaa');
    expect(scopedGet('k')).toBe('A 的值');
    setCurrentVaultId('vault-bbb');
    expect(scopedGet('k')).toBe('B 的值');
  });

  it('空白库 id 视作没有库，不生成 "k@" 这种半截键', () => {
    setCurrentVaultId('   ');
    expect(getCurrentVaultId()).toBeNull();
    expect(scopedKey('k')).toBe('k');
  });
});

describe('新手引导按库重放', () => {
  it('在 A 库走完引导，新建的 B 库仍是从零开始', () => {
    setCurrentVaultId('vault-aaa');
    setTourCompleted('home');
    expect(isTourCompleted('home')).toBe(true);

    // 这正是用户要的「新建仓库测试从零开始的路径」：同一台机器上也能测。
    setCurrentVaultId('vault-bbb');
    expect(isTourCompleted('home')).toBe(false);
  });

  it('重置引导只影响当前库，并清掉升级前遗留的无后缀键', () => {
    localStorage.setItem('onboarding-home-completed', '1'); // 升级前的老数据
    setCurrentVaultId('vault-aaa');
    setTourCompleted('home');
    setCurrentVaultId('vault-bbb');
    setTourCompleted('home');

    setCurrentVaultId('vault-aaa');
    resetAllTours();
    expect(isTourCompleted('home')).toBe(false);
    expect(localStorage.getItem('onboarding-home-completed')).toBeNull();

    setCurrentVaultId('vault-bbb');
    expect(isTourCompleted('home')).toBe(true);
  });
});

describe('当前故事指针按库隔离', () => {
  it('换库后不会拿着上一个库的故事 id——那个 id 在新库里根本不存在', () => {
    setCurrentVaultId('vault-aaa');
    setEditorStoryId('story-in-a');
    expect(getEditorStoryId()).toBe('story-in-a');

    setCurrentVaultId('vault-bbb');
    expect(getEditorStoryId()).toBeNull();
  });
});

describe('API 配置的共享/独立作用域', () => {
  it('默认共享：读写系统配置的公共槽，与改动前行为一致', async () => {
    setCurrentVaultId('vault-aaa');
    cfg.store.set('apiProfiles', profilesJson('公共'));
    cfg.store.set('apiActiveProfile', 'p1');

    await expect(getApiConfigScope()).resolves.toBe('shared');
    await hydrateApiProfilesFromSystem();
    expect(localStorage.getItem(PROFILES_KEY)).toBe(profilesJson('公共'));
    expect(localStorage.getItem(ACTIVE_KEY)).toBe('p1');
  });

  it('首次切到「本库单独」时播种当前配置，不让 AI 功能突然失效', async () => {
    setCurrentVaultId('vault-aaa');
    localStorage.setItem(PROFILES_KEY, profilesJson('公共'));
    localStorage.setItem(ACTIVE_KEY, 'p1');

    await setApiConfigScope('vault');

    await expect(getApiConfigScope()).resolves.toBe('vault');
    const slots = cfg.store.get('apiProfilesByVault') as Record<string, { profiles: string }>;
    expect(slots['vault-aaa'].profiles).toBe(profilesJson('公共'));
    // 播种是复制而非共享：localStorage 里仍是可用配置。
    expect(localStorage.getItem(PROFILES_KEY)).toBe(profilesJson('公共'));
  });

  it('独立作用域下保存只写本库槽，不污染公共槽和别的库', async () => {
    setCurrentVaultId('vault-aaa');
    cfg.store.set('apiProfiles', profilesJson('公共'));
    await setApiConfigScope('vault');

    mirrorApiProfilesToSystem(profilesJson('A 专用'), 'p1');
    await vi.waitFor(() => {
      const slots = cfg.store.get('apiProfilesByVault') as Record<string, { profiles: string }>;
      expect(slots['vault-aaa'].profiles).toBe(profilesJson('A 专用'));
    });
    expect(cfg.store.get('apiProfiles')).toBe(profilesJson('公共'));
    expect((cfg.store.get('apiProfilesByVault') as Record<string, unknown>)['vault-bbb']).toBeUndefined();
  });

  it('B 库仍用公共配置，看不到 A 库的独立密钥', async () => {
    cfg.store.set('apiProfiles', profilesJson('公共'));
    cfg.store.set('apiProfilesByVault', { 'vault-aaa': { profiles: profilesJson('A 专用'), active: 'p1' } });
    cfg.store.set('apiScopeByVault', { 'vault-aaa': 'vault' });

    setCurrentVaultId('vault-bbb');
    await hydrateApiProfilesFromSystem();
    expect(localStorage.getItem(PROFILES_KEY)).toBe(profilesJson('公共'));

    setCurrentVaultId('vault-aaa');
    await hydrateApiProfilesFromSystem();
    expect(localStorage.getItem(PROFILES_KEY)).toBe(profilesJson('A 专用'));
  });

  it('切回共享后本库那份仍留着，能再切回去', async () => {
    setCurrentVaultId('vault-aaa');
    cfg.store.set('apiProfiles', profilesJson('公共'));
    localStorage.setItem(PROFILES_KEY, profilesJson('A 专用'));
    await setApiConfigScope('vault');

    await setApiConfigScope('shared');
    expect(localStorage.getItem(PROFILES_KEY)).toBe(profilesJson('公共'));

    await setApiConfigScope('vault');
    expect(localStorage.getItem(PROFILES_KEY)).toBe(profilesJson('A 专用'));
  });

  it('独立作用域但本库槽是空的：显示未配置，而不是偷偷回落到公共密钥', async () => {
    cfg.store.set('apiProfiles', profilesJson('公共'));
    cfg.store.set('apiScopeByVault', { 'vault-aaa': 'vault' });
    localStorage.setItem(PROFILES_KEY, profilesJson('残留'));

    setCurrentVaultId('vault-aaa');
    await hydrateApiProfilesFromSystem();

    expect(localStorage.getItem(PROFILES_KEY)).toBeNull();
  });

  it('尚未选库时拒绝写按库作用域，避免落到一个没有主人的槽里', async () => {
    setCurrentVaultId(null);
    await expect(setApiConfigScope('vault')).rejects.toThrow('尚未选择文件库');
  });

  it('网页版全程空操作：只有一个库，没有可隔离的对象', async () => {
    cfg.isTauri.mockReturnValue(false);
    setCurrentVaultId('vault-aaa');

    await expect(getApiConfigScope()).resolves.toBe('shared');
    await hydrateApiProfilesFromSystem();
    mirrorApiProfilesToSystem(profilesJson('x'), 'p1');

    expect(localStorage.getItem(PROFILES_KEY)).toBeNull();
    expect(cfg.store.size).toBe(0);
  });
});
