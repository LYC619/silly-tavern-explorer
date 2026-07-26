/**
 * 统一存储仓库层（2.0 阶段0）。
 *
 * 现有 7 个 object store 的 CRUD 完全同构（keyPath 'id'、updatedAt 降序列表、
 * autoSaved 双轨修剪），此前散在 6 个 *-db.ts 里重复实现。此处收敛为一个泛型工厂；
 * 各 *-db.ts 保持原有导出签名不变，内部委托到这里。
 *
 * Repo 接口同时是未来客户端「明文文件库」后端的实现契约（设计定稿第八章）：
 * 阶段7 的 FileVault 实现同一接口后，上层代码不感知存储介质切换。
 */
import { openDB, type StoreName } from '@/lib/idb';

/** 所有持久化条目的公共形状（现有 7 个 store 均满足） */
export interface BaseRecord {
  id: string;
  updatedAt: number;
}

export interface Repo<T extends BaseRecord> {
  /** 全量列表，按 updatedAt 降序（与旧各 getAllX 行为一致） */
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  put(item: T): Promise<void>;
  remove(id: string): Promise<void>;
}

function request<R>(req: IDBRequest<R>): Promise<R> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function createIdbRepo<T extends BaseRecord>(storeName: StoreName): Repo<T> {
  const store = async (mode: IDBTransactionMode) => {
    const db = await openDB();
    return db.transaction(storeName, mode).objectStore(storeName);
  };
  return {
    async list() {
      const items = (await request((await store('readonly')).getAll())) as T[];
      return items.sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async get(id) {
      return (await request((await store('readonly')).get(id))) as T | undefined;
    },
    async put(item) {
      await request((await store('readwrite')).put(item));
    },
    async remove(id) {
      await request((await store('readwrite')).delete(id));
    },
  };
}

/**
 * 只保留最近 `keep` 份「自动保留」(autoSaved) 条目，超出的按 updatedAt 由旧到新删除。
 * 用户手动保存(autoSaved 非 true)的不受影响。返回被删除的 id 数组。
 */
export async function pruneAutoSaved<T extends BaseRecord & { autoSaved?: boolean }>(
  repo: Repo<T>,
  keep: number,
): Promise<string[]> {
  const all = await repo.list(); // 已按 updatedAt 降序
  const toDelete = all.filter((i) => i.autoSaved).slice(keep); // 第 keep 份之后的（更旧的）
  await Promise.all(toDelete.map((i) => repo.remove(i.id)));
  return toDelete.map((i) => i.id);
}
