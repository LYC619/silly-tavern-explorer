import { afterEach, describe, expect, it } from 'vitest';
import type { BaseRecord, Repo } from '@/lib/repo';
import {
  saveArchiveStory,
  saveLibraryTagPreferences,
  setArchiveSchemaVersion,
} from '@/lib/archive-db';
import { setActiveVault } from '@/lib/vault/active';
import type { VaultBackend } from '@/lib/vault/vault-backend';
import type { ArchiveStory } from '@/types/archive';

function story(id: string): ArchiveStory {
  return {
    id,
    title: id,
    session: {
      id,
      title: id,
      messages: [],
      character: { name: '角色' },
      user: { name: '用户' },
      createdAt: 1,
    },
    markers: [],
    meta: { modelsUsed: [], lastModel: undefined, playTimeMs: null },
    createdAt: 1,
    updatedAt: 1,
  } as ArchiveStory;
}

function vaultFor(repo: Repo<ArchiveStory>): VaultBackend {
  return {
    repo: <T extends { id: string; updatedAt: number }>() => repo as unknown as Repo<T>,
    fs: {} as VaultBackend['fs'],
    pathOf: async () => undefined,
  };
}

interface ArchiveMetaRecord extends BaseRecord {
  schemaVersion: number;
  libraryTags?: {
    version: 1;
    customTags: string[];
    order: string[];
    hidden: string[];
  };
}

function metaVaultFor(repo: Repo<ArchiveMetaRecord>): VaultBackend {
  return {
    repo: <T extends BaseRecord>() => repo as unknown as Repo<T>,
    fs: {} as VaultBackend['fs'],
    pathOf: async () => undefined,
  };
}

afterEach(() => setActiveVault(null));

describe('多库切换写入隔离', () => {
  it('排队写入绑定入队时的库，不会在切库后落到新库', async () => {
    let releaseFirst!: () => void;
    let firstStarted!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const started = new Promise<void>((resolve) => { firstStarted = resolve; });
    const oldPuts: ArchiveStory[] = [];
    const newPuts: ArchiveStory[] = [];

    const oldRepo = {
      list: async () => [],
      listLight: async () => [],
      get: async () => undefined,
      put: async (item: ArchiveStory) => {
        if (oldPuts.length === 0) firstStarted();
        await firstGate;
        oldPuts.push(item);
      },
      remove: async () => {},
    } satisfies Repo<ArchiveStory>;
    const newRepo = {
      list: async () => [],
      listLight: async () => [],
      get: async () => undefined,
      put: async (item: ArchiveStory) => { newPuts.push(item); },
      remove: async () => {},
    } satisfies Repo<ArchiveStory>;

    setActiveVault(vaultFor(oldRepo));
    const first = saveArchiveStory(story('queued-1'));
    await started;
    const second = saveArchiveStory(story('queued-2'));
    setActiveVault(vaultFor(newRepo));
    releaseFirst();

    await Promise.all([first, second]);
    expect(oldPuts.map((item) => item.id)).toEqual(['queued-1', 'queued-2']);
    expect(newPuts).toHaveLength(0);
  });

  it('排队的元信息更新绑定旧库，并合并不同字段的并发修改', async () => {
    let releaseFirst!: () => void;
    let firstStarted!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const started = new Promise<void>((resolve) => { firstStarted = resolve; });
    let oldRecord: ArchiveMetaRecord | undefined;
    let newRecord: ArchiveMetaRecord | undefined;
    let oldPutCount = 0;

    const oldRepo = {
      list: async () => oldRecord ? [oldRecord] : [],
      listLight: async () => oldRecord ? [oldRecord] : [],
      get: async () => oldRecord,
      put: async (item: ArchiveMetaRecord) => {
        oldPutCount += 1;
        if (oldPutCount === 1) {
          firstStarted();
          await firstGate;
        }
        oldRecord = structuredClone(item);
      },
      remove: async () => { oldRecord = undefined; },
    } satisfies Repo<ArchiveMetaRecord>;
    const newRepo = {
      list: async () => newRecord ? [newRecord] : [],
      listLight: async () => newRecord ? [newRecord] : [],
      get: async () => newRecord,
      put: async (item: ArchiveMetaRecord) => { newRecord = structuredClone(item); },
      remove: async () => { newRecord = undefined; },
    } satisfies Repo<ArchiveMetaRecord>;

    setActiveVault(metaVaultFor(oldRepo));
    const schemaWrite = setArchiveSchemaVersion(18);
    await started;
    const preferencesWrite = saveLibraryTagPreferences({
      version: 1,
      customCategories: ['历史'],
      customTags: ['历史/三国'],
      categoryOrder: ['历史'],
      order: ['历史/三国'],
      hidden: [],
    });
    setActiveVault(metaVaultFor(newRepo));
    releaseFirst();

    await Promise.all([schemaWrite, preferencesWrite]);
    expect(oldRecord).toMatchObject({
      id: 'archive-schema',
      schemaVersion: 18,
      libraryTags: {
        customTags: ['历史/三国'],
        order: ['历史/三国'],
      },
    });
    expect(newRecord).toBeUndefined();
  });
});
