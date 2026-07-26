import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openDB, closeDB } from '@/lib/idb';
import {
  parseBackupFile,
  previewBackup,
  importBackup,
  BackupError,
  MAX_BACKUP_BYTES,
  type ParsedBackup,
} from '@/lib/storage-utils';

// 每个用例用全新的内存 IndexedDB，并清掉模块级单例连接
beforeEach(() => {
  closeDB();
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
});

/** 轻量伪 File：parseBackupFile 只用到 name/type/size/text()，避免为超大用例真的分配内存 */
function fakeFile(name: string, type: string, size: number, text: string): File {
  return { name, type, size, text: async () => text } as unknown as File;
}

function jsonFile(obj: unknown): File {
  const text = JSON.stringify(obj);
  return fakeFile('backup.json', 'application/json', text.length, text);
}

function seed(store: string, item: Record<string, unknown>): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(item);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

function getAll(store: string): Promise<Record<string, unknown>[]> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db.transaction(store, 'readonly').objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result as Record<string, unknown>[]);
        req.onerror = () => reject(req.error);
      }),
  );
}

/** 一份最小但合法的完整备份（2.0 阶段5 起 books 退役，不再是备份的一部分） */
function validBackup(overrides: Record<string, unknown> = {}) {
  return {
    app: 'silly-tavern-explorer',
    version: 8,
    exportedAt: '2026-07-26T00:00:00.000Z',
    worldbooks: [{ id: 'w1', title: '世界书一' }],
    presets: [],
    cards: [],
    summaries: [],
    summaryTemplates: [],
    stories: [],
    characters: [],
    archiveStories: [],
    regexes: [],
    ...overrides,
  };
}

describe('parseBackupFile 校验', () => {
  it('拒绝非 .json 且非 json 类型的文件', async () => {
    const f = fakeFile('backup.png', 'image/png', 10, 'binary');
    await expect(parseBackupFile(f)).rejects.toBeInstanceOf(BackupError);
  });

  it('拒绝超过大小上限的文件（不读内容）', async () => {
    const f = fakeFile('huge.json', 'application/json', MAX_BACKUP_BYTES + 1, '{}');
    await expect(parseBackupFile(f)).rejects.toThrow(/过大/);
  });

  it('JSON 语法错误抛出可读的 BackupError（不崩溃）', async () => {
    const f = fakeFile('bad.json', 'application/json', 6, '{ bad }');
    await expect(parseBackupFile(f)).rejects.toThrow(/JSON 解析失败/);
  });

  it('拒绝缺少 app 标记的对象', async () => {
    const f = jsonFile({ worldbooks: [] });
    await expect(parseBackupFile(f)).rejects.toThrow(/app 标记|本应用/);
  });

  it('接受合法备份，并把缺省的旧版本字段容错为空数组', async () => {
    // 模拟只含 worldbooks 的老备份（books 等退役字段被忽略）
    const f = jsonFile({
      app: 'silly-tavern-explorer',
      version: 2,
      books: [{ id: 'b1', session: {} }],
      worldbooks: [{ id: 'w1' }],
    });
    const parsed = await parseBackupFile(f);
    expect(parsed.byStore.worldbooks).toHaveLength(1);
    expect(parsed.byStore.books).toBeUndefined(); // 书架已退役，旧备份里的 books 不进导入
    expect(parsed.byStore.stories).toEqual([]);
    expect(parsed.byStore.archiveStories).toEqual([]);
  });
});

describe('previewBackup 覆盖预览', () => {
  it('区分 新增 / 覆盖 / 跳过', async () => {
    await seed('worldbooks', { id: 'w1', title: '旧标题' }); // 将被覆盖
    const parsed = await parseBackupFile(
      jsonFile(
        validBackup({
          worldbooks: [
            { id: 'w1', title: '新标题' }, // overwrite（同 id）
            { id: 'w2', title: '全新' }, // add
            { id: '' }, // skipped（缺 id）
          ],
        }),
      ),
    );
    const preview = await previewBackup(parsed);
    const wbs = preview.stores.find((s) => s.key === 'worldbooks')!;
    expect(wbs).toMatchObject({ add: 1, overwrite: 1, skipped: 1 });
    expect(preview.totalOverwrite).toBe(1);
  });
});

