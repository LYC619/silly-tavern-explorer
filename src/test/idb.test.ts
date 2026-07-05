import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openDB, closeDB, DB_NAME, DB_VERSION, ALL_STORES } from '@/lib/idb';

// 每个用例用全新的内存 IndexedDB，并清掉模块级单例连接
beforeEach(() => {
  closeDB();
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
});

/** 用原生 API 造一个指定版本、只含部分 store 的库（模拟热更/中断升级遗留） */
function createPartialDB(version: number, stores: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, version);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of stores) {
        const s = db.createObjectStore(name, { keyPath: 'id' });
        s.createIndex('updatedAt', 'updatedAt', { unique: false });
        s.createIndex('title', 'title', { unique: false });
      }
    };
    req.onsuccess = () => {
      req.result.close();
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

describe('idb 公共连接层', () => {
  it('全新环境：建齐全部 store，版本为 DB_VERSION', async () => {
    const db = await openDB();
    expect(db.version).toBe(DB_VERSION);
    for (const name of ALL_STORES) {
      expect(db.objectStoreNames.contains(name)).toBe(true);
    }
  });

  it('重复调用返回同一连接（单例）', async () => {
    const a = await openDB();
    const b = await openDB();
    expect(b).toBe(a);
  });

  it('自愈：版本已到位但缺 store 时，以实际版本+1 补建', async () => {
    await createPartialDB(DB_VERSION, ['books', 'worldbooks']);
    const db = await openDB();
    expect(db.version).toBe(DB_VERSION + 1);
    for (const name of ALL_STORES) {
      expect(db.objectStoreNames.contains(name)).toBe(true);
    }
    // 补建后的 store 可正常开事务（原故障就是 transaction 抛 NotFoundError）
    const tx = db.transaction('summaries', 'readonly');
    expect(tx.objectStore('summaries')).toBeTruthy();
  });

  it('本地版本高于代码常量且缺 store：不降级打开并自愈到实际版本+1', async () => {
    await createPartialDB(DB_VERSION + 3, ['books']);
    const db = await openDB();
    expect(db.version).toBe(DB_VERSION + 4);
    for (const name of ALL_STORES) {
      expect(db.objectStoreNames.contains(name)).toBe(true);
    }
  });

  it('本地版本高于代码常量且 store 齐全：原样打开，不额外升级', async () => {
    await createPartialDB(DB_VERSION + 3, ALL_STORES);
    const db = await openDB();
    expect(db.version).toBe(DB_VERSION + 3);
    for (const name of ALL_STORES) {
      expect(db.objectStoreNames.contains(name)).toBe(true);
    }
  });
});
