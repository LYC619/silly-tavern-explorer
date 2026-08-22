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

export interface PutOptions {
  /**
   * 本次改动没有碰到「派生产物的来源字段」——角色的 `pngBase64`、故事的 `session`/`branches`。
   *
   * 文件库据此跳过重写 卡片.png / 聊天.jsonl / 分支·*.jsonl。这些文件是纯派生的
   * （故事.json 与 档案.json 才是真源，派生文件只写不读），来源没变就没有重写的理由；
   * 而「打开故事页盖一个 lastViewedAt」原本会把整个故事文件夹连同每条分支重新序列化一遍，
   * 上百楼的故事里这是打开页面最贵的一步，且每次访问角色页都会重写整张卡 PNG。
   *
   * 只有在**确定**来源字段没变时才传 true（`updateCharacter`/`updateArchiveStory`
   * 用引用比较判断，patch 没碰就是没碰）。传错会让派生的 ST 工作版落后于真源。
   */
  derivedUnchanged?: boolean;
}

export interface Repo<T extends BaseRecord> {
  /** 全量列表，按 updatedAt 降序（与旧各 getAllX 行为一致） */
  list(): Promise<T[]>;
  /**
   * 列表投影：排序与条目数同 list()，但返回的记录**可能缺少大字段**
   * （文件库后端会跳过角色卡面 PNG、剥掉故事正文）。
   *
   * 只给「拿元信息渲染列表」的调用方用，且必须经 `lib/archive-index` 收敛成不含大字段的窄类型——
   * 直接把这里的记录当完整记录写回会抹掉 PNG / 正文。要完整记录一律走 list()/get()。
   * IDB 后端省不掉（getAll 本来就是整条取出），等价于 list()。
   */
  listLight(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  put(item: T, opts?: PutOptions): Promise<void>;
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
  const list = async () => {
    const items = (await request((await store('readonly')).getAll())) as T[];
    return items.sort((a, b) => b.updatedAt - a.updatedAt);
  };
  return {
    list,
    // IDB 没有字段投影，getAll 一次就是整条；省不掉，与 list 同源。
    listLight: list,
    async get(id) {
      return (await request((await store('readonly')).get(id))) as T | undefined;
    },
    // IDB 整条记录一次写入，没有派生文件，PutOptions 对它无意义
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