describe('importBackup 原子写回', () => {
  it('upsert 合并：同 id 覆盖、异 id 新增、未提及的现有数据保留', async () => {
    await seed('worldbooks', { id: 'w1', title: '旧' });
    await seed('worldbooks', { id: 'keep', title: '保留' });
    const parsed = await parseBackupFile(
      jsonFile(
        validBackup({
          worldbooks: [
            { id: 'w1', title: '新' },
            { id: 'w2', title: '增' },
          ],
        }),
      ),
    );
    const counts = await importBackup(parsed);
    expect(counts.worldbooks).toBe(2);

    const wbs = await getAll('worldbooks');
    const byId = Object.fromEntries(wbs.map((w) => [w.id, w.title]));
    expect(byId).toEqual({ w1: '新', w2: '增', keep: '保留' });
  });

  it('跳过缺关键字段的无效条目，返回真实写入数', async () => {
    const parsed = await parseBackupFile(
      jsonFile(
        validBackup({
          archiveStories: [
            { id: 'ok', session: {} },
            { id: 'nope' }, // 缺 session → 跳过
          ],
        }),
      ),
    );
    const counts = await importBackup(parsed);
    expect(counts.archiveStories).toBe(1);
    expect(await getAll('archiveStories')).toHaveLength(1);
  });

  it('写入过程出错时整体回滚，现有数据保持不变', async () => {
    await seed('worldbooks', { id: 'existing', title: '原有' });
    // stories 里塞一个通过校验(有 id + nodes 数组)但含函数、不可结构化克隆的值 → put 同步抛错
    const parsed: ParsedBackup = {
      version: 8,
      byStore: {
        worldbooks: [{ id: 'neww', title: '本应回滚' }],
        stories: [{ id: 's1', nodes: [], evil: () => 1 } as unknown as Record<string, unknown>],
      },
    };
    await expect(importBackup(parsed)).rejects.toBeTruthy();

    // 关键：neww 不应写入（回滚），existing 仍在
    const wbs = await getAll('worldbooks');
    expect(wbs.map((w) => w.id).sort()).toEqual(['existing']);
  });
});

describe('备份 round-trip', () => {
  it('构造完整备份 → 导入 → 逐 store 读回内容一致', async () => {
    const backup = validBackup({
      worldbooks: [{ id: 'w1', title: '书', worldbook: { entries: {} } }],
      presets: [{ id: 'p1', title: '预设' }],
      cards: [{ id: 'c1', card: { name: '卡' } }],
      summaries: [{ id: 'sm1', content: '总结正文' }],
      summaryTemplates: [{ id: 't1', content: '模板正文' }],
      stories: [{ id: 'st1', nodes: [{ id: 'n1' }] }],
      characters: [{ id: 'ch1', name: '赫敏', card: { name: '赫敏' } }],
      archiveStories: [{ id: 'as1', title: '主线', session: { messages: [] } }],
      regexes: [{ id: 'rx1', title: '清理规则集', rules: [] }],
    });
    const parsed = await parseBackupFile(jsonFile(backup));
    const counts = await importBackup(parsed);

    expect(counts).toMatchObject({
      worldbooks: 1,
      presets: 1,
      cards: 1,
      summaries: 1,
      summaryTemplates: 1,
      stories: 1,
      characters: 1,
      archiveStories: 1,
      regexes: 1,
    });

    expect((await getAll('characters'))[0]).toMatchObject({ id: 'ch1', name: '赫敏' });
    expect((await getAll('archiveStories'))[0]).toMatchObject({ id: 'as1', title: '主线' });
    expect((await getAll('regexes'))[0]).toMatchObject({ id: 'rx1', title: '清理规则集' });
  });
});
