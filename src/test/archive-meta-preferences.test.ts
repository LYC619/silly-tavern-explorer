import { afterEach, describe, expect, it } from 'vitest';
import {
  getArchiveSchemaVersion,
  getLibraryTagPreferences,
  saveLibraryTagPreferences,
  setArchiveSchemaVersion,
} from '@/lib/archive-db';
import { normalizeLibraryTagPreferences } from '@/lib/library-tag-preferences';
import { setActiveVault } from '@/lib/vault/active';
import { createVault } from '@/lib/vault/vault-backend';
import { createMemFs } from '@/lib/vault/fs';

afterEach(() => setActiveVault(null));

describe('archive metadata library tag preferences', () => {
  it('标签配置与 schema 版本合并写入同一库信息记录并可重开读取', async () => {
    const fs = createMemFs();
    setActiveVault(createVault(fs));
    await setArchiveSchemaVersion(12);
    await saveLibraryTagPreferences(normalizeLibraryTagPreferences({
      version: 1,
      customTags: ['世界观/蒸汽朋克'],
      order: ['世界观/蒸汽朋克'],
      hidden: ['人物/少女'],
    }));
    await setArchiveSchemaVersion(13);

    const raw = JSON.parse(await fs.readText('库信息.json'));
    expect(raw.schemaVersion).toBe(13);
    expect(raw.libraryTags.customTags).toEqual(['世界观/蒸汽朋克']);

    setActiveVault(createVault(fs));
    expect(await getArchiveSchemaVersion()).toBe(13);
    expect(await getLibraryTagPreferences()).toMatchObject({
      customTags: ['世界观/蒸汽朋克'],
      order: ['世界观/蒸汽朋克'],
      hidden: ['人物/少女'],
    });
  });

  it('不同文件库保留各自的标签定义与显隐设置', async () => {
    const privateFs = createMemFs();
    const demoFs = createMemFs();

    setActiveVault(createVault(privateFs));
    await saveLibraryTagPreferences(normalizeLibraryTagPreferences({
      version: 1,
      customTags: ['私人'],
      order: ['私人'],
      hidden: [],
    }));

    setActiveVault(createVault(demoFs));
    expect((await getLibraryTagPreferences()).customTags).toEqual([]);
    await saveLibraryTagPreferences(normalizeLibraryTagPreferences({
      version: 1,
      customTags: ['演示'],
      order: ['演示'],
      hidden: ['人物/少女'],
    }));

    setActiveVault(createVault(privateFs));
    expect((await getLibraryTagPreferences()).customTags).toEqual(['私人']);
    expect((await getLibraryTagPreferences()).hidden).toEqual([]);
  });

  it('schema 版本与标签偏好并发写入串行落盘，不互相覆盖', async () => {
    const fs = createMemFs();
    setActiveVault(createVault(fs));
    await Promise.all([
      setArchiveSchemaVersion(21),
      saveLibraryTagPreferences(normalizeLibraryTagPreferences({
        version: 1,
        customTags: ['我的收藏'],
        order: [],
        hidden: [],
      })),
    ]);

    const raw = JSON.parse(await fs.readText('库信息.json'));
    expect(raw.schemaVersion).toBe(21);
    expect(raw.libraryTags.customTags).toEqual(['我的收藏']);
  });
});
